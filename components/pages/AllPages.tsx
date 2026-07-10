'use client'
import { useEffect, useState, useCallback } from 'react'
import { createBrowserClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Plus, Download, Paperclip, Sparkles, FileText, Check } from 'lucide-react'
import { CATEGORIES, PAYMENT_METHODS, ACTIVITY_TYPES, RATE } from '@/lib/utils'
import type { Expense, Activity, Budget, MonthlyReport, ExpenseCategory, PaymentMethod, ActivityType } from '@/lib/supabase/types'

// ─── 共通 ─────────────────────────────────────────────────────
function KPICard({ label, value, sub, warn }: { label:string; value:string; sub?:string; warn?:boolean }) {
  return (
    <Card><CardContent className="pt-5 pb-4">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${warn ? 'text-red-600' : 'text-slate-900'}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </CardContent></Card>
  )
}

const CAT_COLOR: Record<string,string> = {
  '給与':'bg-purple-50 text-purple-700','家賃':'bg-blue-50 text-blue-700',
  '通信費':'bg-teal-50 text-teal-700','交通費':'bg-sky-50 text-sky-700',
  '接待交際費':'bg-pink-50 text-pink-700','出張費':'bg-amber-50 text-amber-700',
  '備品':'bg-green-50 text-green-700','その他':'bg-slate-100 text-slate-600',
}
const TYPE_COLOR: Record<string,string> = {
  '訪問':'bg-blue-50 text-blue-700','WEB会議':'bg-teal-50 text-teal-700',
  '出張':'bg-amber-50 text-amber-700','電話':'bg-purple-50 text-purple-700','その他':'bg-slate-100 text-slate-600'
}

// ─── ダッシュボード ────────────────────────────────────────────
export function DashboardContent() {
  const supabase = createBrowserClient()
  const now = new Date()
  const year = now.getFullYear(); const month = now.getMonth()+1
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [expChart, setExpChart] = useState<{month:string;経費:number}[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const start=`${year}-${String(month).padStart(2,'0')}-01`
    const end=month===12?`${year+1}-01-01`:`${year}-${String(month+1).padStart(2,'0')}-01`
    const sixAgo=new Date(year,month-7,1).toISOString().slice(0,10)
    Promise.all([
      supabase.from('expenses').select('*').gte('expense_date',start).lt('expense_date',end),
      supabase.from('activities').select('*').gte('activity_date',start).lt('activity_date',end),
      supabase.from('expenses').select('expense_date,amount_jpy').gte('expense_date',sixAgo).order('expense_date'),
    ]).then(([e,a,h]) => {
      setExpenses(e.data??[]); setActivities(a.data??[])
      const byMonth: Record<string,number>={}
      for(const row of h.data??[]) { const m=row.expense_date.slice(0,7); byMonth[m]=(byMonth[m]??0)+row.amount_jpy }
      setExpChart(Object.entries(byMonth).sort().map(([m,v])=>({month:m.slice(5),経費:Math.round(v/10000)})))
      setLoading(false)
    })
  },[year,month])

  if(loading) return <div className="flex items-center justify-center h-64"><p className="text-slate-400">読み込み中...</p></div>
  const totalThb=expenses.reduce((s,e)=>s+e.amount_thb,0)
  const totalJpy=expenses.reduce((s,e)=>s+e.amount_jpy,0)
  const companies=new Set(activities.filter(a=>a.company_name).map(a=>a.company_name)).size

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div><h1 className="text-xl font-bold text-slate-900">{year}年{month}月 ダッシュボード</h1>
        <p className="text-sm text-slate-500 mt-0.5">タイ駐在員事務所 運営状況</p></div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard label="今月経費（円）" value={`¥${Math.round(totalJpy/10000)}万`} sub={`฿${Math.round(totalThb).toLocaleString()}`} />
        <KPICard label="今月訪問" value={`${activities.filter(a=>a.activity_type==='訪問').length}件`} sub={`${companies}社`} />
        <KPICard label="WEB会議" value={`${activities.filter(a=>a.activity_type==='WEB会議').length}件`} />
        <KPICard label="出張日数" value={`${activities.filter(a=>a.is_business_trip).length}日`} />
        <KPICard label="活動合計" value={`${activities.length}件`} />
        <KPICard label="顧客接触" value={`${companies}社`} />
      </div>
      {expChart.length>0 && (
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">経費推移（万円）</CardTitle></CardHeader>
          <CardContent><ResponsiveContainer width="100%" height={200}>
            <BarChart data={expChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" tick={{fontSize:11}} />
              <YAxis tick={{fontSize:11}} />
              <Tooltip />
              <Bar dataKey="経費" fill="#2563eb" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer></CardContent>
        </Card>
      )}
    </div>
  )
}

