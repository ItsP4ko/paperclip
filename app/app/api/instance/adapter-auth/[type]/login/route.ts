import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'node:child_process'
import { resolveActor } from '@/server/actor'
import { handleError, forbidden } from '@/server/errors'
import { activeLoginProcesses } from '@/server/adapter-auth-state'

export const maxDuration = 60

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

function assertCanManageInstanceSettings(actor: Awaited<ReturnType<typeof resolveActor>>) {
  if (actor.type !== 'board') throw forbidden('Board access required')
  if (actor.source === 'local_implicit' || actor.isInstanceAdmin) return
  throw forbidden('Instance admin access required')
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ type: string }> },
) {
  try {
    const actor = await resolveActor(req)
    assertCanManageInstanceSettings(actor)
    const { type } = await params
    const env = buildPathEnv()

    const loginCommands: Record<string, { cmd: string; args: string[] }> = {
      claude_local: { cmd: 'claude', args: ['auth', 'login'] },
      gemini_local: { cmd: 'gemini', args: ['auth', 'login'] },
      codex_local: { cmd: 'codex', args: ['login'] },
    }

    const loginCmd = loginCommands[type]
    if (!loginCmd) {
      return NextResponse.json({ error: `No login command for adapter: ${type}` }, { status: 404 })
    }

    try {
      const existing = activeLoginProcesses.get(type)
      if (existing) {
        try { existing.kill() } catch { /* ignore */ }
      }

      const proc = spawn(loginCmd.cmd, loginCmd.args, {
        env,
        detached: false,
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      activeLoginProcesses.set(type, proc)
      proc.on('exit', () => activeLoginProcesses.delete(type))

      const authUrl = await new Promise<string | undefined>((resolve) => {
        const timer = setTimeout(() => resolve(undefined), 10000)
        const urlRe = /https?:\/\/[^\s"'<>]+/

        const handleData = (chunk: Buffer | string) => {
          const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8')
          const match = urlRe.exec(text)
          if (match) {
            clearTimeout(timer)
            resolve(match[0])
          }
        }

        proc.stdout?.on('data', handleData)
        proc.stderr?.on('data', handleData)
        proc.on('exit', () => { clearTimeout(timer); resolve(undefined) })
      })

      proc.stdout?.resume()
      proc.stderr?.resume()

      return NextResponse.json({ started: true, authUrl })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return NextResponse.json({ error: msg }, { status: 500 })
    }
  } catch (err) {
    return handleError(err)
  }
}
