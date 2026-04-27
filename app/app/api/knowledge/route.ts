import { NextRequest, NextResponse } from 'next/server'
import { handleError } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess } from '@/server/authz'
import { notFound } from '@/server/errors'
import { parseBody, parseQuery } from '@/server/validate'
import { db } from '@/lib/db'
import { knowledgeService } from '@/services/knowledge'
import { brainService } from '@/services/brain'
import { and, eq } from 'drizzle-orm'
import { heartbeatRuns, agents } from '@paperclipai/db'
import { z } from 'zod'

export const maxDuration = 30

const createKnowledgeSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  agentId: z.string().optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  pinned: z.boolean().optional(),
  sourceType: z.string().optional(),
  sourceRef: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
})

const updateKnowledgeSchema = createKnowledgeSchema.partial()

const knowledgeListQuerySchema = z.object({
  companyId: z.string().min(1),
  agentId: z.string().optional(),
  category: z.string().optional(),
  pinned: z.string().optional(),
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
})

const knowledgeSearchQuerySchema = z.object({
  companyId: z.string().min(1),
  q: z.string().min(1),
  agentId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
})

export async function GET(req: NextRequest) {
  try {
    const actor = await resolveActor(req)
    const { searchParams } = req.nextUrl

    const companyId = searchParams.get('companyId')
    if (!companyId) {
      return NextResponse.json({ error: 'companyId query param required' }, { status: 400 })
    }
    assertCompanyAccess(actor, companyId)

    const knowledge = knowledgeService(db)
    const endpoint = searchParams.get('endpoint')

    if (endpoint === 'search') {
      const query = parseQuery(req, knowledgeSearchQuerySchema)
      const rows = await knowledge.search(query.companyId, query.q, {
        agentId: query.agentId,
        limit: query.limit,
      })
      return NextResponse.json(rows)
    }

    if (endpoint === 'categories') {
      const categories = await knowledge.distinctCategories(companyId)
      return NextResponse.json(categories)
    }

    if (endpoint === 'injections') {
      const runId = searchParams.get('runId')
      if (!runId) {
        return NextResponse.json({ error: 'runId query param required' }, { status: 400 })
      }
      const injections = await knowledge.getInjectionsForRun(runId)
      return NextResponse.json(injections)
    }

    const entryId = searchParams.get('entryId')
    if (entryId) {
      const entry = await knowledge.getById(companyId, entryId)
      if (!entry) throw notFound('Knowledge entry not found')
      return NextResponse.json(entry)
    }

    // List (default)
    const query = parseQuery(req, knowledgeListQuerySchema)
    const rows = await knowledge.list({
      companyId: query.companyId,
      agentId: query.agentId,
      category: query.category,
      pinned: query.pinned === 'true' ? true : query.pinned === 'false' ? false : undefined,
      q: query.q,
      limit: query.limit,
      offset: query.offset,
    })
    return NextResponse.json(rows)
  } catch (err) {
    return handleError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await resolveActor(req)
    const { searchParams } = req.nextUrl

    const companyId = searchParams.get('companyId')
    if (!companyId) {
      return NextResponse.json({ error: 'companyId query param required' }, { status: 400 })
    }
    assertCompanyAccess(actor, companyId)

    const endpoint = searchParams.get('endpoint')
    const knowledge = knowledgeService(db)

    if (endpoint === 'extract-from-run') {
      const runId = searchParams.get('runId')
      if (!runId) {
        return NextResponse.json({ error: 'runId query param required' }, { status: 400 })
      }
      const brain = brainService(db)

      const [run] = await db
        .select()
        .from(heartbeatRuns)
        .where(and(eq(heartbeatRuns.id, runId), eq(heartbeatRuns.companyId, companyId)))
        .limit(1)

      if (!run) {
        return NextResponse.json({ error: 'Run not found' }, { status: 404 })
      }

      const [agent] = await db
        .select({ name: agents.name, role: agents.role })
        .from(agents)
        .where(eq(agents.id, run.agentId))
        .limit(1)

      const result = await brain.forceExtract({
        id: run.id,
        companyId: run.companyId,
        agentId: run.agentId,
        agentName: agent?.name,
        agentRole: agent?.role,
        stdoutExcerpt: run.stdoutExcerpt,
        resultJson: run.resultJson as Record<string, unknown> | null,
        contextSnapshot: run.contextSnapshot as Record<string, unknown> | null,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
        usageJson: run.usageJson as Record<string, unknown> | null,
      })
      return NextResponse.json(result)
    }

    // Create knowledge entry (default)
    const body = await parseBody(req, createKnowledgeSchema)
    const { title, content, agentId, category, tags, pinned, sourceType, sourceRef, metadata } = body

    const entry = await knowledge.create({
      companyId,
      agentId: agentId ?? null,
      title,
      content,
      category: category ?? null,
      tags: tags ?? [],
      pinned: pinned ?? false,
      sourceType: sourceType ?? 'manual',
      sourceRef: sourceRef ?? null,
      metadata: metadata ?? null,
    })
    return NextResponse.json(entry, { status: 201 })
  } catch (err) {
    return handleError(err)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const actor = await resolveActor(req)
    const { searchParams } = req.nextUrl

    const companyId = searchParams.get('companyId')
    if (!companyId) {
      return NextResponse.json({ error: 'companyId query param required' }, { status: 400 })
    }
    assertCompanyAccess(actor, companyId)

    const entryId = searchParams.get('entryId')
    if (!entryId) {
      return NextResponse.json({ error: 'entryId query param required' }, { status: 400 })
    }

    const body = await parseBody(req, updateKnowledgeSchema)
    const knowledge = knowledgeService(db)
    const updated = await knowledge.update(companyId, entryId, body)
    if (!updated) throw notFound('Knowledge entry not found')
    return NextResponse.json(updated)
  } catch (err) {
    return handleError(err)
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const actor = await resolveActor(req)
    const { searchParams } = req.nextUrl

    const companyId = searchParams.get('companyId')
    if (!companyId) {
      return NextResponse.json({ error: 'companyId query param required' }, { status: 400 })
    }
    assertCompanyAccess(actor, companyId)

    const entryId = searchParams.get('entryId')
    if (!entryId) {
      return NextResponse.json({ error: 'entryId query param required' }, { status: 400 })
    }

    const knowledge = knowledgeService(db)
    const deleted = await knowledge.delete(companyId, entryId)
    if (!deleted) throw notFound('Knowledge entry not found')
    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleError(err)
  }
}
