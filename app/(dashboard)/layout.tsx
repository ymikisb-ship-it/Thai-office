import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import AppShell from '@/components/layout/AppShell'
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return <AppShell>{children}</AppShell>
}
