import { NextRequest, NextResponse } from 'next/server'
import { handleError } from '@/server/errors'
import { db } from '@/lib/db'
import { routineService } from '@/services/index'

export const maxDuration = 30

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ publicId: string }> },
) {
  try {
    const { publicId } = await params
    const svc = routineService(db)

    let payload: Record<string, unknown> | null = null
    try {
      const body = await req.json()
      if (body && typeof body === 'object') {
        payload = body as Record<string, unknown>
      }
    } catch {
      // no body or invalid JSON — payload stays null
    }

    const result = await svc.firePublicTrigger(publicId, {
      authorizationHeader: req.headers.get('authorization'),
      signatureHeader: req.headers.get('x-paperclip-signature'),
      timestampHeader: req.headers.get('x-paperclip-timestamp'),
      idempotencyKey: req.headers.get('idempotency-key'),
      rawBody: null,
      payload,
    })
    return NextResponse.json(result, { status: 202 })
  } catch (err) {
    return handleError(err)
  }
}
