import { NextRequest, NextResponse } from 'next/server'
import { resolveActor } from '@/server/actor'
import { assertCompanyAccess } from '@/server/authz'
import { handleError } from '@/server/errors'
import { db } from '@/lib/db'
import { agentService } from '@/services/index'
import { toLeanOrgNode } from '../../../agents/_shared'
import { renderOrgChartSvg, renderOrgChartPng, type OrgNode, type OrgChartStyle, ORG_CHART_STYLES } from '@/routes/org-chart-svg'

export const maxDuration = 30

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const actor = await resolveActor(req)
    const { companyId } = await params
    assertCompanyAccess(actor, companyId)
    const svc = agentService(db)
    const tree = await svc.orgForCompany(companyId)
    const leanTree = tree.map((node) => toLeanOrgNode(node as Record<string, unknown>))

    // Support format query param: json (default), svg, png
    const format = req.nextUrl.searchParams.get('format') ?? 'json'
    const style = (ORG_CHART_STYLES.includes(req.nextUrl.searchParams.get('style') as OrgChartStyle)
      ? req.nextUrl.searchParams.get('style')
      : 'warmth') as OrgChartStyle

    if (format === 'svg') {
      const svg = renderOrgChartSvg(leanTree as unknown as OrgNode[], style)
      return new NextResponse(svg, {
        headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-cache' },
      })
    }
    if (format === 'png') {
      const png = await renderOrgChartPng(leanTree as unknown as OrgNode[], style)
      return new NextResponse(png as unknown as BodyInit, {
        headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-cache' },
      })
    }

    return NextResponse.json(leanTree)
  } catch (err) {
    return handleError(err)
  }
}
