import { NextResponse } from 'next/server'

export const maxDuration = 30

// This endpoint does not exist — the issues-checkout-wakeup logic is a
// pure utility (shouldWakeAssigneeOnCheckout) used internally by the
// issues route handler. It has no HTTP surface.
export async function GET() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 })
}
