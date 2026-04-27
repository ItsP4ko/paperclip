import type { Metadata } from 'next'
import '@/ui/index.css'

export const metadata: Metadata = {
  title: 'Paperclip',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
