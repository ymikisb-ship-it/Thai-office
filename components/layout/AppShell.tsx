'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createBrowserClient } from '@/lib/supabase/client'
import { LayoutDashboard, Receipt, Users, BarChart3, LogOut, Menu, X, Plus, Banknote, Wallet, Settings } from 'lucide-react'
import type { AppUser } from '@/lib/supabase/types'

const NAV = [
  { href:'/expenses',            label:'ダッシュボード', icon:LayoutDashboard },
  { href:'/expenses',    label:'経費管理',       icon:Receipt },
  { href:'/activities',  label:'活動管理',       icon:Users },
  { href:'/budget',      label:'予算管理',       icon:BarChart3 },
  { href:'/payroll',     label:'給与管理',       icon:Wallet },
  { href:'/settings', label:'設定', icon:Settings },
]

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createBrowserClient()
  const [profile, setProfile] = useState<AppUser | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('users').select('*').eq('id', user.id).single()
        .then(({ data }) => setProfile(data))
    })
  }, [])

  const isActive = (href: string) => href === '/' ? pathname === '/' : pathname.startsWith(href)

  async function logout() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const SideNav = () => (
    <nav className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-4 border-b border-slate-800">
        <div className="w-9 h-9 rounded-lg bg-white flex items-center justify-center shrink-0 p-1 overflow-hidden">
          {/* TODO: /public/logo-mark.png（またはsvg）にSynergy & Brightenのロゴマーク（文字なし）を配置してください */}
          <img src="/logo-mark.png" alt="Synergy & Brighten" className="w-full h-full object-contain" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white">タイ駐在員事務所</p>
          <p className="text-xs text-slate-400">管理システム</p>
        </div>
      </div>
      <div className="flex-1 py-2 px-2 space-y-0.5 overflow-y-auto">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} onClick={() => setMobileOpen(false)}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
              isActive(href) ? 'bg-blue-600 text-white font-medium' : 'text-slate-300 hover:text-white hover:bg-white/10'
            }`}>
            <Icon size={15} className="shrink-0" />{label}
          </Link>
        ))}
      </div>
      <div className="p-3 border-t border-slate-800 space-y-1">
        {profile && (
          <div className="flex items-center gap-2 px-3 py-2 mb-1">
            <div className="w-7 h-7 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
              <span className="text-xs font-semibold text-blue-300">{profile.name[0]}</span>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-white truncate">{profile.name}</p>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${profile.role==='sales'?'bg-blue-500/20 text-blue-300':'bg-purple-500/20 text-purple-300'}`}>
                {profile.role==='sales'?'営業':'総務'}
              </span>
            </div>
          </div>
        )}
        <button onClick={logout} className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-lg text-sm text-slate-300 hover:text-white hover:bg-white/10 transition-colors">
          <LogOut size={16} className="shrink-0" />ログアウト
        </button>
      </div>
    </nav>
  )

  return (
    <div className="flex h-screen bg-slate-50">
      <aside className="hidden md:flex flex-col w-56 bg-slate-900 border-r border-slate-800 shrink-0">
        <SideNav />
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-slate-900 shadow-xl">
            <button onClick={() => setMobileOpen(false)} className="absolute right-3 top-3 p-1.5 rounded-md text-white hover:bg-white/10"><X size={18} /></button>
            <SideNav />
          </aside>
        </div>
      )}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-200">
          <button onClick={() => setMobileOpen(true)} className="p-1.5 rounded-md hover:bg-slate-100"><Menu size={20} /></button>
          <span className="text-sm font-semibold">タイ駐在員事務所</span>
        </header>
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
      <QuickInput />
    </div>
  )
}

