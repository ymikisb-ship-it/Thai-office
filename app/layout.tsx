import type { Metadata, Viewport } from "next"
import "./globals.css"
export const metadata: Metadata = {
  title: "タイ駐在員事務所 管理システム",
  description: "経費・活動・予算・報告書の一元管理",
  applicationName: "経費管理",
  appleWebApp: { capable: true, title: "経費管理", statusBarStyle: "black-translucent" },
  icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" },
}
export const viewport: Viewport = {
  themeColor: "#0D2B45",
  width: "device-width",
  initialScale: 1,
}
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="ja"><body>{children}</body></html>
}
