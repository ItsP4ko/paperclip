import { NextRequest, NextResponse } from 'next/server'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { resolveActor } from '@/server/actor'
import { handleError, forbidden } from '@/server/errors'

export const maxDuration = 30

const execFileAsync = promisify(execFile)

function buildPathEnv(): NodeJS.ProcessEnv {
  const existing = process.env.PATH ?? ''
  const home = process.env.HOME ?? ''
  const extras = [
    '/usr/local/bin',
    '/opt/homebrew/bin',
    '/opt/homebrew/sbin',
    home ? `${home}/.local/bin` : '',
    home ? `${home}/.nvm/current/bin` : '',
    home ? `${home}/.volta/bin` : '',
  ].filter(Boolean)
  const combined = [...existing.split(':'), ...extras].filter(Boolean).join(':')
  return { ...process.env, PATH: combined }
}

type AdapterAuthStatus = {
  available: boolean
  loggedIn: boolean
  email?: string
  method?: string
  detail?: string
}

async function getClaudeAuthStatus(): Promise<AdapterAuthStatus> {
  let stdout = ''
  try {
    const result = await execFileAsync('claude', ['auth', 'status', '--json'], {
      env: buildPathEnv(),
      timeout: 8000,
    })
    stdout = result.stdout
  } catch (err: unknown) {
    const e = err as NodeJS.ErrnoException & { stdout?: string; stderr?: string }
    if (e.code === 'ENOENT' || String(e.message).includes('not found')) {
      return { available: false, loggedIn: false, detail: 'claude CLI not found' }
    }
    stdout = e.stdout ?? e.stderr ?? ''
  }
  const raw = stdout.trim()
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>
      return {
        available: true,
        loggedIn: parsed.loggedIn === true,
        email: typeof parsed.email === 'string' ? parsed.email : undefined,
        method: typeof parsed.authMethod === 'string' ? parsed.authMethod : undefined,
      }
    } catch { /* not JSON */ }
  }
  return { available: true, loggedIn: false }
}

async function getGeminiAuthStatus(): Promise<AdapterAuthStatus> {
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) {
    return { available: true, loggedIn: true, method: 'api_key' }
  }
  if (process.env.GOOGLE_GENAI_USE_GCA === 'true') {
    return { available: true, loggedIn: true, method: 'google_account' }
  }
  try {
    await execFileAsync('gemini', ['--version'], { env: buildPathEnv(), timeout: 5000 })
    return { available: true, loggedIn: false, detail: 'No API key or OAuth found. Run gemini auth login.' }
  } catch {
    return { available: false, loggedIn: false, detail: 'gemini CLI not found' }
  }
}

async function getCodexAuthStatus(): Promise<AdapterAuthStatus> {
  if (process.env.OPENAI_API_KEY) {
    return { available: true, loggedIn: true, method: 'api_key' }
  }
  try {
    const home = process.env.HOME ?? ''
    const authPath = `${home}/.codex/auth.json`
    const { readFile } = await import('node:fs/promises')
    const raw = await readFile(authPath, 'utf8')
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const email = typeof parsed.email === 'string' ? parsed.email : undefined
    return { available: true, loggedIn: true, email, method: 'codex_auth' }
  } catch {
    try {
      await execFileAsync('codex', ['--version'], { env: buildPathEnv(), timeout: 5000 })
      return { available: true, loggedIn: false, detail: 'No OPENAI_API_KEY and no auth file found.' }
    } catch {
      return { available: false, loggedIn: false, detail: 'codex CLI not found' }
    }
  }
}

function assertCanManageInstanceSettings(actor: Awaited<ReturnType<typeof resolveActor>>) {
  if (actor.type !== 'board') throw forbidden('Board access required')
  if (actor.source === 'local_implicit' || actor.isInstanceAdmin) return
  throw forbidden('Instance admin access required')
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ type: string }> },
) {
  try {
    const actor = await resolveActor(req)
    assertCanManageInstanceSettings(actor)
    const { type } = await params

    let status: AdapterAuthStatus
    if (type === 'claude_local') {
      status = await getClaudeAuthStatus()
    } else if (type === 'gemini_local') {
      status = await getGeminiAuthStatus()
    } else if (type === 'codex_local') {
      status = await getCodexAuthStatus()
    } else {
      return NextResponse.json(
        { error: `No auth status support for adapter: ${type}` },
        { status: 404 },
      )
    }
    return NextResponse.json(status)
  } catch (err) {
    return handleError(err)
  }
}
