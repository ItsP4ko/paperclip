import { NextResponse } from 'next/server'

export const maxDuration = 30

// Asset upload endpoints live at:
//   POST /api/companies/[companyId]/assets/images
//   POST /api/companies/[companyId]/logo
//
// Asset retrieval endpoint:
//   GET /api/assets/[assetId]/content
export async function GET() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 })
}
