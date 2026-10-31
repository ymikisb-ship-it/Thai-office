import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'タイ駐在員事務所 経費管理',
    short_name: '経費管理',
    description: '領収書の撮影・取り込みと経費の月次管理',
    start_url: '/expenses',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0D2B45',
    theme_color: '#0D2B45',
    lang: 'ja',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
