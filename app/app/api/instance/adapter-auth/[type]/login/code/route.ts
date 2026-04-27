import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { handleError, forbidden } from '@/server/errors'
import { activeLoginProcesses } from '@/server/adapter-auth-state'

export const maxDuration = 30

function assertCanManageInstanceSettings(actor: Awaited<ReturnType<typeof resolveActor>>) {
  if (actor.type !== 'board') throw forbidden('Board access required')
  if (actor.source === 'local_implicit' || actor.isInstanceAdmin) return
  throw forbidden('Instance admin access required')
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ type: string }> },
) {
  try {
    const actor = await resolveActor(req)
    assertCanManageInstanceSettings(actor)
    const { type } = await params

    let body: { code?: string } = {}
    try { body = await req.json() } catch { /* ignore */ }
    const code = body.code?.trim()

    if (!code) {
      return NextResponse.json({ error: 'code is required' }, { status: 400 })
    }

    const proc = activeLoginProcesses.get(type)
    if (!proc) {
      return NextResponse.json(
        { error: 'No active login session. Click Login again to restart.' },
        { status: 409 },
      )
    }

    proc.stdin?.write(code + '\n')
    return NextResponse.json({ submitted: true })
  } catch (err) {
    return handleError(err)
  }
}
