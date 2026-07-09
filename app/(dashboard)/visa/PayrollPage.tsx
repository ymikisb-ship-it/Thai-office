'use client'
import { useState, useEffect, useCallback } from 'react'
import { createBrowserClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Download } from 'lucide-react'

const RATE = 4.2
const fmt = (thb: number) => `฿${Math.round(thb).toLocaleString()}（¥${Math.round(thb * RATE).toLocaleString()}）`

interface Payroll {
  id: string; year: number; month: number; employee_name: string
  base_salary_thb: number; social_security_thb: number
  withholding_tax_thb: number; net_salary_thb: number
  exchange_rate: number; paid_at: string|null; notes: string|null; created_at: string
}

export default function PayrollPage() {
  const supabase = createBrowserClient()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth()+1)
  const [records, setRecords] = useState<Payroll[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    employee_name: '', base_salary_thb: '', social_security_thb: '750',
    withholding_tax_thb: '0', paid_at: '', notes: ''
  })

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('payroll').select('*')
      .eq('year', year).eq('month', month).order('created_at')
    setRecords(data ?? []); setLoading(false)
  }, [year, month])
  useEffect(() => { load() }, [load])

  const netSalary = form.base_salary_thb
    ? parseFloat(form.base_salary_thb) - parseFloat(form.social_security_thb||'0') - parseFloat(form.withholding_tax_thb||'0')
    : 0

  async function save() {
    if (!form.employee_name || !form.base_salary_thb) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('payroll').insert({
      user_id: user?.id, year, month,
      employee_name: form.employee_name,
      base_salary_thb: parseFloat(form.base_salary_thb),
      social_security_thb: parseFloat(form.social_security_thb||'0'),
      withholding_tax_thb: parseFloat(form.withholding_tax_thb||'0'),
      net_salary_thb: netSalary,
      exchange_rate: RATE,
      paid_at: form.paid_at || null,
      notes: form.notes || null,
    })
    setSaving(false); setShowNew(false)
    setForm({ employee_name:'', base_salary_thb:'', social_security_thb:'750', withholding_tax_thb:'0', paid_at:'', notes:'' })
    load()
  }

  function exportCSV() {
    const h = '年,月,氏名,基本給(THB),基本給(JPY),社会保険(THB),源泉徴収(THB),手取り(THB),手取り(JPY),支払日'
    const lines = records.map(r =>
      `${r.year},${r.month},${r.employee_name},${r.base_salary_thb},${Math.round(r.base_salary_thb*RATE)},${r.social_security_thb},${r.withholding_tax_thb},${r.net_salary_thb},${Math.round(r.net_salary_thb*RATE)},${r.paid_at??''}`
    )
    const b = new Blob(['\uFEFF'+[h,...lines].join('\n')], {type:'text/csv;charset=utf-8;'})
    const a = document.createElement('a'); a.href=URL.createObjectURL(b)
    a.download=`給与_${year}-${month}.csv`; a.click()
  }

  const totalBase = records.reduce((s,r)=>s+r.base_salary_thb,0)
  const totalNet  = records.reduce((s,r)=>s+r.net_salary_thb,0)
  const totalSS   = records.reduce((s,r)=>s+r.social_security_thb,0)
  const totalWT   = records.reduce((s,r)=>s+r.withholding_tax_thb,0)

  return (
    <div className="p-6 space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold text-slate-900">給与管理</h1>
          <p className="text-sm text-slate-500 mt-0.5">{year}年{month}月</p></div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={!records.length}><Download size={13} className="mr-1"/>CSV</Button>
          <Button size="sm" onClick={()=>setShowNew(v=>!v)}><Plus size={13} className="mr-1"/>{showNew?'閉じる':'給与を追加'}</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          {label:'基本給合計', value:fmt(totalBase)},
          {label:'社会保険合計', value:fmt(totalSS)},
          {label:'源泉徴収合計', value:fmt(totalWT)},
          {label:'手取り合計', value:fmt(totalNet)},
        ].map(c=>(
          <Card key={c.label}><CardContent className="pt-4 pb-3">
            <p className="text-xs text-slate-500 mb-1">{c.label}</p>
            <p className="text-sm font-bold text-slate-900">{c.value}</p>
          </CardContent></Card>
        ))}
      </div>

      <div className="flex gap-2">
        <Select value={String(year)} onValueChange={v=>setYear(Number(v))}>
          <SelectTrigger className="w-24 h-8 text-sm"><SelectValue/></SelectTrigger>
          <SelectContent>{[now.getFullYear()-1,now.getFullYear()].map(y=><SelectItem key={y} value={String(y)}>{y}年</SelectItem>)}</SelectContent>
        </Select>
        <Select value={String(month)} onValueChange={v=>setMonth(Number(v))}>
          <SelectTrigger className="w-20 h-8 text-sm"><SelectValue/></SelectTrigger>
          <SelectContent>{Array.from({length:12},(_,i)=>i+1).map(m=><SelectItem key={m} value={String(m)}>{m}月</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {showNew && (
        <Card className="border-blue-200 bg-blue-50/30"><CardContent className="pt-4 space-y-3">
          <p className="text-sm font-semibold">給与入力</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label className="text-xs text-slate-500">氏名</Label>
              <Input value={form.employee_name} onChange={e=>setForm(f=>({...f,employee_name:e.target.value}))} className="h-8 text-sm" placeholder="山田太郎"/></div>
            <div className="space-y-1"><Label className="text-xs text-slate-500">支払日</Label>
              <Input type="date" value={form.paid_at} onChange={e=>setForm(f=>({...f,paid_at:e.target.value}))} className="h-8 text-sm"/></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1"><Label className="text-xs text-slate-500">基本給（THB）</Label>
              <Input type="number" value={form.base_salary_thb} onChange={e=>setForm(f=>({...f,base_salary_thb:e.target.value}))} className="h-8 text-sm" placeholder="0"/></div>
            <div className="space-y-1"><Label className="text-xs text-slate-500">社会保険（THB）</Label>
              <Input type="number" value={form.social_security_thb} onChange={e=>setForm(f=>({...f,social_security_thb:e.target.value}))} className="h-8 text-sm"/></div>
            <div className="space-y-1"><Label className="text-xs text-slate-500">源泉徴収（THB）</Label>
              <Input type="number" value={form.withholding_tax_thb} onChange={e=>setForm(f=>({...f,withholding_tax_thb:e.target.value}))} className="h-8 text-sm"/></div>
          </div>
          {form.base_salary_thb && (
            <div className="bg-white rounded-lg p-3 border border-blue-100">
              <p className="text-xs text-slate-500 mb-1">手取り（計算結果）</p>
              <p className="text-lg font-bold text-blue-700">{fmt(netSalary)}</p>
            </div>
          )}
          <Input placeholder="備考（任意）" value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} className="h-8 text-sm"/>
          <Button size="sm" onClick={save} disabled={saving||!form.employee_name||!form.base_salary_thb} className="w-full">
            {saving?'保存中...':'給与を保存'}
          </Button>
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
              <td className="py-3 px-3 text-right"><div className="font-medium">฿{r.base_salary_thb.toLocaleString()}</div><div className="text-xs text-slate-400">¥{Math.round(r.base_salary_thb*RATE).toLocaleString()}</div></td>
              <td className="py-3 px-3 text-right text-slate-500">฿{r.social_security_thb.toLocaleString()}</td>
              <td className="py-3 px-3 text-right text-slate-500">฿{r.withholding_tax_thb.toLocaleString()}</td>
              <td className="py-3 px-3 text-right"><div className="font-bold text-blue-700">฿{r.net_salary_thb.toLocaleString()}</div><div className="text-xs text-slate-400">¥{Math.round(r.net_salary_thb*RATE).toLocaleString()}</div></td>
              <td className="py-3 px-3 text-slate-500 text-xs">{r.paid_at??'未払い'}</td>
            </tr>
          ))}</tbody>
          <tfoot><tr className="border-t-2 bg-slate-50">
            <td className="py-2.5 px-4 font-bold text-sm">合計</td>
            <td className="py-2.5 px-3 text-right"><div className="font-bold">฿{Math.round(totalBase).toLocaleString()}</div><div className="text-xs text-slate-400">¥{Math.round(totalBase*RATE).toLocaleString()}</div></td>
            <td className="py-2.5 px-3 text-right text-slate-500">฿{Math.round(totalSS).toLocaleString()}</td>
            <td className="py-2.5 px-3 text-right text-slate-500">฿{Math.round(totalWT).toLocaleString()}</td>
            <td className="py-2.5 px-3 text-right"><div className="font-bold text-blue-700">฿{Math.round(totalNet).toLocaleString()}</div><div className="text-xs text-slate-400">¥{Math.round(totalNet*RATE).toLocaleString()}</div></td>
            <td/>
          </tr></tfoot>
        </table></div>}
      </CardContent></Card>
    </div>
  )
}
export const dynamic = 'force-dynamic'
