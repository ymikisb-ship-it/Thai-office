import { createBrowserClient as _create } from '@supabase/ssr'
export function createBrowserClient() {
  return _create(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
