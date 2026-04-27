import { NextResponse } from 'next/server'

export class HttpError extends Error {
  status: number
  details?: unknown

  constructor(status: number, message: string, details?: unknown) {
    super(message)
    this.status = status
    this.details = details
  }
}

export function badRequest(message: string, details?: unknown) {
  return new HttpError(400, message, details)
}

export function unauthorized(message = 'Unauthorized') {
  return new HttpError(401, message)
}

export function forbidden(message = 'Forbidden') {
  return new HttpError(403, message)
}

export function notFound(message = 'Not found') {
  return new HttpError(404, message)
}

export function conflict(message: string, details?: unknown) {
  return new HttpError(409, message, details)
}

export function unprocessable(message: string, details?: unknown) {
  return new HttpError(422, message, details)
}

export function handleError(err: unknown): NextResponse {
  if (err instanceof HttpError) {
    return NextResponse.json(
      { error: err.message, ...(err.details ? { details: err.details } : {}) },
      { status: err.status }
    )
  }
  console.error('[api]', err)
  return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
}
