import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveActor } from '@/server/actor'
import { assertBoard, assertCompanyAccess } from '@/server/authz'
import { handleError } from '@/server/errors'
import { parseBody } from '@/server/validate'
import { db } from '@/lib/db'
import { heartbeatService } from '@/services/index'

export const maxDuration = 30

const deleteRunsSchema = z.object({
  runIds: z.array(z.string().uuid()).min(1).max(100),
  companyId: z.string().uuid(),
})

export async function DELETE(req: NextRequest) {
  try {
    const actor = await resolveActor(req)
    assertBoard(actor)
    const body = await parseBody(req, deleteRunsSchema)
    assertCompanyAccess(actor, body.companyId)
    const heartbeat = heartbeatService(db)
    const deleted = await heartbeat.deleteRunsById(body.runIds, body.companyId)
    return NextResponse.json({ deleted })
  } catch (err) {
    return handleError(err)
  }
}
