import { NextRequest, NextResponse } from 'next/server'
import { handleError } from '@/server/errors'

export const maxDuration = 30

export async function GET(_req: NextRequest) {
  try {
    return NextResponse.json({
      skills: [
        { name: 'paperclip', path: '/api/skills/paperclip' },
        { name: 'para-memory-files', path: '/api/skills/para-memory-files' },
        { name: 'paperclip-create-agent', path: '/api/skills/paperclip-create-agent' },
      ],
    })
  } catch (err) {
    return handleError(err)
  }
}
