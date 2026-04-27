import type { NextRequest } from 'next/server'
import type { ZodSchema, ZodError } from 'zod'
import { badRequest } from './errors'

export async function parseBody<T>(req: NextRequest, schema: ZodSchema<T>): Promise<T> {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    throw badRequest('Invalid JSON body')
  }
  const result = schema.safeParse(raw)
  if (!result.success) throw badRequest('Validation error', formatZodError(result.error))
  return result.data
}

export function parseQuery<T>(req: NextRequest, schema: ZodSchema<T>): T {
  const params = Object.fromEntries(req.nextUrl.searchParams)
  const result = schema.safeParse(params)
  if (!result.success) throw badRequest('Invalid query params', formatZodError(result.error))
  return result.data
}

function formatZodError(err: ZodError) {
  return err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
}
