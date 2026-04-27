import { NextRequest, NextResponse } from 'next/server'
import fs from 'node:fs'
import path from 'node:path'
import { handleError } from '@/server/errors'

export const maxDuration = 30

interface AvailableSkill {
  name: string
  description: string
  isPaperclipManaged: boolean
}

function resolvePaperclipSkillsDir(): string | null {
  const candidates = [
    path.resolve(process.cwd(), 'skills'),
    path.resolve(process.cwd(), '../skills'),
  ]
  for (const candidate of candidates) {
    try {
      if (fs.statSync(candidate).isDirectory()) return candidate
    } catch { /* skip */ }
  }
  return null
}

function parseSkillFrontmatter(markdown: string): { description: string } {
  const match = markdown.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return { description: '' }
  const yaml = match[1]
  const descMatch = yaml?.match(
    /^description:\s*(?:>\s*\n((?:\s{2,}[^\n]*\n?)+)|[|]\s*\n((?:\s{2,}[^\n]*\n?)+)|["']?(.*?)["']?\s*$)/m,
  )
  if (!descMatch) return { description: '' }
  const raw = descMatch[1] ?? descMatch[2] ?? descMatch[3] ?? ''
  return {
    description: raw
      .split('\n')
      .map((l: string) => l.trim())
      .filter(Boolean)
      .join(' ')
      .trim(),
  }
}

function listAvailableSkills(): AvailableSkill[] {
  const homeDir = process.env.HOME || process.env.USERPROFILE || ''
  const claudeSkillsDir = path.join(homeDir, '.claude', 'skills')
  const paperclipSkillsDir = resolvePaperclipSkillsDir()

  const paperclipSkillNames = new Set<string>()
  if (paperclipSkillsDir) {
    try {
      for (const entry of fs.readdirSync(paperclipSkillsDir, { withFileTypes: true })) {
        if (entry.isDirectory()) paperclipSkillNames.add(entry.name)
      }
    } catch { /* skip */ }
  }

  const skills: AvailableSkill[] = []

  try {
    const entries = fs.readdirSync(claudeSkillsDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
      if (entry.name.startsWith('.')) continue
      const skillMdPath = path.join(claudeSkillsDir, entry.name, 'SKILL.md')
      let description = ''
      try {
        const md = fs.readFileSync(skillMdPath, 'utf8')
        description = parseSkillFrontmatter(md).description
      } catch { /* no SKILL.md or unreadable */ }
      skills.push({
        name: entry.name,
        description,
        isPaperclipManaged: paperclipSkillNames.has(entry.name),
      })
    }
  } catch { /* ~/.claude/skills/ doesn't exist */ }

  skills.sort((a, b) => a.name.localeCompare(b.name))
  return skills
}

export async function GET(_req: NextRequest) {
  try {
    return NextResponse.json({ skills: listAvailableSkills() })
  } catch (err) {
    return handleError(err)
  }
}
