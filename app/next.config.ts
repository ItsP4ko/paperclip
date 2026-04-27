import type { NextConfig } from 'next'

const config: NextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: '10mb' },
  },
  serverExternalPackages: ['sharp', 'mammoth'],
}

export default config
