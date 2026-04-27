'use client'
import dynamic from 'next/dynamic'

// React Router SPA — must render client-only (BrowserRouter doesn't work in SSR)
const App = dynamic(() => import('@/ui/App').then((m) => ({ default: m.App })), { ssr: false })

export default function Page() {
  return <App />
}
