import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '알바 시급 정산',
    short_name: '주급 정산',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#f9f9ff',
    theme_color: '#0052cc',
    icons: [{ src: '/icon.png?v=2', sizes: '1024x1024', type: 'image/png', purpose: 'any' }],
  }
}
