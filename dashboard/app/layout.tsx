import type { ReactNode } from 'react'
import type { Metadata, Viewport } from 'next'
import { Hanken_Grotesk } from 'next/font/google'
import './globals.css'

const hankenGrotesk = Hanken_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '700', '900'],
})

export const metadata: Metadata = {
  title: '알바 시급 정산',
  description: '지오펜싱 기반 알바 시급 정산 대시보드',
  icons: { icon: '/icon.png', apple: '/icon.png' },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: '주급 정산',
  },
}

export const viewport: Viewport = {
  themeColor: '#0052cc',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" className={hankenGrotesk.className}>
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
        />
      </head>
      <body style={{ margin: 0, background: '#f9f9ff', color: '#1a1c1e' }}>{children}</body>
    </html>
  )
}
