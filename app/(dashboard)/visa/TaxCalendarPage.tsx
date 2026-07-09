'use client'
import { useState, useEffect } from 'react'
import { createBrowserClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, CheckCircle, Clock, AlertTriangle } from 'lucide-react'

interface TaxEvent {
  id: string; title: string; event_type: string; due_date: string
  status: string; amount_thb: number|null; notes: string|null; completed_at: string|null
}

const RATE = 4.2
const STATUS_MAP = {
  pending:   { label:'未対応', icon:Clock, cls:'text-amber-600 bg-amber-50' },
  completed: { label:'完了',   icon:CheckCircle, cls:'text-green-600 bg-green-50' },
  overdue:   { label:'期限超過', icon:AlertTriangle, cls:'text-red-600 bg-red-50' },
}

export default function TaxCalendarPage() {
  const supabase = createBrowserClient()
  const [events, setEvents] = useState<TaxEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ title:'', event_type:'monthly_tax', due_date:'', amount_thb:'', notes:'' })

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('tax_events').select('*').order('due_date')
    setEvents(data??[]); setLoading(false)
  }
  useEffect(()=>{ load() },[])

  async function markComplete(id: string) {
    await supabase.from('tax_events').update({ status:'completed', completed_at: new Date().toISOString().slice(0,10) }).eq('id',id)
    load()
  }

  async function save() {
    if (!form.title || !form.due_date) return; setSaving(true)
    await supabase.from('tax_events').insert({
      title: form.title, event_type: form.event_type, due_date: form.due_date,
      amount_thb: form.amount_thb ? parseFloat(form.amount_thb) : null,
      notes: form.notes || null,
    })
    setSaving(false); setShowNew(false); setForm({title:'',event_type:'monthly_tax',due_date:'',amount_thb:'',notes:''}); load()
  }

  const today = new Date().toISOString().slice(0,10)
  const upcoming = events.filter(e=>e.status==='pending' && e.due_date >= today)
  const overdue  = events.filter(e=>e.status==='pending' && e.due_date < today)
  const done     = events.filter(e=>e.status==='completed')

  return (
    <div className="p-6 space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold text-slate-900">税務カレンダー</h1>
          <p className="text-sm text-slate-500 mt-0.5">申告・納税期限の管理</p></div>
        <Button size="sm" onClick={()=>setShowNew(v=>!v)}><Plus size={13} className="mr-1"/>{showNew?'閉じる':'期限を追加'}</Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card className="border-red-200"><CardContent className="pt-4 pb-3 text-center">
          <p className="text-2xl font-bold text-red-600">{overdue.length}</p>
          <p className="text-xs text-slate-500 mt-1">期限超過</p>
        </CardContent></Card>
        <Card className="border-amber-200"><CardContent className="pt-4 pb-3 text-center">
          <p className="text-2xl font-bold text-amber-600">{upcoming.length}</p>
          <p className="text-xs text-slate-500 mt-1">対応待ち</p>
        </CardContent></Card>
        <Card className="border-green-200"><CardContent className="pt-4 pb-3 text-center">
          <p className="text-2xl font-bold text-green-600">{done.length}</p>
          <p className="text-xs text-slate-500 mt-1">完了済み</p>
        </CardContent></Card>
      </div>

      {showNew && (
        <Card className="border-blue-200 bg-blue-50/30"><CardContent className="pt-4 space-y-3">
          <p className="text-sm font-semibold">税務イベント追加</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1 col-span-2">
              <Input placeholder="タイトル（例：源泉徴収税 月次申告）" value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} className="h-8 text-sm"/>
            </div>
            <Input type="date" value={form.due_date} onChange={e=>setForm(f=>({...f,due_date:e.target.value}))} className="h-8 text-sm"/>
            <Input type="number" placeholder="金額（THB・任意）" value={form.amount_thb} onChange={e=>setForm(f=>({...f,amount_thb:e.target.value}))} className="h-8 text-sm"/>
          </div>
          <Input placeholder="備考（任意）" value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} className="h-8 text-sm"/>
          <Button size="sm" onClick={save} disabled={saving||!form.title||!form.due_date} className="w-full">{saving?'保存中...':'追加する'}</Button>
        </CardContent></Card>
      )}

      {loading ? <div className="text-center py-8 text-slate-400">読み込み中...</div> : (
        <div className="space-y-4">
          {overdue.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-red-600 mb-2 flex items-center gap-1"><AlertTriangle size={14}/>期限超過</h2>
              <div className="space-y-2">{overdue.map(e=><EventCard key={e.id} event={e} onComplete={markComplete}/>)}</div>
            </div>
          )}
          {upcoming.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-slate-700 mb-2">対応待ち</h2>
              <div className="space-y-2">{upcoming.map(e=><EventCard key={e.id} event={e} onComplete={markComplete}/>)}</div>
            </div>
          )}
          {done.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-green-600 mb-2">完了済み</h2>
              <div className="space-y-2">{done.map(e=><EventCard key={e.id} event={e} onComplete={markComplete}/>)}</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function EventCard({ event, onComplete }: { event: TaxEvent; onComplete: (id:string)=>void }) {
  const RATE = 4.2
  const today = new Date().toISOString().slice(0,10)
  const isOverdue = event.status==='pending' && event.due_date < today
  const daysLeft = Math.ceil((new Date(event.due_date).getTime() - new Date().getTime()) / 86400000)

  return (
    <Card className={`${isOverdue?'border-red-200':event.status==='completed'?'border-green-200':''}`}>
      <CardContent className="pt-3 pb-3 flex items-center gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-medium text-slate-900">{event.title}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${isOverdue?'bg-red-100 text-red-700':event.status==='completed'?'bg-green-100 text-green-700':'bg-amber-100 text-amber-700'}`}>
              {isOverdue?'超過':event.status==='completed'?'完了':'待ち'}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span>期限: {event.due_date}</span>
            {event.status==='pending' && <span className={daysLeft<=7?'text-red-600 font-medium':daysLeft<=30?'text-amber-600':''}>
              {daysLeft>0?`あと${daysLeft}日`:`${Math.abs(daysLeft)}日超過`}
            </span>}
            {event.amount_thb && <span>฿{event.amount_thb.toLocaleString()}（¥{Math.round(event.amount_thb*RATE).toLocaleString()}）</span>}
          </div>
          {event.notes && <p className="text-xs text-slate-400 mt-0.5">{event.notes}</p>}
        </div>
        {event.status==='pending' && (
          <Button size="sm" variant="outline" onClick={()=>onComplete(event.id)} className="shrink-0 text-xs h-7">
            <CheckCircle size={12} className="mr-1"/>完了
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
export const dynamic = 'force-dynamic'
