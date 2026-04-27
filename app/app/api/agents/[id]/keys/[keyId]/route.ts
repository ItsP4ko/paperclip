import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { assertBoard } from '@/server/authz'
import { handleError } from '@/server/errors'
import { db } from '@/lib/db'
import { agentService } from '@/services/index'

export const maxDuration = 30

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; keyId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    assertBoard(actor)
    const { keyId } = await params
    const svc = agentService(db)
    const revoked = await svc.revokeKey(keyId)
    if (!revoked) return NextResponse.json({ error: 'Key not found' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleError(err)
  }
}
