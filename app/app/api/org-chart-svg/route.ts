import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { assertBoard } from '@/server/authz'
import { handleError } from '@/server/errors'
import { db } from '@/lib/db'
import { agentService } from '@/services/index'
import {
  renderOrgChartSvg,
  type OrgNode,
  type OrgChartStyle,
  ORG_CHART_STYLES,
} from '@/routes/org-chart-svg'

export const maxDuration = 30

export async function GET(req: NextRequest) {
  try {
    const actor = await resolveActor(req)
    assertBoard(actor)

    const searchParams = req.nextUrl.searchParams
    const companyId = searchParams.get('companyId')
    if (!companyId) {
      return NextResponse.json({ error: 'companyId is required' }, { status: 400 })
    }

    const styleParam = searchParams.get('style') ?? 'warmth'
    const style = (ORG_CHART_STYLES.includes(styleParam as OrgChartStyle)
      ? styleParam
      : 'warmth') as OrgChartStyle

    const svc = agentService(db)
    const tree = await svc.orgForCompany(companyId)

    const svg = renderOrgChartSvg(tree as unknown as OrgNode[], style)

    return new NextResponse(svg, {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'no-cache',
      },
    })
  } catch (err) {
    return handleError(err)
  }
}
