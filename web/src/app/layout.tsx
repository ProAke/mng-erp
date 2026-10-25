import type { Metadata } from 'next'
import { Providers } from '@/lib/providers'
import './globals.css'

export const metadata: Metadata = {
  title: 'MNG ERP — Work Tracking Management',
  description: 'ระบบจัดการโปรเจกต์และงานสำหรับทีมพัฒนา',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className="h-full antialiased">
      <body className="min-h-full bg-background text-foreground font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
