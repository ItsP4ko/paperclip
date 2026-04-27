import { NextRequest, NextResponse } from 'next/server'
import fs from 'node:fs'
import path from 'node:path'
import { handleError, notFound } from '@/server/errors'

export const maxDuration = 30

function readSkillMarkdown(skillName: string): string | null {
  const normalized = skillName.trim().toLowerCase()
  if (
    normalized !== 'paperclip' &&
    normalized !== 'paperclip-create-agent' &&
    normalized !== 'paperclip-create-plugin' &&
    normalized !== 'para-memory-files'
  )
    return null
  const candidates = [
    path.resolve(process.cwd(), 'skills', normalized, 'SKILL.md'),
    path.resolve(process.cwd(), '../skills', normalized, 'SKILL.md'),
  ]
  for (const skillPath of candidates) {
    try {
      return fs.readFileSync(skillPath, 'utf8')
    } catch { /* continue */ }
  }
  return null
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ skillName: string }> },
) {
  try {
    const { skillName } = await params
    const markdown = readSkillMarkdown(skillName)
    if (!markdown) throw notFound('Skill not found')
    return new NextResponse(markdown, {
      headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
    })
  } catch (err) {
    return handleError(err)
  }
}
