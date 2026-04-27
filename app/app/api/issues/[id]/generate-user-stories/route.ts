import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import mammoth from 'mammoth'
import { eq } from 'drizzle-orm'
import { issues, projects, projectDocuments, assets } from '@paperclipai/db'
import { resolveActor } from '@/server/actor'
import { assertBoard, assertCompanyAccess } from '@/server/authz'
import { handleError } from '@/server/errors'
import { db } from '@/lib/db'
import { createStorageService } from '@/lib/storage'

export const maxDuration = 120

const GEMINI_MODEL = 'gemini-2.5-flash-lite'

function getGeminiClient(): GoogleGenerativeAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim()
  if (!apiKey || apiKey === 'your-gemini-api-key-here') {
    throw new Error('GEMINI_API_KEY is not configured')
  }
  return new GoogleGenerativeAI(apiKey)
}

const USER_STORIES_PROMPT = (
  projectContext: string,
  docsContext: string,
  issueTitle: string,
  issueDescription: string,
) => `
${projectContext ? `Info del Proyecto:\n${projectContext}\n\n` : ''}${docsContext ? `Documentos de referencia del proyecto:\n${docsContext}\n\n` : ''}Tarea:
Título: ${issueTitle}
Descripción: ${issueDescription || '(sin descripción)'}

Generá entre 3 y 5 historias de usuario para esta tarea.
Para cada historia devuelve un objeto JSON con:
- title: string (formato: "Como [usuario], quiero [acción] para [beneficio]")
- description: string (criterios de aceptación en formato bullet list markdown)

Responde ÚNICAMENTE con un array JSON válido, sin texto adicional ni bloques de código.
Ejemplo: [{"title":"Como usuario, quiero...","description":"- Criterio 1\\n- Criterio 2"}]
`

async function extractJsonArray(text: string): Promise<unknown[]> {
  const cleaned = text.trim().replace(/^```json\n?/, '').replace(/\n?```$/, '').trim()
  const parsed = JSON.parse(cleaned)
  if (!Array.isArray(parsed)) throw new Error('Expected JSON array')
  return parsed
}

async function extractTextFromBuffer(buffer: Buffer, contentType: string): Promise<string> {
  if (contentType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const result = await mammoth.extractRawText({ buffer })
    return result.value
  }
  if (contentType === 'application/pdf') {
    return ''
  }
  return buffer.toString('utf-8')
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await resolveActor(req)
    assertBoard(actor)
    const { id } = await params

    const [issue] = await db
      .select({
        id: issues.id,
        title: issues.title,
        description: issues.description,
        companyId: issues.companyId,
        projectId: issues.projectId,
      })
      .from(issues)
      .where(eq(issues.id, id))
      .limit(1)

    if (!issue) return NextResponse.json({ error: 'Issue not found' }, { status: 404 })
    assertCompanyAccess(actor, issue.companyId)

    const project = issue.projectId
      ? await db
          .select({ id: projects.id, aiContext: projects.aiContext })
          .from(projects)
          .where(eq(projects.id, issue.projectId))
          .limit(1)
          .then((r) => r[0] ?? null)
      : null

    // Fetch project documents and extract text for context
    let docsContext = ''
    if (issue.projectId) {
      try {
        const storage = createStorageService()
        const docs = await db
          .select({
            assetId: projectDocuments.assetId,
            objectKey: assets.objectKey,
            originalFilename: assets.originalFilename,
            contentType: assets.contentType,
          })
          .from(projectDocuments)
          .innerJoin(assets, eq(projectDocuments.assetId, assets.id))
          .where(eq(projectDocuments.projectId, issue.projectId))
          .limit(50)

        const textParts = (
          await Promise.all(
            docs.map(async (doc) => {
              try {
                const obj = await storage.getObject(issue.companyId, doc.objectKey)
                const chunks: Buffer[] = []
                for await (const chunk of obj.stream) chunks.push(Buffer.from(chunk as Uint8Array))
                const buf = Buffer.concat(chunks)
                const text = await extractTextFromBuffer(buf, doc.contentType ?? '')
                if (text.trim()) {
                  return `--- ${doc.originalFilename ?? doc.assetId} ---\n${text.slice(0, 4000)}`
                }
              } catch {
                // skip unreadable doc
              }
              return null
            }),
          )
        ).filter((part): part is string => part !== null)
        if (textParts.length > 0) docsContext = textParts.join('\n\n')
      } catch {
        // non-fatal: proceed without docs context
      }
    }

    let genAI: GoogleGenerativeAI
    try {
      genAI = getGeminiClient()
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 503 })
    }

    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL })
    const prompt = USER_STORIES_PROMPT(
      project?.aiContext ?? '',
      docsContext,
      issue.title,
      issue.description ?? '',
    )

    const response = await model.generateContent(prompt)
    const text = response.response.text()
    const rawStories = await extractJsonArray(text)

    const userStories = rawStories.slice(0, 5).map((s: unknown) => {
      const story = s as Record<string, unknown>
      return {
        title: String(story.title ?? ''),
        description: String(story.description ?? ''),
      }
    })

    return NextResponse.json({ userStories })
  } catch (err) {
    console.error('[gemini] generate-user-stories error:', err)
    return handleError(err)
  }
}
