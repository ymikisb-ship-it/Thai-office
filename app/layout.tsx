import type { Metadata } from "next"
import "./globals.css"
export const metadata: Metadata = {
  title: "タイ駐在員事務所 管理システム",
  description: "経費・活動・予算・報告書の一元管理",
}
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="ja"><body>{children}</body></html>
}