// ─── 経費管理 ──────────────────────────────────────────────────
function ExpenseEditDialog({ expense, onClose, onSaved }: { expense:Expense; onClose:()=>void; onSaved:()=>void }) {
  const supabase = createBrowserClient()
  const [form, setForm] = useState({...expense})
  const [saving, setSaving] = useState(false)
  const set = <K extends keyof Expense>(k:K,v:Expense[K]) => setForm(p=>({...p,[k]:v}))
  async function save() {
    setSaving(true)
    const thb=Number(form.amount_thb)
    await supabase.from('expenses').update({ expense_date:form.expense_date, category:form.category, amount_thb:thb, amount_jpy:Math.round(thb*RATE), payment_method:form.payment_method, memo:form.memo??null }).eq('id',expense.id)
    setSaving(false); onSaved(); onClose()
  }
  async function del() {
    if(!confirm('削除しますか？')) return
    await supabase.from('expenses').delete().eq('id',expense.id)
    onSaved(); onClose()
  }
  return (
    <Dialog open onOpenChange={v=>!v&&onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="text-base">経費を編集</DialogTitle></DialogHeader>
        <div className="space-y-3 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label className="text-xs text-slate-500">日付</Label>
              <Input type="date" value={form.expense_date} onChange={e=>set('expense_date',e.target.value)} className="h-8 text-sm" /></div>
            <div className="space-y-1"><Label className="text-xs text-slate-500">カテゴリ</Label>
              <Select value={form.category} onValueChange={v=>set('category',v as ExpenseCategory)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map(c=><SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label className="text-xs text-slate-500">金額（THB）</Label>
              <Input type="number" value={form.amount_thb} onChange={e=>set('amount_thb',Number(e.target.value))} className="h-8 text-sm" /></div>
            <div className="space-y-1"><Label className="text-xs text-slate-500">支払方法</Label>
              <Select value={form.payment_method} onValueChange={v=>set('payment_method',v as PaymentMethod)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{PAYMENT_METHODS.map(p=><SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select></div>
          </div>
          <div className="space-y-1"><Label className="text-xs text-slate-500">備考</Label>
            <Textarea value={form.memo??''} onChange={e=>set('memo',e.target.value)} className="text-sm min-h-[60px] resize-none" /></div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50 mr-auto" onClick={del}>削除</Button>
          <Button variant="outline" size="sm" onClick={onClose}>キャンセル</Button>
          <Button size="sm" onClick={save} disabled={saving}>{saving?'保存中...':'保存'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ExpensesContent() {
  const supabase = createBrowserClient()
  const now = new Date()
  const [year,setYear]=useState(now.getFullYear()); const [month,setMonth]=useState(now.getMonth()+1)
  const [cat,setCat]=useState('all'); const [search,setSearch]=useState('')
  const [expenses,setExpenses]=useState<Expense[]>([]); const [loading,setLoading]=useState(true)
  const [showNew,setShowNew]=useState(false); const [editTarget,setEditTarget]=useState<Expense|null>(null)
  const [newForm,setNewForm]=useState({date:now.toISOString().slice(0,10),category:'交通費' as ExpenseCategory,payment:'現金' as PaymentMethod,amount:'',memo:''})
  const [saving,setSaving]=useState(false)

  const load=useCallback(async()=>{
    setLoading(true)
    const start=`${year}-${String(month).padStart(2,'0')}-01`
    const end=month===12?`${year+1}-01-01`:`${year}-${String(month+1).padStart(2,'0')}-01`
    let q=supabase.from('expenses').select('*').gte('expense_date',start).lt('expense_date',end).order('expense_date',{ascending:false})
    if(cat!=='all') q=q.eq('category',cat)
    const {data}=await q; setExpenses(data??[]); setLoading(false)
  },[year,month,cat])
  useEffect(()=>{load()},[load])

  const filtered=expenses.filter(e=>!search||(e.memo??'').includes(search)||e.category.includes(search))
  const totalThb=filtered.reduce((s,e)=>s+e.amount_thb,0)
  const totalJpy=filtered.reduce((s,e)=>s+e.amount_jpy,0)

  function exportCSV() {
    const h='日付,カテゴリ,THB,円,支払方法,備考'
    const lines=filtered.map(e=>`${e.expense_date},${e.category},${e.amount_thb},${e.amount_jpy},${e.payment_method},"${(e.memo??'').replace(/"/g,'""')}"`)
    const b=new Blob(['\uFEFF'+[h,...lines].join('\n')],{type:'text/csv;charset=utf-8;'})
    const a=document.createElement('a'); a.href=URL.createObjectURL(b); a.download=`経費_${year}-${month}.csv`; a.click()
  }

  async function saveNew() {
    if(!newForm.amount) return; setSaving(true)
    const {data:{user}}=await supabase.auth.getUser()
    const thb=parseFloat(newForm.amount)
    if(user) await supabase.from('expenses').insert({user_id:user.id,expense_date:newForm.date,category:newForm.category,amount_thb:thb,amount_jpy:Math.round(thb*RATE),exchange_rate:RATE,payment_method:newForm.payment,memo:newForm.memo||null})
    setSaving(false); setShowNew(false); setNewForm(f=>({...f,amount:'',memo:''})); load()
  }

  return (
    <div className="p-6 space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold text-slate-900">経費管理</h1>
          <p className="text-sm text-slate-500 mt-0.5">{year}年{month}月 — {filtered.length}件</p></div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={!filtered.length}><Download size={13} className="mr-1"/>CSV</Button>
          <Button size="sm" onClick={()=>setShowNew(v=>!v)}><Plus size={13} className="mr-1"/>{showNew?'閉じる':'経費を追加'}</Button>
        </div>
      </div>
      {showNew && (
        <Card className="border-blue-200 bg-blue-50/30"><CardContent className="pt-4 space-y-3">
          <p className="text-sm font-semibold">新規経費入力</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label className="text-xs text-slate-500">日付</Label>
              <Input type="date" value={newForm.date} onChange={e=>setNewForm(f=>({...f,date:e.target.value}))} className="h-8 text-sm"/></div>
            <div className="space-y-1"><Label className="text-xs text-slate-500">カテゴリ</Label>
              <Select value={newForm.category} onValueChange={v=>setNewForm(f=>({...f,category:v as ExpenseCategory}))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue/></SelectTrigger>
                <SelectContent>{CATEGORIES.map(c=><SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select></div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative flex-1"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">฿</span>
              <Input type="number" value={newForm.amount} onChange={e=>setNewForm(f=>({...f,amount:e.target.value}))} placeholder="0" className="h-8 text-sm pl-6"/></div>
            {newForm.amount&&<span className="text-xs text-slate-500 whitespace-nowrap">≈ ¥{Math.round(parseFloat(newForm.amount)*RATE).toLocaleString()}</span>}
            <Select value={newForm.payment} onValueChange={v=>setNewForm(f=>({...f,payment:v as PaymentMethod}))}>
              <SelectTrigger className="h-8 text-sm w-28"><SelectValue/></SelectTrigger>
              <SelectContent>{PAYMENT_METHODS.map(p=><SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Input placeholder="備考（任意）" value={newForm.memo} onChange={e=>setNewForm(f=>({...f,memo:e.target.value}))} className="h-8 text-sm"/>
          <Button size="sm" onClick={saveNew} disabled={saving||!newForm.amount} className="w-full">{saving?'保存中...':'経費を保存'}</Button>
        </CardContent></Card>
      )}
      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="pt-4 pb-3"><p className="text-xs text-slate-500 mb-1">合計（THB）</p><p className="text-lg font-bold">฿{Math.round(totalThb).toLocaleString()}</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><p className="text-xs text-slate-500 mb-1">合計（円）</p><p className="text-lg font-bold">¥{Math.round(totalJpy).toLocaleString()}</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><p className="text-xs text-slate-500 mb-1">件数</p><p className="text-lg font-bold">{filtered.length}件</p></CardContent></Card>
      </div>
      <div className="flex flex-wrap gap-2">
        <Select value={String(year)} onValueChange={v=>setYear(Number(v))}><SelectTrigger className="w-24 h-8 text-sm"><SelectValue/></SelectTrigger><SelectContent>{[now.getFullYear()-1,now.getFullYear()].map(y=><SelectItem key={y} value={String(y)}>{y}年</SelectItem>)}</SelectContent></Select>
        <Select value={String(month)} onValueChange={v=>setMonth(Number(v))}><SelectTrigger className="w-20 h-8 text-sm"><SelectValue/></SelectTrigger><SelectContent>{Array.from({length:12},(_,i)=>i+1).map(m=><SelectItem key={m} value={String(m)}>{m}月</SelectItem>)}</SelectContent></Select>
        <Select value={cat} onValueChange={setCat}><SelectTrigger className="w-32 h-8 text-sm"><SelectValue placeholder="全カテゴリ"/></SelectTrigger><SelectContent><SelectItem value="all">全カテゴリ</SelectItem>{CATEGORIES.map(c=><SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
        <Input placeholder="キーワード検索..." value={search} onChange={e=>setSearch(e.target.value)} className="h-8 text-sm w-36"/>
      </div>
      <Card><CardContent className="p-0">
        {loading?<div className="flex items-center justify-center h-32"><p className="text-sm text-slate-400">読み込み中...</p></div>
        :filtered.length===0?<div className="flex items-center justify-center h-32"><p className="text-sm text-slate-400">データがありません</p></div>
        :<div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-slate-50">
              <th className="text-left py-2.5 px-4 text-xs font-medium text-slate-500">日付</th>
              <th className="text-left py-2.5 px-3 text-xs font-medium text-slate-500">カテゴリ</th>
              <th className="text-right py-2.5 px-3 text-xs font-medium text-slate-500">THB</th>
              <th className="text-right py-2.5 px-3 text-xs font-medium text-slate-500">円</th>
              <th className="text-left py-2.5 px-3 text-xs font-medium text-slate-500">支払</th>
              <th className="text-left py-2.5 px-3 text-xs font-medium text-slate-500">備考</th>
            </tr></thead>
            <tbody>{filtered.map(e=>(
              <tr key={e.id} className="border-b hover:bg-slate-50 cursor-pointer" onClick={()=>setEditTarget(e)}>
                <td className="py-3 px-4 tabular-nums text-slate-600">{e.expense_date.slice(5).replace('-','/')}</td>
                <td className="py-3 px-3"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CAT_COLOR[e.category]}`}>{e.category}</span></td>
                <td className="py-3 px-3 text-right tabular-nums text-slate-500">฿{e.amount_thb.toLocaleString()}</td>
                <td className="py-3 px-3 text-right tabular-nums font-semibold">¥{Math.round(e.amount_jpy).toLocaleString()}</td>
                <td className="py-3 px-3 text-xs text-slate-500">{e.payment_method}</td>
                <td className="py-3 px-3 text-xs text-slate-500 truncate max-w-[140px]">{e.memo??'—'}</td>
              </tr>
            ))}</tbody>
            <tfoot><tr className="border-t bg-slate-50">
              <td className="py-2.5 px-4 text-xs text-slate-500 font-medium" colSpan={2}>{filtered.length}件合計</td>
              <td className="py-2.5 px-3 text-right font-semibold text-sm">฿{Math.round(totalThb).toLocaleString()}</td>
              <td className="py-2.5 px-3 text-right font-semibold text-sm">¥{Math.round(totalJpy).toLocaleString()}</td>
              <td colSpan={2}/>
            </tr></tfoot>
          </table>
        </div>}
      </CardContent></Card>
      {editTarget&&<ExpenseEditDialog expense={editTarget} onClose={()=>setEditTarget(null)} onSaved={load}/>}
    </div>
  )
}

// ─── 活動管理 ──────────────────────────────────────────────────
function ActivityEditDialog({ activity, onClose, onSaved }: { activity:Activity; onClose:()=>void; onSaved:()=>void }) {
  const supabase = createBrowserClient()
  const [form, setForm] = useState({...activity}); const [saving, setSaving] = useState(false)
  const set = <K extends keyof Activity>(k:K,v:Activity[K]) => setForm(p=>({...p,[k]:v}))
  async function save() {
    setSaving(true)
    await supabase.from('activities').update({ activity_date:form.activity_date, activity_type:form.activity_type, company_name:form.company_name||null, contact_person:form.contact_person||null, content:form.content||null, outcome:form.outcome||null, is_business_trip:form.is_business_trip }).eq('id',activity.id)
    setSaving(false); onSaved(); onClose()
  }
  async function del() {
    if(!confirm('削除しますか？')) return
    await supabase.from('activities').delete().eq('id',activity.id); onSaved(); onClose()
  }
  return (
    <Dialog open onOpenChange={v=>!v&&onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="text-base">活動を編集</DialogTitle></DialogHeader>
        <div className="space-y-3 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label className="text-xs text-slate-500">日付</Label><Input type="date" value={form.activity_date} onChange={e=>set('activity_date',e.target.value)} className="h-8 text-sm"/></div>
            <div className="space-y-1"><Label className="text-xs text-slate-500">種別</Label>
              <Select value={form.activity_type} onValueChange={v=>set('activity_type',v as ActivityType)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue/></SelectTrigger>
                <SelectContent>{ACTIVITY_TYPES.map(t=><SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label className="text-xs text-slate-500">会社名</Label><input value={form.company_name??''} onChange={e=>set('company_name',e.target.value||null)} className="w-full border rounded-md px-3 py-1.5 text-sm"/></div>
            <div className="space-y-1"><Label className="text-xs text-slate-500">担当者</Label><input value={form.contact_person??''} onChange={e=>set('contact_person',e.target.value||null)} className="w-full border rounded-md px-3 py-1.5 text-sm"/></div>
          </div>
          <div className="space-y-1"><Label className="text-xs text-slate-500">活動内容</Label><Textarea value={form.content??''} onChange={e=>set('content',e.target.value||null)} className="text-sm min-h-[60px] resize-none"/></div>
          <div className="space-y-1"><Label className="text-xs text-slate-500">結果・所見</Label><Textarea value={form.outcome??''} onChange={e=>set('outcome',e.target.value||null)} className="text-sm min-h-[60px] resize-none"/></div>
          <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={form.is_business_trip} onChange={e=>set('is_business_trip',e.target.checked)}/>出張フラグ</label>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50 mr-auto" onClick={del}>削除</Button>
          <Button variant="outline" size="sm" onClick={onClose}>キャンセル</Button>
          <Button size="sm" onClick={save} disabled={saving}>{saving?'保存中...':'保存'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ActivitiesContent() {
  const supabase = createBrowserClient()
  const now = new Date()
  const [year,setYear]=useState(now.getFullYear()); const [month,setMonth]=useState(now.getMonth()+1)
  const [typeFilter,setTypeFilter]=useState('all'); const [search,setSearch]=useState('')
  const [activities,setActivities]=useState<Activity[]>([]); const [loading,setLoading]=useState(true)
  const [editTarget,setEditTarget]=useState<Activity|null>(null); const [showNew,setShowNew]=useState(false)
  const [newForm,setNewForm]=useState({date:now.toISOString().slice(0,10),type:'訪問' as ActivityType,company:'',content:''}); const [saving,setSaving]=useState(false)

  const load=useCallback(async()=>{
    setLoading(true)
    const start=`${year}-${String(month).padStart(2,'0')}-01`
    const end=month===12?`${year+1}-01-01`:`${year}-${String(month+1).padStart(2,'0')}-01`
    let q=supabase.from('activities').select('*').gte('activity_date',start).lt('activity_date',end).order('activity_date',{ascending:false})
    if(typeFilter!=='all') q=q.eq('activity_type',typeFilter)
    const{data}=await q; setActivities(data??[]); setLoading(false)
  },[year,month,typeFilter])
  useEffect(()=>{load()},[load])

  const filtered=activities.filter(a=>!search||(a.company_name??'').includes(search)||(a.content??'').includes(search))
  const counts=ACTIVITY_TYPES.reduce<Record<string,number>>((a,t)=>({...a,[t]:activities.filter(x=>x.activity_type===t).length}),{})

  async function addActivity() {
    setSaving(true)
    const{data:{user}}=await supabase.auth.getUser()
    if(user) await supabase.from('activities').insert({user_id:user.id,activity_date:newForm.date,activity_type:newForm.type,company_name:newForm.company||null,content:newForm.content||null,is_business_trip:newForm.type==='出張'})
    setSaving(false); setShowNew(false); setNewForm(f=>({...f,company:'',content:''})); load()
  }

  return (
    <div className="p-6 space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold text-slate-900">活動管理</h1><p className="text-sm text-slate-500 mt-0.5">{year}年{month}月 — {filtered.length}件</p></div>
        <Button size="sm" onClick={()=>setShowNew(v=>!v)}><Plus size={13} className="mr-1"/>{showNew?'閉じる':'活動を追加'}</Button>
      </div>
      <div className="grid grid-cols-5 gap-2">
        {ACTIVITY_TYPES.map(t=>(
          <Card key={t} className={`cursor-pointer transition-colors ${typeFilter===t?'border-blue-400 bg-blue-50':''}`} onClick={()=>setTypeFilter(t===typeFilter?'all':t)}>
            <CardContent className="pt-4 pb-3 text-center"><p className="text-xl font-bold">{counts[t]}</p><p className="text-xs text-slate-500 mt-0.5">{t}</p></CardContent>
          </Card>
        ))}
      </div>
      {showNew&&(
        <Card className="border-blue-200 bg-blue-50/30"><CardContent className="pt-4 space-y-3">
          <p className="text-sm font-semibold">新規活動入力</p>
          <div className="grid grid-cols-2 gap-3">
            <Input type="date" value={newForm.date} onChange={e=>setNewForm(f=>({...f,date:e.target.value}))} className="h-8 text-sm"/>
            <Select value={newForm.type} onValueChange={v=>setNewForm(f=>({...f,type:v as ActivityType}))}><SelectTrigger className="h-8 text-sm"><SelectValue/></SelectTrigger><SelectContent>{ACTIVITY_TYPES.map(t=><SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select>
          </div>
          <Input placeholder="会社名（任意）" value={newForm.company} onChange={e=>setNewForm(f=>({...f,company:e.target.value}))} className="h-8 text-sm"/>
          <textarea placeholder="活動内容（任意）" value={newForm.content} onChange={e=>setNewForm(f=>({...f,content:e.target.value}))} rows={2} className="w-full border rounded-md px-3 py-1.5 text-sm resize-none"/>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1" onClick={()=>setShowNew(false)}>キャンセル</Button>
            <Button size="sm" className="flex-1" onClick={addActivity} disabled={saving}>{saving?'保存中...':'記録する'}</Button>
          </div>
        </CardContent></Card>
      )}
      <div className="flex flex-wrap gap-2">
        <Select value={String(year)} onValueChange={v=>setYear(Number(v))}><SelectTrigger className="w-24 h-8 text-sm"><SelectValue/></SelectTrigger><SelectContent>{[now.getFullYear()-1,now.getFullYear()].map(y=><SelectItem key={y} value={String(y)}>{y}年</SelectItem>)}</SelectContent></Select>
        <Select value={String(month)} onValueChange={v=>setMonth(Number(v))}><SelectTrigger className="w-20 h-8 text-sm"><SelectValue/></SelectTrigger><SelectContent>{Array.from({length:12},(_,i)=>i+1).map(m=><SelectItem key={m} value={String(m)}>{m}月</SelectItem>)}</SelectContent></Select>
        <Input placeholder="会社名・内容で検索..." value={search} onChange={e=>setSearch(e.target.value)} className="h-8 text-sm w-44"/>
      </div>
      <Card><CardContent className="p-0">
        {loading?<div className="flex items-center justify-center h-32"><p className="text-sm text-slate-400">読み込み中...</p></div>
        :filtered.length===0?<div className="flex items-center justify-center h-32"><p className="text-sm text-slate-400">データがありません</p></div>
        :<div className="divide-y">{filtered.map(a=>(
          <div key={a.id} className="flex items-start gap-3 p-4 hover:bg-slate-50 cursor-pointer" onClick={()=>setEditTarget(a)}>
            <span className={`mt-0.5 text-xs px-2 py-1 rounded-full font-medium shrink-0 ${TYPE_COLOR[a.activity_type]}`}>{a.activity_type}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-sm font-medium truncate">{a.company_name??'—'}</span>
                {a.contact_person&&<span className="text-xs text-slate-500">/ {a.contact_person}</span>}
                {a.is_business_trip&&<span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">出張</span>}
              </div>
              <p className="text-xs text-slate-500 truncate">{a.content??'内容未記載'}</p>
            </div>
            <span className="text-xs text-slate-400 shrink-0">{a.activity_date.slice(5).replace('-','/')}</span>
          </div>
        ))}</div>}
      </CardContent></Card>
      {editTarget&&<ActivityEditDialog activity={editTarget} onClose={()=>setEditTarget(null)} onSaved={load}/>}
    </div>
  )
}

// ─── 予算管理 ──────────────────────────────────────────────────
const MONTHS=Array.from({length:12},(_,i)=>i+1)
function pctColor(a:number,b:number){ if(b===0) return ''; const r=a/b; return r>1.1?'text-red-600 font-semibold':r>.9?'text-amber-600':'text-green-700' }

export function ReportsContent() {
  const supabase = createBrowserClient()
  const now = new Date()
  const [year,setYear]=useState(now.getFullYear()); const [month,setMonth]=useState(now.getMonth()+1)
  const [report,setReport]=useState<MonthlyReport|null>(null); const [text,setText]=useState('')
  const [generating,setGenerating]=useState(false); const [saving,setSaving]=useState(false)

  async function loadReport() {
    const{data}=await supabase.from('monthly_reports').select('*').eq('year',year).eq('month',month).single()
    setReport(data); setText(data?.final_text??'')
  }
  useEffect(()=>{loadReport()},[year,month])

  async function generate() {
    setGenerating(true)
    const start=`${year}-${String(month).padStart(2,'0')}-01`
    const end=month===12?`${year+1}-01-01`:`${year}-${String(month+1).padStart(2,'0')}-01`
    const[aRes,eRes,bRes]=await Promise.all([
      supabase.from('activities').select('*').gte('activity_date',start).lt('activity_date',end),
      supabase.from('expenses').select('*').gte('expense_date',start).lt('expense_date',end),
      supabase.from('budgets').select('*').eq('fiscal_year',year).in('month',[0,month]),
    ])
    const res=await fetch('/api/reports/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({year,month,activities:aRes.data??[],expenses:eRes.data??[],budgets:bRes.data??[]})})
    const data=await res.json()
    if(data.draft) setText(data.draft)
    setGenerating(false); loadReport()
  }

  async function saveReport(finalize=false) {
    if(!report) return; setSaving(true)
    await supabase.from('monthly_reports').update({final_text:text,status:finalize?'finalized':'reviewing',...(finalize?{finalized_at:new Date().toISOString()}:{})}).eq('id',report.id)
    setSaving(false); loadReport()
  }

  const status=report?.status

  return (
    <div className="p-6 space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold text-slate-900">月次レポート</h1><p className="text-sm text-slate-500 mt-0.5">AIが活動・経費データから報告書を自動生成します</p></div>
        {status&&<span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_MAP[status].cls}`}>{STATUS_MAP[status].label}</span>}
      </div>
      <div className="flex gap-3">
        <Select value={String(year)} onValueChange={v=>setYear(Number(v))}><SelectTrigger className="w-24 h-8 text-sm"><SelectValue/></SelectTrigger><SelectContent>{[now.getFullYear()-1,now.getFullYear()].map(y=><SelectItem key={y} value={String(y)}>{y}年</SelectItem>)}</SelectContent></Select>
        <Select value={String(month)} onValueChange={v=>setMonth(Number(v))}><SelectTrigger className="w-20 h-8 text-sm"><SelectValue/></SelectTrigger><SelectContent>{Array.from({length:12},(_,i)=>i+1).map(m=><SelectItem key={m} value={String(m)}>{m}月</SelectItem>)}</SelectContent></Select>
      </div>
      {status!=='finalized'&&(
        <Card className="border-dashed border-slate-300"><CardContent className="pt-6 text-center space-y-3">
          <p className="text-sm text-slate-500">{report?'報告書を再生成します':`${year}年${month}月の活動・経費データから報告書を自動作成します`}</p>
          <Button size="lg" onClick={generate} disabled={generating} className="min-w-48 bg-blue-600 hover:bg-blue-700">
            <Sparkles size={16} className="mr-2"/>{generating?<span className="flex items-center gap-2"><span className="animate-spin">⟳</span>生成中...</span>:'AIで月次報告書を生成'}
          </Button>
        </CardContent></Card>
      )}
      {text&&(
        <Card><CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">{year}年{month}月 報告書{report?.generated_at&&<span className="text-xs font-normal text-slate-400 ml-2">生成: {new Date(report.generated_at).toLocaleString('ja-JP')}</span>}</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={()=>{const h=`<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>${year}年${month}月</title><style>body{font-family:'Hiragino Kaku Gothic Pro',sans-serif;font-size:12px;line-height:1.9;margin:30mm 20mm}pre{white-space:pre-wrap;font-family:inherit}</style></head><body><h1>${year}年${month}月 タイ駐在員事務所 月次報告書</h1><pre>${text}</pre></body></html>`;const w=window.open('','_blank');if(w){w.document.write(h);w.document.close();w.print()}}}>
                <FileText size={13} className="mr-1"/>PDF印刷
              </Button>
              <Button variant="outline" size="sm" onClick={()=>{const b=new Blob(['\uFEFF'+text],{type:'text/plain;charset=utf-8;'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=`${year}年${month}月_月次報告書.txt`;a.click()}}>
                <Download size={13} className="mr-1"/>保存
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <textarea value={text} onChange={e=>setText(e.target.value)} className="w-full min-h-[500px] text-sm font-mono leading-relaxed resize-none border rounded-lg p-3 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-slate-50" disabled={status==='finalized'}/>
          {status!=='finalized'&&<div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={()=>saveReport(false)} disabled={saving}>{saving?'保存中...':'一時保存'}</Button>
            <Button size="sm" onClick={()=>saveReport(true)} disabled={saving} className="bg-green-600 hover:bg-green-700"><Check size={14} className="mr-1"/>{saving?'保存中...':'確定・提出完了'}</Button>
          </div>}
          {status==='finalized'&&<p className="text-xs text-slate-400 text-right">確定: {report?.finalized_at?new Date(report.finalized_at).toLocaleString('ja-JP'):'—'}</p>}
        </CardContent></Card>
      )}
    </div>
  )
}

// ─── 給与管理 ──────────────────────────────────────────────────
const PAYROLL_RATE = 4.2
const fmtThbJpy = (thb: number) => `฿${Math.round(thb).toLocaleString()}（¥${Math.round(thb * PAYROLL_RATE).toLocaleString()}）`

interface Payroll {
  id: string; year: number; month: number; employee_name: string
  base_salary_thb: number; social_security_thb: number
  withholding_tax_thb: number; net_salary_thb: number
  exchange_rate: number; paid_at: string|null; notes: string|null
}

export function PayrollPage() {
  const supabase = createBrowserClient()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth()+1)
  const [records, setRecords] = useState<Payroll[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ employee_name:'', base_salary_thb:'', social_security_thb:'750', withholding_tax_thb:'0', paid_at:'', notes:'' })

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('payroll').select('*').eq('year',year).eq('month',month).order('created_at')
    setRecords(data??[]); setLoading(false)
  },[year,month])
  useEffect(()=>{ load() },[load])

  const netSalary = form.base_salary_thb ? parseFloat(form.base_salary_thb) - parseFloat(form.social_security_thb||'0') - parseFloat(form.withholding_tax_thb||'0') : 0

  async function savePayroll() {
    if(!form.employee_name||!form.base_salary_thb) return; setSaving(true)
    const{data:{user}}=await supabase.auth.getUser()
    await supabase.from('payroll').insert({ user_id:user?.id, year, month, employee_name:form.employee_name, base_salary_thb:parseFloat(form.base_salary_thb), social_security_thb:parseFloat(form.social_security_thb||'0'), withholding_tax_thb:parseFloat(form.withholding_tax_thb||'0'), net_salary_thb:netSalary, exchange_rate:PAYROLL_RATE, paid_at:form.paid_at||null, notes:form.notes||null })
    setSaving(false); setShowNew(false); setForm({employee_name:'',base_salary_thb:'',social_security_thb:'750',withholding_tax_thb:'0',paid_at:'',notes:''}); load()
  }

  const totalBase=records.reduce((s,r)=>s+r.base_salary_thb,0)
  const totalNet=records.reduce((s,r)=>s+r.net_salary_thb,0)
  const totalSS=records.reduce((s,r)=>s+r.social_security_thb,0)
  const totalWT=records.reduce((s,r)=>s+r.withholding_tax_thb,0)

  return (
    <div className="p-6 space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold text-slate-900">給与管理</h1><p className="text-sm text-slate-500 mt-0.5">{year}年{month}月</p></div>
        <Button size="sm" onClick={()=>setShowNew(v=>!v)}><Plus size={13} className="mr-1"/>{showNew?'閉じる':'給与を追加'}</Button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[{l:'基本給合計',v:fmtThbJpy(totalBase)},{l:'社会保険合計',v:fmtThbJpy(totalSS)},{l:'源泉徴収合計',v:fmtThbJpy(totalWT)},{l:'手取り合計',v:fmtThbJpy(totalNet)}].map(c=>(
          <Card key={c.l}><CardContent className="pt-4 pb-3"><p className="text-xs text-slate-500 mb-1">{c.l}</p><p className="text-sm font-bold">{c.v}</p></CardContent></Card>
        ))}
      </div>
      <div className="flex gap-2">
        <Select value={String(year)} onValueChange={v=>setYear(Number(v))}><SelectTrigger className="w-24 h-8 text-sm"><SelectValue/></SelectTrigger><SelectContent>{[now.getFullYear()-1,now.getFullYear()].map(y=><SelectItem key={y} value={String(y)}>{y}年</SelectItem>)}</SelectContent></Select>
        <Select value={String(month)} onValueChange={v=>setMonth(Number(v))}><SelectTrigger className="w-20 h-8 text-sm"><SelectValue/></SelectTrigger><SelectContent>{Array.from({length:12},(_,i)=>i+1).map(m=><SelectItem key={m} value={String(m)}>{m}月</SelectItem>)}</SelectContent></Select>
      </div>
      {showNew&&(
        <Card className="border-blue-200 bg-blue-50/30"><CardContent className="pt-4 space-y-3">
          <p className="text-sm font-semibold">給与入力</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label className="text-xs text-slate-500">氏名</Label><Input value={form.employee_name} onChange={e=>setForm(f=>({...f,employee_name:e.target.value}))} className="h-8 text-sm" placeholder="山田太郎"/></div>
            <div className="space-y-1"><Label className="text-xs text-slate-500">支払日</Label><Input type="date" value={form.paid_at} onChange={e=>setForm(f=>({...f,paid_at:e.target.value}))} className="h-8 text-sm"/></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1"><Label className="text-xs text-slate-500">基本給（THB）</Label><Input type="number" value={form.base_salary_thb} onChange={e=>setForm(f=>({...f,base_salary_thb:e.target.value}))} className="h-8 text-sm" placeholder="0"/></div>
            <div className="space-y-1"><Label className="text-xs text-slate-500">社会保険（THB）</Label><Input type="number" value={form.social_security_thb} onChange={e=>setForm(f=>({...f,social_security_thb:e.target.value}))} className="h-8 text-sm"/></div>
            <div className="space-y-1"><Label className="text-xs text-slate-500">源泉徴収（THB）</Label><Input type="number" value={form.withholding_tax_thb} onChange={e=>setForm(f=>({...f,withholding_tax_thb:e.target.value}))} className="h-8 text-sm"/></div>
          </div>
          {form.base_salary_thb&&<div className="bg-white rounded-lg p-3 border border-blue-100"><p className="text-xs text-slate-500 mb-1">手取り（計算結果）</p><p className="text-lg font-bold text-blue-700">{fmtThbJpy(netSalary)}</p></div>}
          <Button size="sm" onClick={savePayroll} disabled={saving||!form.employee_name||!form.base_salary_thb} className="w-full">{saving?'保存中...':'給与を保存'}</Button>
        </CardContent></Card>
      )}
      <Card><CardContent className="p-0">
        {loading?<div className="flex items-center justify-center h-32"><p className="text-sm text-slate-400">読み込み中...</p></div>
        :records.length===0?<div className="flex items-center justify-center h-32"><p className="text-sm text-slate-400">データがありません</p></div>
        :<div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="border-b bg-slate-50">
            <th className="text-left py-2.5 px-4 text-xs font-medium text-slate-500">氏名</th>
            <th className="text-right py-2.5 px-3 text-xs font-medium text-slate-500">基本給</th>
            <th className="text-right py-2.5 px-3 text-xs font-medium text-slate-500">社保</th>
            <th className="text-right py-2.5 px-3 text-xs font-medium text-slate-500">源泉</th>
            <th className="text-right py-2.5 px-3 text-xs font-medium text-slate-500">手取り</th>
            <th className="text-left py-2.5 px-3 text-xs font-medium text-slate-500">支払日</th>
          </tr></thead>
          <tbody>{records.map(r=>(
            <tr key={r.id} className="border-b hover:bg-slate-50">
              <td className="py-3 px-4 font-medium">{r.employee_name}</td>
              <td className="py-3 px-3 text-right"><div className="font-medium">฿{r.base_salary_thb.toLocaleString()}</div><div className="text-xs text-slate-400">¥{Math.round(r.base_salary_thb*PAYROLL_RATE).toLocaleString()}</div></td>
              <td className="py-3 px-3 text-right text-slate-500">฿{r.social_security_thb.toLocaleString()}</td>
              <td className="py-3 px-3 text-right text-slate-500">฿{r.withholding_tax_thb.toLocaleString()}</td>
              <td className="py-3 px-3 text-right"><div className="font-bold text-blue-700">฿{r.net_salary_thb.toLocaleString()}</div><div className="text-xs text-slate-400">¥{Math.round(r.net_salary_thb*PAYROLL_RATE).toLocaleString()}</div></td>
              <td className="py-3 px-3 text-slate-500 text-xs">{r.paid_at??'未払い'}</td>
            </tr>
          ))}</tbody>
          <tfoot><tr className="border-t-2 bg-slate-50">
            <td className="py-2.5 px-4 font-bold text-sm">合計</td>
            <td className="py-2.5 px-3 text-right"><div className="font-bold">฿{Math.round(totalBase).toLocaleString()}</div><div className="text-xs text-slate-400">¥{Math.round(totalBase*PAYROLL_RATE).toLocaleString()}</div></td>
            <td className="py-2.5 px-3 text-right text-slate-500">฿{Math.round(totalSS).toLocaleString()}</td>
            <td className="py-2.5 px-3 text-right text-slate-500">฿{Math.round(totalWT).toLocaleString()}</td>
            <td className="py-2.5 px-3 text-right"><div className="font-bold text-blue-700">฿{Math.round(totalNet).toLocaleString()}</div><div className="text-xs text-slate-400">¥{Math.round(totalNet*PAYROLL_RATE).toLocaleString()}</div></td>
            <td/>
          </tr></tfoot>
        </table></div>}
      </CardContent></Card>
    </div>
  )
}

// ─── 税務カレンダー ────────────────────────────────────────────
interface TaxEvent {
  id:string; title:string; event_type:string; due_date:string
  status:string; amount_thb:number|null; notes:string|null; completed_at:string|null
}

export function TaxCalendarPage() {
  const supabase = createBrowserClient()
  const [events, setEvents] = useState<TaxEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({title:'',due_date:'',amount_thb:'',notes:''})

  async function loadTax() { setLoading(true); const{data}=await supabase.from('tax_events').select('*').order('due_date'); setEvents(data??[]); setLoading(false) }
  useEffect(()=>{ loadTax() },[])

  async function markComplete(id:string) { await supabase.from('tax_events').update({status:'completed',completed_at:new Date().toISOString().slice(0,10)}).eq('id',id); loadTax() }

  async function saveTax() {
    if(!form.title||!form.due_date) return; setSaving(true)
    await supabase.from('tax_events').insert({title:form.title,event_type:'monthly_tax',due_date:form.due_date,amount_thb:form.amount_thb?parseFloat(form.amount_thb):null,notes:form.notes||null})
    setSaving(false); setShowNew(false); setForm({title:'',due_date:'',amount_thb:'',notes:''}); loadTax()
  }

  const today=new Date().toISOString().slice(0,10)
  const upcoming=events.filter(e=>e.status==='pending'&&e.due_date>=today)
  const overdue=events.filter(e=>e.status==='pending'&&e.due_date<today)
  const done=events.filter(e=>e.status==='completed')
  const daysLeft=(d:string)=>Math.ceil((new Date(d).getTime()-new Date().getTime())/86400000)

  return (
    <div className="p-6 space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold text-slate-900">税務カレンダー</h1><p className="text-sm text-slate-500 mt-0.5">申告・納税期限の管理</p></div>
        <Button size="sm" onClick={()=>setShowNew(v=>!v)}><Plus size={13} className="mr-1"/>{showNew?'閉じる':'期限を追加'}</Button>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-red-200"><CardContent className="pt-4 pb-3 text-center"><p className="text-2xl font-bold text-red-600">{overdue.length}</p><p className="text-xs text-slate-500 mt-1">期限超過</p></CardContent></Card>
        <Card className="border-amber-200"><CardContent className="pt-4 pb-3 text-center"><p className="text-2xl font-bold text-amber-600">{upcoming.length}</p><p className="text-xs text-slate-500 mt-1">対応待ち</p></CardContent></Card>
        <Card className="border-green-200"><CardContent className="pt-4 pb-3 text-center"><p className="text-2xl font-bold text-green-600">{done.length}</p><p className="text-xs text-slate-500 mt-1">完了済み</p></CardContent></Card>
      </div>
      {showNew&&(
        <Card className="border-blue-200 bg-blue-50/30"><CardContent className="pt-4 space-y-3">
          <Input placeholder="タイトル（例：源泉徴収税 月次申告 PND1）" value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} className="h-8 text-sm"/>
          <div className="grid grid-cols-2 gap-3">
            <Input type="date" value={form.due_date} onChange={e=>setForm(f=>({...f,due_date:e.target.value}))} className="h-8 text-sm"/>
            <Input type="number" placeholder="金額（THB・任意）" value={form.amount_thb} onChange={e=>setForm(f=>({...f,amount_thb:e.target.value}))} className="h-8 text-sm"/>
          </div>
          <Button size="sm" onClick={saveTax} disabled={saving||!form.title||!form.due_date} className="w-full">{saving?'保存中...':'追加する'}</Button>
        </CardContent></Card>
      )}
      {loading?<div className="text-center py-8 text-slate-400">読み込み中...</div>:(
        <div className="space-y-3">
          {overdue.length>0&&<div><p className="text-sm font-semibold text-red-600 mb-2">⚠ 期限超過</p><div className="space-y-2">{overdue.map(e=>(
            <Card key={e.id} className="border-red-200"><CardContent className="pt-3 pb-3 flex items-center gap-3">
              <div className="flex-1"><p className="text-sm font-medium">{e.title}</p><div className="text-xs text-slate-500 flex gap-3 mt-0.5"><span>期限: {e.due_date}</span><span className="text-red-600">{Math.abs(daysLeft(e.due_date))}日超過</span>{e.amount_thb&&<span>฿{e.amount_thb.toLocaleString()}（¥{Math.round(e.amount_thb*4.2).toLocaleString()}）</span>}</div></div>
              <Button size="sm" variant="outline" onClick={()=>markComplete(e.id)} className="text-xs h-7 shrink-0">完了</Button>
            </CardContent></Card>
          ))}</div></div>}
          {upcoming.length>0&&<div><p className="text-sm font-semibold text-slate-700 mb-2">対応待ち</p><div className="space-y-2">{upcoming.map(e=>(
            <Card key={e.id}><CardContent className="pt-3 pb-3 flex items-center gap-3">
              <div className="flex-1"><p className="text-sm font-medium">{e.title}</p><div className="text-xs text-slate-500 flex gap-3 mt-0.5"><span>期限: {e.due_date}</span><span className={daysLeft(e.due_date)<=7?'text-red-600 font-medium':daysLeft(e.due_date)<=30?'text-amber-600':''}>あと{daysLeft(e.due_date)}日</span>{e.amount_thb&&<span>฿{e.amount_thb.toLocaleString()}（¥{Math.round(e.amount_thb*4.2).toLocaleString()}）</span>}</div></div>
              <Button size="sm" variant="outline" onClick={()=>markComplete(e.id)} className="text-xs h-7 shrink-0">完了</Button>
            </CardContent></Card>
          ))}</div></div>}
          {done.length>0&&<div><p className="text-sm font-semibold text-green-600 mb-2">✓ 完了済み</p><div className="space-y-2">{done.map(e=>(
            <Card key={e.id} className="border-green-200 opacity-60"><CardContent className="pt-3 pb-3"><p className="text-sm">{e.title}</p><p className="text-xs text-slate-400">完了日: {e.completed_at}</p></CardContent></Card>
          ))}</div></div>}
        </div>
      )}
    </div>
  )
}

// ─── ビザ・WP管理 ──────────────────────────────────────────────
interface VisaWP {
  id:string; employee_name:string; document_type:string
  issue_date:string|null; expiry_date:string
  ninety_day_report_due:string|null; status:string; notes:string|null
}

export function VisaWPPage() {
  const supabase = createBrowserClient()
  const [records, setRecords] = useState<VisaWP[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({employee_name:'',document_type:'visa',issue_date:'',expiry_date:'',ninety_day_report_due:'',notes:''})

  async function loadVisa() { setLoading(true); const{data}=await supabase.from('visa_wp').select('*').order('expiry_date'); setRecords(data??[]); setLoading(false) }
  useEffect(()=>{ loadVisa() },[])

  async function saveVisa() {
    if(!form.employee_name||!form.expiry_date) return; setSaving(true)
    await supabase.from('visa_wp').insert({employee_name:form.employee_name,document_type:form.document_type,issue_date:form.issue_date||null,expiry_date:form.expiry_date,ninety_day_report_due:form.ninety_day_report_due||null,notes:form.notes||null})
    setSaving(false); setShowNew(false); setForm({employee_name:'',document_type:'visa',issue_date:'',expiry_date:'',ninety_day_report_due:'',notes:''}); loadVisa()
  }

  const daysUntil=(d:string)=>Math.ceil((new Date(d).getTime()-new Date().getTime())/86400000)
  const expiringSoon=records.filter(r=>daysUntil(r.expiry_date)<=90&&daysUntil(r.expiry_date)>0)

  return (
    <div className="p-6 space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold text-slate-900">ビザ・WP管理</h1><p className="text-sm text-slate-500 mt-0.5">有効期限・90日報告の管理</p></div>
        <Button size="sm" onClick={()=>setShowNew(v=>!v)}><Plus size={13} className="mr-1"/>{showNew?'閉じる':'追加'}</Button>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="pt-4 pb-3 text-center"><p className="text-2xl font-bold">{records.length}</p><p className="text-xs text-slate-500 mt-1">登録件数</p></CardContent></Card>
        <Card className={expiringSoon.length>0?'border-amber-300':''}><CardContent className="pt-4 pb-3 text-center"><p className={`text-2xl font-bold ${expiringSoon.length>0?'text-amber-600':''}`}>{expiringSoon.length}</p><p className="text-xs text-slate-500 mt-1">90日以内期限切れ</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 text-center"><p className="text-2xl font-bold">{records.filter(r=>r.ninety_day_report_due&&daysUntil(r.ninety_day_report_due)<=30&&daysUntil(r.ninety_day_report_due)>0).length}</p><p className="text-xs text-slate-500 mt-1">90日報告期限迫る</p></CardContent></Card>
      </div>
      {showNew&&(
        <Card className="border-blue-200 bg-blue-50/30"><CardContent className="pt-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label className="text-xs text-slate-500">氏名</Label><Input value={form.employee_name} onChange={e=>setForm(f=>({...f,employee_name:e.target.value}))} className="h-8 text-sm"/></div>
            <div className="space-y-1"><Label className="text-xs text-slate-500">種類</Label>
              <Select value={form.document_type} onValueChange={v=>setForm(f=>({...f,document_type:v}))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue/></SelectTrigger>
                <SelectContent><SelectItem value="visa">ビザ</SelectItem><SelectItem value="work_permit">労働許可証（WP）</SelectItem></SelectContent>
              </Select></div>
            <div className="space-y-1"><Label className="text-xs text-slate-500">発行日</Label><Input type="date" value={form.issue_date} onChange={e=>setForm(f=>({...f,issue_date:e.target.value}))} className="h-8 text-sm"/></div>
            <div className="space-y-1"><Label className="text-xs text-slate-500">有効期限 *</Label><Input type="date" value={form.expiry_date} onChange={e=>setForm(f=>({...f,expiry_date:e.target.value}))} className="h-8 text-sm"/></div>
            <div className="space-y-1 col-span-2"><Label className="text-xs text-slate-500">90日報告期限</Label><Input type="date" value={form.ninety_day_report_due} onChange={e=>setForm(f=>({...f,ninety_day_report_due:e.target.value}))} className="h-8 text-sm"/></div>
          </div>
          <Button size="sm" onClick={saveVisa} disabled={saving||!form.employee_name||!form.expiry_date} className="w-full">{saving?'保存中...':'登録する'}</Button>
        </CardContent></Card>
      )}
      <div className="space-y-2">
        {loading?<div className="text-center py-8 text-slate-400">読み込み中...</div>
        :records.length===0?<div className="text-center py-8 text-slate-400">データがありません</div>
        :records.map(r=>{
          const days=daysUntil(r.expiry_date); const urgent=days<=90
          return (
            <Card key={r.id} className={urgent?'border-amber-200':''}>
              <CardContent className="pt-3 pb-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-sm">{r.employee_name}</span>
                  <span className="text-xs bg-slate-100 px-2 py-0.5 rounded">{r.document_type==='visa'?'ビザ':'労働許可証'}</span>
                  {urgent&&<span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded">あと{days}日</span>}
                </div>
                <div className="text-xs text-slate-500 space-y-0.5">
                  {r.issue_date&&<p>発行日: {r.issue_date}</p>}
                  <p className={urgent?'text-amber-700 font-medium':''}>有効期限: {r.expiry_date}</p>
                  {r.ninety_day_report_due&&<p className={daysUntil(r.ninety_day_report_due)<=30?'text-red-600 font-medium':''}>90日報告期限: {r.ninety_day_report_due}（あと{daysUntil(r.ninety_day_report_due)}日）</p>}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

// ─── システム設定 ──────────────────────────────────────────────
export function SettingsPage() {
  const supabase = createBrowserClient()
  const [rate, setRate] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    supabase.from('settings').select('*').eq('key', 'exchange_rate').single()
      .then(({ data }) => { if (data) setRate(data.value); setLoading(false) })
  }, [])

  async function save() {
    if (!rate || isNaN(parseFloat(rate))) return
    setSaving(true)
    await supabase.from('settings').update({ value: rate, updated_at: new Date().toISOString() }).eq('key', 'exchange_rate')
    setSaving(false); setMsg('保存しました'); setTimeout(() => setMsg(''), 3000)
  }

  return (
    <div className="p-6 space-y-6 max-w-xl">
      <div><h1 className="text-xl font-bold text-slate-900">システム設定</h1>
        <p className="text-sm text-slate-500 mt-0.5">為替レートなどの基本設定</p></div>

      <Card><CardContent className="pt-5 space-y-4">
        <div>
          <p className="text-sm font-semibold text-slate-700 mb-3">為替レート設定</p>
          {loading ? <p className="text-sm text-slate-400">読み込み中...</p> : (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs text-slate-500">1 THB = ? 円</Label>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 flex-1">
                    <span className="text-sm text-slate-500">1 THB =</span>
                    <Input
                      type="number"
                      step="0.01"
                      value={rate}
                      onChange={e => setRate(e.target.value)}
                      className="w-32 h-9 text-sm"
                      placeholder="4.80"
                    />
                    <span className="text-sm text-slate-500">円</span>
                  </div>
                  <Button size="sm" onClick={save} disabled={saving} className="shrink-0">
                    {saving ? '保存中...' : '保存'}
                  </Button>
                </div>
              </div>
              {rate && !isNaN(parseFloat(rate)) && (
                <div className="bg-blue-50 rounded-lg p-3 text-sm text-blue-700">
                  <p>例：฿10,000 = ¥{Math.round(10000 * parseFloat(rate)).toLocaleString()}</p>
                  <p>例：฿100,000 = ¥{Math.round(100000 * parseFloat(rate)).toLocaleString()}</p>
                </div>
              )}
              {msg && <p className="text-sm text-green-600">{msg}</p>}
              <p className="text-xs text-slate-400">※ 変更後は新規入力分から反映されます。過去データの換算値は変わりません。</p>
            </div>
          )}
        </div>
      </CardContent></Card>
    </div>
  )
}
