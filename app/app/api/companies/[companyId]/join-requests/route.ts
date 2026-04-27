import { NextRequest, NextResponse } from 'next/server'
import { desc, eq } from 'drizzle-orm'
import { joinRequests } from '@paperclipai/db'
import { resolveActor } from '@/server/actor'
import { handleError } from '@/server/errors'
import { db } from '@/lib/db'
import { toJoinRequestResponse, assertCompanyPermission } from '@/server/access-helpers'
import { listJoinRequestsQuerySchema } from '@paperclipai/shared'
import { parseQuery } from '@/server/validate'

export const maxDuration = 30

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { companyId } = await params
    await assertCompanyPermission(db, actor, companyId, 'joins:approve')

    const query = parseQuery(req, listJoinRequestsQuerySchema)
    const all = await db
      .select()
      .from(joinRequests)
      .where(eq(joinRequests.companyId, companyId))
      .orderBy(desc(joinRequests.createdAt))

    const filtered = all.filter((row) => {
      if (query.status && row.status !== query.status) return false
      if (query.requestType && row.requestType !== query.requestType) return false
      return true
    })

    return NextResponse.json(filtered.map(toJoinRequestResponse))
  } catch (err) {
    return handleError(err)
  }
}
