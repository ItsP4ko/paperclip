import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleError } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess } from '@/server/authz'
import { parseQuery } from '@/server/validate'
import { db } from '@/lib/db'
import { routineService } from '@/services/index'

const routineRunsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
})

export const maxDuration = 30

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { id } = await params
    const svc = routineService(db)
    const routine = await svc.get(id)
    if (!routine) {
      return NextResponse.json({ error: 'Routine not found' }, { status: 404 })
    }
    assertCompanyAccess(actor, routine.companyId)
    const query = parseQuery(req, routineRunsQuerySchema)
    const result = await svc.listRuns(routine.id, query.limit)
    return NextResponse.json(result)
  } catch (err) {
    return handleError(err)
  }
}
