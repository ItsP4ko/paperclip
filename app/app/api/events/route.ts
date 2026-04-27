import { NextRequest } from 'next/server'
import { handleError, unauthorized } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import {
  subscribeCompanyLiveEvents,
  subscribeGlobalLiveEvents,
  serializeLiveEvent,
} from '@/services/live-events'

export const maxDuration = 300

export async function GET(req: NextRequest) {
  try {
    const actor = await resolveActor(req)
    if (actor.type === 'none') throw unauthorized()

    const companyId = req.nextUrl.searchParams.get('companyId')

    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder()

        function send(event: object) {
          const serialized =
            typeof (event as { id?: unknown }).id === 'number'
              ? serializeLiveEvent(event as Parameters<typeof serializeLiveEvent>[0])
              : JSON.stringify(event)
          try {
            controller.enqueue(encoder.encode(`data: ${serialized}\n\n`))
          } catch { /* stream already closed */ }
        }

        // Initial ping to establish the stream
        try {
          controller.enqueue(encoder.encode(': ping\n\n'))
        } catch { /* ignore */ }

        // Subscribe to company or global live events
        const unsubscribe = companyId
          ? subscribeCompanyLiveEvents(companyId, send)
          : subscribeGlobalLiveEvents(send)

        req.signal.addEventListener('abort', () => {
          unsubscribe()
          try { controller.close() } catch { /* already closed */ }
        })
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (err) {
    return handleError(err) as Response
  }
}
