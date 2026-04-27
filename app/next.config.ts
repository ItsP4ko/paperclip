import type { NextConfig } from 'next'
import path from 'path'

const pkg = (rel: string) => path.resolve(__dirname, `../packages/${rel}`)

// Workspace packages export TypeScript source for monorepo hot-reload.
// Next.js needs compiled dist; point both Turbopack and webpack at it.
const pkgAliases: Record<string, string> = {
  '@paperclipai/shared': pkg('shared/dist/index.js'),
  '@paperclipai/db': pkg('db/dist/index.js'),
  '@paperclipai/adapter-utils': pkg('adapter-utils/dist/index.js'),
  '@paperclipai/adapter-claude-local': pkg('adapters/claude-local/dist/index.js'),
  '@paperclipai/adapter-claude-local/ui': pkg('adapters/claude-local/dist/ui/index.js'),
  '@paperclipai/adapter-codex-local': pkg('adapters/codex-local/dist/index.js'),
  '@paperclipai/adapter-codex-local/ui': pkg('adapters/codex-local/dist/ui/index.js'),
  '@paperclipai/adapter-cursor-local': pkg('adapters/cursor-local/dist/index.js'),
  '@paperclipai/adapter-cursor-local/ui': pkg('adapters/cursor-local/dist/ui/index.js'),
  '@paperclipai/adapter-gemini-local': pkg('adapters/gemini-local/dist/index.js'),
  '@paperclipai/adapter-gemini-local/ui': pkg('adapters/gemini-local/dist/ui/index.js'),
  '@paperclipai/adapter-openclaw-gateway': pkg('adapters/openclaw-gateway/dist/index.js'),
  '@paperclipai/adapter-openclaw-gateway/ui': pkg('adapters/openclaw-gateway/dist/ui/index.js'),
  '@paperclipai/adapter-opencode-local': pkg('adapters/opencode-local/dist/index.js'),
  '@paperclipai/adapter-opencode-local/ui': pkg('adapters/opencode-local/dist/ui/index.js'),
  '@paperclipai/adapter-pi-local': pkg('adapters/pi-local/dist/index.js'),
  '@paperclipai/adapter-pi-local/ui': pkg('adapters/pi-local/dist/ui/index.js'),
}

// Turbopack uses relative paths from project root (app/)
const turboAliases = Object.fromEntries(
  Object.entries(pkgAliases).map(([k, v]) => [k, path.relative(__dirname, v)])
)

const config: NextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: '10mb' },
  },
  turbopack: {
    resolveAlias: turboAliases,
  },
  serverExternalPackages: ['sharp', 'mammoth', 'postgres', 'redis', 'pino'],
  webpack(webpackConfig) {
    webpackConfig.resolve.alias = { ...webpackConfig.resolve.alias, ...pkgAliases }
    return webpackConfig
  },
}

export default config
