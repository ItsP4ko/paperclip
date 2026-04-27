import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { companies } from '@paperclipai/db'
import { resolveActor } from '@/server/actor'
import { assertBoard, assertCompanyAccess } from '@/server/authz'
import { handleError } from '@/server/errors'
import { db } from '@/lib/db'

export const maxDuration = 30

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    assertBoard(actor)
    const { companyId } = await params
    assertCompanyAccess(actor, companyId)

    const [company] = await db
      .select({ remoteControlEnabled: companies.remoteControlEnabled })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1)

    if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })

    return NextResponse.json({ remoteControlEnabled: company.remoteControlEnabled })
  } catch (err) {
    return handleError(err)
  }
}
