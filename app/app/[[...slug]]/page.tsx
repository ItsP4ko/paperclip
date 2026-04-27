'use client'
import dynamic from 'next/dynamic'

// Full SPA root — renders client-only (BrowserRouter + all providers)
const SpaRoot = dynamic(() => import('@/ui/SpaRoot').then((m) => ({ default: m.SpaRoot })), { ssr: false })

export default function Page() {
  return <SpaRoot />
}
