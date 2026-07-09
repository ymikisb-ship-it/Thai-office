'use client'
import { useState, useEffect } from 'react'
import { createBrowserClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, AlertTriangle, CheckCircle } from 'lucide-react'

interface VisaWP {
  id: string; employee_name: string; document_type: string
  issue_date: string|null; expiry_date: string
  ninety_day_report_due: string|null; status: string; notes: string|null
}

export default function VisaWPPage() {
  const supabase = createBrowserClient()
  const [records, setRecords] = useState<VisaWP[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    employee_name:'', document_type:'visa', issue_date:'', expiry_date:'',
    ninety_day_report_due:'', notes:''
  })

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('visa_wp').select('*').order('expiry_date')
    setRecords(data??[]); setLoading(false)
  }
  useEffect(()=>{ load() },[])

  async function save() {
    if (!form.employee_name || !form.expiry_date) return; setSaving(true)
    await supabase.from('visa_wp').insert({
      employee_name: form.employee_name, document_type: form.document_type,
      issue_date: form.issue_date||null, expiry_date: form.expiry_date,
      ninety_day_report_due: form.ninety_day_report_due||null,
      notes: form.notes||null,
    })
    setSaving(false); setShowNew(false)
    setForm({employee_name:'',document_type:'visa',issue_date:'',expiry_date:'',ninety_day_report_due:'',notes:''})
    load()
  }

  const today = new Date().toISOString().slice(0,10)
  const daysUntil = (date: string) => Math.ceil((new Date(date).getTime() - new Date().getTime()) / 86400000)

  const expiringSoon = records.filter(r => daysUntil(r.expiry_date) <= 90 && daysUntil(r.expiry_date) > 0)
  const reportDue = records.filter(r => r.ninety_day_report_due && daysUntil(r.ninety_day_report_due) <= 30 && daysUntil(r.ninety_day_report_due) > 0)

  return (
    <div className="p-6 space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold text-slate-900">ビザ・WP管理</h1>
          <p className="text-sm text-slate-500 mt-0.5">有効期限・90日報告の管理</p></div>
        <Button size="sm" onClick={()=>setShowNew(v=>!v)}><Plus size={13} className="mr-1"/>{showNew?'閉じる':'追加'}</Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="pt-4 pb-3 text-center">
          <p className="text-2xl font-bold text-slate-900">{records.length}</p>
          <p className="text-xs text-slate-500 mt-1">登録件数</p>
        </CardContent></Card>
        <Card className={expiringSoon.length>0?'border-amber-300':''}><CardContent className="pt-4 pb-3 text-center">
          <p className={`text-2xl font-bold ${expiringSoon.length>0?'text-amber-600':'text-slate-900'}`}>{expiringSoon.length}</p>
          <p className="text-xs text-slate-500 mt-1">90日以内に期限切れ</p>
        </CardContent></Card>
        <Card className={reportDue.length>0?'border-red-300':''}><CardContent className="pt-4 pb-3 text-center">
          <p className={`text-2xl font-bold ${reportDue.length>0?'text-red-600':'text-slate-900'}`}>{reportDue.length}</p>
          <p className="text-xs text-slate-500 mt-1">90日報告期限迫る</p>
        </CardContent></Card>
      </div>

      {(expiringSoon.length > 0 || reportDue.length > 0) && (
        <Card className="border-amber-200 bg-amber-50/50"><CardContent className="pt-3 pb-3 space-y-1">
          <p className="text-xs font-semibold text-amber-700 flex items-center gap-1"><AlertTriangle size={12}/>要対応アラート</p>
          {expiringSoon.map(r=>(
            <p key={r.id} className="text-xs text-amber-700">
              • {r.employee_name}の{r.document_type==='visa'?'ビザ':'労働許可証'}があと{daysUntil(r.expiry_date)}日で期限切れ（{r.expiry_date}）
            </p>
          ))}
          {reportDue.map(r=>(
            <p key={`90-${r.id}`} className="text-xs text-red-700">
              • {r.employee_name}の90日報告期限まであと{daysUntil(r.ninety_day_report_due!)}日（{r.ninety_day_report_due}）
            </p>
          ))}
        </CardContent></Card>
      )}

      {showNew && (
        <Card className="border-blue-200 bg-blue-50/30"><CardContent className="pt-4 space-y-3">
          <p className="text-sm font-semibold">ビザ・WP登録</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label className="text-xs text-slate-500">氏名</Label>
              <Input value={form.employee_name} onChange={e=>setForm(f=>({...f,employee_name:e.target.value}))} className="h-8 text-sm"/></div>
            <div className="space-y-1"><Label className="text-xs text-slate-500">種類</Label>
              <Select value={form.document_type} onValueChange={v=>setForm(f=>({...f,document_type:v}))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="visa">ビザ</SelectItem>
                  <SelectItem value="work_permit">労働許可証（WP）</SelectItem>
                </SelectContent>
              </Select></div>
            <div className="space-y-1"><Label className="text-xs text-slate-500">発行日</Label>
              <Input type="date" value={form.issue_date} onChange={e=>setForm(f=>({...f,issue_date:e.target.value}))} className="h-8 text-sm"/></div>
            <div className="space-y-1"><Label className="text-xs text-slate-500">有効期限 *</Label>
              <Input type="date" value={form.expiry_date} onChange={e=>setForm(f=>({...f,expiry_date:e.target.value}))} className="h-8 text-sm"/></div>
            <div className="space-y-1 col-span-2"><Label className="text-xs text-slate-500">90日報告期限</Label>
              <Input type="date" value={form.ninety_day_report_due} onChange={e=>setForm(f=>({...f,ninety_day_report_due:e.target.value}))} className="h-8 text-sm"/></div>
          </div>
          <Input placeholder="備考" value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} className="h-8 text-sm"/>
          <Button size="sm" onClick={save} disabled={saving||!form.employee_name||!form.expiry_date} className="w-full">{saving?'保存中...':'登録する'}</Button>
        </CardContent></Card>
      )}

      <div className="space-y-2">
        {loading?<div className="text-center py-8 text-slate-400">読み込み中...</div>
        :records.length===0?<div className="text-center py-8 text-slate-400">データがありません</div>
        :records.map(r=>{
          const days = daysUntil(r.expiry_date)
          const urgent = days <= 90
          return (
            <Card key={r.id} className={urgent?'border-amber-200':''}>
              <CardContent className="pt-3 pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm">{r.employee_name}</span>
                      <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                        {r.document_type==='visa'?'ビザ':'労働許可証'}
                      </span>
                      {urgent && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded flex items-center gap-0.5">
                        <AlertTriangle size={10}/>あと{days}日
                      </span>}
                    </div>
                    <div className="text-xs text-slate-500 space-y-0.5">
                      {r.issue_date && <p>発行日: {r.issue_date}</p>}
                      <p className={urgent?'text-amber-700 font-medium':''}>有効期限: {r.expiry_date}</p>
                      {r.ninety_day_report_due && <p className={daysUntil(r.ninety_day_report_due)<=30?'text-red-600 font-medium':''}>
                        90日報告期限: {r.ninety_day_report_due}（あと{daysUntil(r.ninety_day_report_due)}日）
                      </p>}
                      {r.notes && <p className="text-slate-400">{r.notes}</p>}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
export const dynamic = 'force-dynamic'
