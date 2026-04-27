import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess } from '@/server/authz'
import { handleError } from '@/server/errors'
import { parseQuery } from '@/server/validate'
import { db } from '@/lib/db'
import { workspaceOperationService } from '@/services/index'

export const maxDuration = 30

const logReadQuerySchema = z.object({
  offset: z.coerce.number().int().min(0).optional().default(0),
  limitBytes: z.coerce.number().int().min(1).max(1048576).optional().default(256000),
})

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ operationId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { operationId } = await params
    const workspaceOperations = workspaceOperationService(db)
    const operation = await workspaceOperations.getById(operationId)
    if (!operation) return NextResponse.json({ error: 'Workspace operation not found' }, { status: 404 })
    assertCompanyAccess(actor, operation.companyId)

    const { offset, limitBytes } = parseQuery(req, logReadQuerySchema)
    const result = await workspaceOperations.readLog(operationId, { offset, limitBytes })
    return NextResponse.json(result)
  } catch (err) {
    return handleError(err)
  }
}
