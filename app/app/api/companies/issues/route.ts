import { NextResponse } from 'next/server'

export const maxDuration = 30

export async function GET() {
  return NextResponse.json(
    { error: 'Missing companyId in path. Use /api/companies/{companyId}/issues.' },
    { status: 400 },
  )
}
