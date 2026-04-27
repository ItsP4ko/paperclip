import { NextRequest, NextResponse } from 'next/server'
import { agents } from '@paperclipai/db'
import { resolveActor } from '@/server/actor'
import { assertBoard } from '@/server/authz'
import { handleError } from '@/server/errors'
import { db } from '@/lib/db'
import { heartbeatService } from '@/services/index'
import { subscribeCompanyLiveEvents, subscribeGlobalLiveEvents } from '@/services/live-events'

export const maxDuration = 30

async function resolveCompanyIds(companyIds: string[] | undefined, isAdmin: boolean): Promise<string[]> {
  if (!isAdmin) return companyIds ?? []
  if ((companyIds ?? []).length > 0) return companyIds!
  const rows = await db.selectDistinct({ companyId: agents.companyId }).from(agents)
  return rows.map((r) => r.companyId)
}

export async function GET(req: NextRequest) {
  try {
    const actor = await resolveActor(req)
    assertBoard(actor)
    const isAdmin = !!(actor.isInstanceAdmin || actor.source === 'local_implicit')
    const companyIds = await resolveCompanyIds(actor.companyIds, isAdmin)
    const heartbeat = heartbeatService(db)

    const encoder = new TextEncoder()
    let closed = false

    const stream = new ReadableStream({
      async start(controller) {
        const enqueue = (text: string) => {
          if (!closed) controller.enqueue(encoder.encode(text))
        }

        enqueue(':ok\n\n')

        const pushJobs = async () => {
          if (closed) return
          try {
            const jobs = await heartbeat.listPendingLocalRuns(companyIds)
            enqueue(`data: ${JSON.stringify(jobs)}\n\n`)
          } catch { /* best-effort */ }
        }

        await pushJobs()

        const keepaliveInterval = setInterval(() => {
          if (!closed) enqueue(':keepalive\n\n')
        }, 30_000)

        const unsubs: Array<() => void> = []
        const handleEvent = (event: { type: string }) => {
          if (event.type === 'runner.jobs.pending') void pushJobs()
        }

        if (isAdmin && companyIds.length === 0) {
          unsubs.push(subscribeGlobalLiveEvents(handleEvent))
        } else {
          for (const cid of companyIds) {
            unsubs.push(subscribeCompanyLiveEvents(cid, handleEvent))
          }
        }

        req.signal.addEventListener('abort', () => {
          closed = true
          clearInterval(keepaliveInterval)
          for (const unsub of unsubs) unsub()
          try { controller.close() } catch { /* ignore */ }
        })
      },
    })

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (err) {
    return handleError(err)
  }
}
