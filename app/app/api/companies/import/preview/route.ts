import { NextRequest, NextResponse } from 'next/server'
import { handleError } from '@/server/errors'
import { resolveActor } from '@/server/actor'
import { assertBoard, assertCompanyAccess } from '@/server/authz'
import { parseBody } from '@/server/validate'
import { db } from '@/lib/db'
import { companyPortabilityService } from '@/services/index'
import { companyPortabilityPreviewSchema } from '@paperclipai/shared'

export const maxDuration = 30

export async function POST(req: NextRequest) {
  try {
    const actor = await resolveActor(req)
    assertBoard(actor)
    const body = await parseBody(req, companyPortabilityPreviewSchema)
    if (body.target.mode === 'existing_company') {
      assertCompanyAccess(actor, body.target.companyId)
    }
    const portability = companyPortabilityService(db)
    const preview = await portability.previewImport(body)
    return NextResponse.json(preview)
  } catch (err) {
    return handleError(err)
  }
}
