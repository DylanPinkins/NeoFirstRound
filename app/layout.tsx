import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Workshop – Collaborative Prompt Editor',
  description: 'Real-time collaborative editor for AI prompts',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
