import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import mammoth from 'mammoth'
import { resolveActor } from '@/server/actor'
import { assertBoard, assertCompanyAccess } from '@/server/authz'
import { handleError } from '@/server/errors'

export const maxDuration = 120

const GEMINI_MODEL = 'gemini-2.5-flash-lite'
const MAX_FILE_BYTES = 20 * 1024 * 1024 // 20 MB

const AUDIO_MIME_TYPES = new Set([
  'audio/mpeg',
  'audio/wav',
  'audio/mp4',
  'audio/x-m4a',
  'audio/ogg',
  'audio/webm',
  'audio/flac',
  'audio/aiff',
])

function isAudio(mimetype: string): boolean {
  return AUDIO_MIME_TYPES.has(mimetype)
}

function getGeminiClient(): GoogleGenerativeAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim()
  if (!apiKey || apiKey === 'your-gemini-api-key-here') {
    throw new Error('GEMINI_API_KEY is not configured')
  }
  return new GoogleGenerativeAI(apiKey)
}

const TASK_EXTRACTION_PROMPT = `
Analiza el siguiente documento y extrae entre 3 y 15 tareas de desarrollo concretas.
Para cada tarea devuelve un objeto JSON con:
- title: string (máximo 120 caracteres, en español)
- description: string (descripción detallada en formato markdown, en español)
- priority: "low" | "medium" | "high" | "critical"

Responde ÚNICAMENTE con un array JSON válido, sin texto adicional ni bloques de código.
Ejemplo de formato esperado:
[{"title":"...","description":"...","priority":"medium"}]
`

const AUDIO_ANALYSIS_PROMPT = `
Vas a recibir un archivo de audio. Seguí estos pasos en orden:

PASO 1 — TRANSCRIBIR (obligatorio siempre):
Transcribí el audio completo, palabra por palabra, en el campo "transcription".
No omitas nada aunque el audio sea largo o repetitivo.

PASO 2 — LEER LA TRANSCRIPCIÓN LÍNEA POR LÍNEA:
Recorré el texto del campo "transcription" línea por línea de principio a fin.
Por cada línea, preguntate: ¿esta línea menciona una tarea, acción, mejora o problema concreto?

PASO 3 — EXTRAER TAREAS (a partir del texto transcripto, no del audio):
A partir de lo que leíste en el PASO 2, identificá entre 3 y 15 tareas de desarrollo concretas.
Para cada tarea devolvé:
- title: string (máximo 120 caracteres, en español)
- description: string (descripción detallada en markdown, en español)
- priority: "low" | "medium" | "high" | "critical"
- sourceQuote: string (fragmento EXACTO del texto transcripto que originó esta tarea, máximo 200 caracteres)

Respondé ÚNICAMENTE con un objeto JSON válido con esta forma exacta:
{"transcription":"...","tasks":[{"title":"...","description":"...","priority":"medium","sourceQuote":"..."}]}
Sin texto adicional ni bloques de código markdown.
`

async function extractJsonArray(text: string): Promise<unknown[]> {
  const cleaned = text.trim().replace(/^```json\n?/, '').replace(/\n?```$/, '').trim()
  const parsed = JSON.parse(cleaned)
  if (!Array.isArray(parsed)) throw new Error('Expected JSON array')
  return parsed
}

function extractJsonObject(text: string): Record<string, unknown> {
  const cleaned = text.trim().replace(/^```json\n?/, '').replace(/\n?```$/, '').trim()
  const parsed = JSON.parse(cleaned)
  if (typeof parsed !== 'object' || Array.isArray(parsed) || parsed === null) {
    throw new Error('Expected JSON object')
  }
  return parsed as Record<string, unknown>
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    assertBoard(actor)
    const { companyId } = await params
    assertCompanyAccess(actor, companyId)

    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    }

    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: 'File too large (max 20MB)' }, { status: 400 })
    }

    const mimetype = file.type
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    let genAI: GoogleGenerativeAI
    try {
      genAI = getGeminiClient()
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 503 })
    }

    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let parts: any[]

    if (isAudio(mimetype)) {
      parts = [
        AUDIO_ANALYSIS_PROMPT,
        { inlineData: { mimeType: mimetype, data: buffer.toString('base64') } },
      ]

      const response = await model.generateContent(parts)
      const text = response.response.text()
      const raw = extractJsonObject(text)

      const transcription = String(raw.transcription ?? '')
      const rawTasks = Array.isArray(raw.tasks) ? raw.tasks : []

      const tasks = rawTasks.slice(0, 15).map((t: unknown) => {
        const task = t as Record<string, unknown>
        const baseDescription = String(task.description ?? '')
        const sourceQuote = String(task.sourceQuote ?? '').slice(0, 200).trim()
        const description = sourceQuote
          ? `${baseDescription}\n\n---\n**Contexto de origen (audio)**\n> ${sourceQuote}`
          : baseDescription

        return {
          title: String(task.title ?? '').slice(0, 120),
          description,
          priority: (['low', 'medium', 'high', 'critical'] as const).includes(task.priority as never)
            ? task.priority as 'low' | 'medium' | 'high' | 'critical'
            : 'medium' as const,
        }
      })

      return NextResponse.json({ tasks, transcription })
    }

    if (mimetype === 'application/pdf') {
      parts = [
        TASK_EXTRACTION_PROMPT,
        { inlineData: { mimeType: 'application/pdf', data: buffer.toString('base64') } },
      ]
    } else if (mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const result = await mammoth.extractRawText({ buffer })
      parts = [`${TASK_EXTRACTION_PROMPT}\n\nContenido del documento:\n${result.value}`]
    } else {
      parts = [`${TASK_EXTRACTION_PROMPT}\n\nContenido del documento:\n${buffer.toString('utf-8')}`]
    }

    const response = await model.generateContent(parts)
    const text = response.response.text()
    const rawTasks = await extractJsonArray(text)

    const tasks = rawTasks.slice(0, 15).map((t: unknown) => {
      const task = t as Record<string, unknown>
      return {
        title: String(task.title ?? '').slice(0, 120),
        description: String(task.description ?? ''),
        priority: (['low', 'medium', 'high', 'critical'] as const).includes(task.priority as never)
          ? task.priority as 'low' | 'medium' | 'high' | 'critical'
          : 'medium' as const,
      }
    })

    return NextResponse.json({ tasks })
  } catch (err) {
    console.error('[gemini] analyze-document error:', err)
    return handleError(err)
  }
}
