import { NextRequest, NextResponse } from 'next/server'

const ALLOWED_ORIGINS = (process.env.PAPERCLIP_ALLOWED_ORIGINS ?? '').split(',').filter(Boolean)

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return true
  try {
    const { hostname } = new URL(origin)
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return true
  } catch {
    return false
  }
  return ALLOWED_ORIGINS.includes(origin)
}

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = isAllowedOrigin(origin)

  if (!allowed) return {}

  return {
    'Access-Control-Allow-Origin': origin ?? '*',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-paperclip-run-id',
    'Access-Control-Expose-Headers': 'set-auth-token',
  }
}

export async function middleware(req: NextRequest) {
  const origin = req.headers.get('origin')
  const cors = corsHeaders(origin)

  if (req.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers: cors })
  }

  const res = NextResponse.next()
  Object.entries(cors).forEach(([k, v]) => res.headers.set(k, v))
  return res
}

export const config = {
  matcher: '/api/:path*',
}