function QuickInput() {
  const supabase = createBrowserClient()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'menu'|'activity'|'expense'>('menu')
  const [saving, setSaving] = useState(false)
  const [aForm, setAForm] = useState({ type:'訪問', company:'', content:'' })
  const [eForm, setEForm] = useState({ category:'交通費', payment:'現金', amount:'' })
  const RATE = 4.2

  async function saveActivity() {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) await supabase.from('activities').insert({
      user_id: user.id, activity_date: new Date().toISOString().slice(0,10),
      activity_type: aForm.type, company_name: aForm.company || null,
      content: aForm.content || null, is_business_trip: aForm.type === '出張'
    })
    setSaving(false); setOpen(false); setAForm({ type:'訪問', company:'', content:'' })
  }

  async function saveExpense() {
    if (!eForm.amount) return; setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const thb = parseFloat(eForm.amount)
    if (user) await supabase.from('expenses').insert({
      user_id: user.id, expense_date: new Date().toISOString().slice(0,10),
      category: eForm.category, amount_thb: thb, amount_jpy: Math.round(thb * RATE),
      exchange_rate: RATE, payment_method: eForm.payment
    })
    setSaving(false); setOpen(false); setEForm(f => ({ ...f, amount:'' }))
  }

  return (
    <>
      {open && <div className="fixed inset-0 bg-black/20 z-40" onClick={() => setOpen(false)} />}
      {open && (
        <div className="fixed bottom-20 right-4 z-50 w-72 bg-white rounded-2xl shadow-2xl border border-slate-200 p-4">
          {mode === 'menu' && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-500 mb-3">何を記録しますか？</p>
              <button onClick={() => setMode('activity')} className="flex items-center gap-3 w-full p-3 rounded-xl border hover:bg-slate-50 text-left">
                <Users size={18} className="text-blue-500 shrink-0" />
                <div><p className="text-sm font-medium">活動を記録</p><p className="text-xs text-slate-500">訪問・会議・出張など</p></div>
              </button>
              <button onClick={() => setMode('expense')} className="flex items-center gap-3 w-full p-3 rounded-xl border hover:bg-slate-50 text-left">
                <Banknote size={18} className="text-green-500 shrink-0" />
                <div><p className="text-sm font-medium">経費を入力</p><p className="text-xs text-slate-500">THBで入力・JPY自動換算</p></div>
              </button>
            </div>
          )}
          {mode === 'activity' && (
            <div className="space-y-3">
              <p className="text-xs font-medium text-slate-500">活動記録</p>
              <select value={aForm.type} onChange={e => setAForm(f => ({ ...f, type:e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm bg-white">
                {['訪問','WEB会議','出張','電話','その他'].map(t => <option key={t}>{t}</option>)}
              </select>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="会社名（任意）" value={aForm.company} onChange={e => setAForm(f => ({ ...f, company:e.target.value }))} />
              <textarea className="w-full border rounded-lg px-3 py-2 text-sm resize-none" rows={2} placeholder="活動内容（任意）" value={aForm.content} onChange={e => setAForm(f => ({ ...f, content:e.target.value }))} />
              <div className="flex gap-2">
                <button onClick={() => setMode('menu')} className="flex-1 py-2 text-sm border rounded-lg hover:bg-slate-50">戻る</button>
                <button onClick={saveActivity} disabled={saving} className="flex-1 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving ? '保存中...' : '記録する'}</button>
              </div>
            </div>
          )}
          {mode === 'expense' && (
            <div className="space-y-3">
              <p className="text-xs font-medium text-slate-500">経費入力（THBベース）</p>
              <div className="grid grid-cols-2 gap-2">
                <select value={eForm.category} onChange={e => setEForm(f => ({ ...f, category:e.target.value }))} className="border rounded-lg px-2 py-2 text-xs bg-white">
                  {['給与','家賃','通信費','交通費','接待交際費','出張費','備品','その他'].map(c => <option key={c}>{c}</option>)}
                </select>
                <select value={eForm.payment} onChange={e => setEForm(f => ({ ...f, payment:e.target.value }))} className="border rounded-lg px-2 py-2 text-xs bg-white">
                  {['現金','法人カード','個人立替'].map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-400 font-medium">฿</span>
                <input type="number" className="flex-1 border rounded-lg px-3 py-2 text-sm" placeholder="金額（THB）" value={eForm.amount} onChange={e => setEForm(f => ({ ...f, amount:e.target.value }))} />
              </div>
              {eForm.amount && (
                <div className="bg-blue-50 rounded-lg px-3 py-2 text-xs text-blue-700">
                  ฿{parseFloat(eForm.amount).toLocaleString()} ≈ ¥{Math.round(parseFloat(eForm.amount)*RATE).toLocaleString()}
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={() => setMode('menu')} className="flex-1 py-2 text-sm border rounded-lg hover:bg-slate-50">戻る</button>
                <button onClick={saveExpense} disabled={saving || !eForm.amount} className="flex-1 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving ? '保存中...' : '記録する'}</button>
              </div>
            </div>
          )}
        </div>
      )}
      <button onClick={() => { setOpen(o => !o); setMode('menu') }}
        className="fixed bottom-4 right-4 z-50 w-14 h-14 rounded-full bg-blue-600 text-white shadow-lg flex items-center justify-center hover:bg-blue-700 active:scale-95 transition-all">
        {open ? <X size={22} /> : <Plus size={24} />}
      </button>
    </>
  )
}
