'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createBrowserClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Upload, Plus, Check, AlertTriangle, X } from 'lucide-react'
import { type CostItem, fetchCostItems, groupByCategory, monthRange, BUDGET_MONTHS } from '@/lib/costItems'
import type { BudgetImportResult } from '@/lib/excel/importBudget'
import { useI18n, budgetTypeLabel } from '@/lib/i18n'

type Tab = 'actual' | 'input' | 'master'
const fmt = (n: number) => Math.round(n).toLocaleString()
const monthLabel = (m: string) => `${m.slice(0, 4)}/${+m.slice(5, 7)}`
const sel = 'h-8 rounded-md border border-input bg-white px-2 text-sm'

function defaultMonth(): string {
  const d = new Date(); const cur = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
  return BUDGET_MONTHS.includes(cur) ? cur : cur < BUDGET_MONTHS[0] ? BUDGET_MONTHS[0] : BUDGET_MONTHS[BUDGET_MONTHS.length - 1]
}

export function BudgetPage() {
  const supabase = useMemo(() => createBrowserClient(), [])
  const { t, lang, itemName, catName } = useI18n()
  const tx = (s: string) => {
    let m: RegExpMatchArray | null
    if ((m = s.match(/^Excelファイルを読み取れません: (.*)$/))) return t('Excelファイルを読み取れません: {msg}', { msg: t(m[1]) })
    if ((m = s.match(/^数式の計算結果が保存されていないセルが(\d+)個あります。/))) return t('数式の計算結果が保存されていないセルが{n}個あります。Excelでこのファイルを開き、上書き保存してから取り込んでください。', { n: m[1] })
    if ((m = s.match(/^費目マスタに無いコード（取り込み対象外）: (.*)$/))) return t('費目マスタに無いコード（取り込み対象外）: {codes}', { codes: m[1] })
    return t(s)
  }
  const [tab, setTab] = useState<Tab>('actual')
  const [items, setItems] = useState<CostItem[]>([])
  const [budget, setBudget] = useState<Map<string, number>>(new Map())   // `${code}|${month}` → THB
  const [month, setMonth] = useState(defaultMonth())
  const [actual, setActual] = useState<Map<string, number>>(new Map())
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const flash = (kind: 'ok' | 'err', text: string) => { setNotice({ kind, text }); if (kind === 'ok') setTimeout(() => setNotice(n => (n && n.text === text ? null : n)), 5000) }

  const loadMaster = useCallback(async () => {
    try { setItems(await fetchCostItems(supabase)) } catch (e) { flash('err', t('費目マスタを読み込めません: {msg}', { msg: (e as Error).message })) }
  }, [supabase])
  const loadBudget = useCallback(async () => {
    const { data, error } = await supabase.from('budget_amounts').select('item_code,month,amount_thb').limit(5000)
    if (error) { flash('err', t('予算を読み込めません: {msg}', { msg: error.message })); return }
    setBudget(new Map((data ?? []).map(r => [`${r.item_code}|${r.month}`, Number(r.amount_thb)])))
  }, [supabase])
  const loadActual = useCallback(async () => {
    const { start, end } = monthRange(month.slice(0, 7))
    const { data, error } = await supabase.from('expenses').select('item_code,amount_thb').gte('expense_date', start).lt('expense_date', end).limit(10000)
    if (error) { flash('err', t('実績を読み込めません: {msg}', { msg: error.message })); return }
    const m = new Map<string, number>()
    for (const r of data ?? []) { const k = r.item_code ?? '(不明)'; m.set(k, (m.get(k) ?? 0) + Number(r.amount_thb)) }
    setActual(m)
  }, [supabase, month])
  useEffect(() => { (async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) { const { data: p } = await supabase.from('users').select('role').eq('id', user.id).single(); setIsAdmin(p?.role === 'admin') }
    await Promise.all([loadMaster(), loadBudget()]); setLoading(false)
  })() }, [supabase, loadMaster, loadBudget])
  useEffect(() => { loadActual() }, [loadActual])

  const groups = useMemo(() => groupByCategory(items, false), [items])
  const itemMap = useMemo(() => new Map(items.map(i => [i.code, i])), [items])

  // ───────────── 予実（当月） ─────────────
  const rows = useMemo(() => groups.map(g => {
    const its = g.items.filter(i => i.is_active || actual.has(i.code) || budget.has(`${i.code}|${month}`)).map(i => {
      const b = budget.get(`${i.code}|${month}`)
      const a = actual.get(i.code) ?? 0
      return { item: i, b, a }
    })
    return { g, its }
  }).filter(x => x.its.length), [groups, actual, budget, month])
  const totals = useMemo(() => {
    let opB = 0, opA = 0, otB = 0, otA = 0, unset = 0
    for (const { its } of rows) for (const { item, b, a } of its) {
      if (item.budget_type === '運営費') { opB += b ?? 0; opA += a } else { otB += b ?? 0; otA += a }
      if (b == null && a > 0) unset++
    }
    const unknown = actual.get('(不明)') ?? 0
    return { opB, opA, otB, otA, unset, unknown }
  }, [rows, actual])

  function status(b: number | undefined, a: number): { text: string; cls: string } {
    if (b == null) return a > 0 ? { text: t('予算未設定・実績あり'), cls: 'text-amber-700 bg-amber-50' } : { text: t('未設定'), cls: 'text-slate-400' }
    if (a > b) return { text: t('超過'), cls: 'text-red-700 bg-red-50 font-semibold' }
    if (b > 0 && a >= b * 0.9) return { text: t('注意(90%超)'), cls: 'text-amber-700 bg-amber-50' }
    return { text: t('正常'), cls: 'text-green-700' }
  }

  // ───────────── 予算入力（費目×月） ─────────────
  const [cellErr, setCellErr] = useState<string | null>(null)
  async function saveCell(code: string, m: string, raw: string) {
    const key = `${code}|${m}`
    const cur = budget.get(key)
    const tv = raw.trim().replace(/,/g, '')
    if (tv === '') {
      if (cur == null) return
      const { error } = await supabase.from('budget_amounts').delete().eq('item_code', code).eq('month', m)
      if (error) { setCellErr(`${code} ${monthLabel(m)}: ${error.message}`); return }
      setBudget(p => { const n = new Map(p); n.delete(key); return n }); setCellErr(null); return
    }
    const v = Number(tv)
    if (!isFinite(v) || v < 0) { setCellErr(`${code} ${monthLabel(m)}: ${t('0以上の数値を入力してください')}`); return }
    if (cur === v) return
    const { error } = await supabase.from('budget_amounts').upsert({ item_code: code, month: m, amount_thb: v, updated_at: new Date().toISOString() })
    if (error) { setCellErr(`${code} ${monthLabel(m)}: ${error.message}`); return }
    setBudget(p => new Map(p).set(key, v)); setCellErr(null)
  }

  // ───────────── Excel取り込み ─────────────
  const fileRef = useRef<HTMLInputElement>(null)
  const [imp, setImp] = useState<BudgetImportResult | null>(null)
  const [impBusy, setImpBusy] = useState(false)
  async function onPickExcel(f: File | null) {
    if (!f) return
    setImpBusy(true)
    try {
      const { parseBudgetWorkbook } = await import('@/lib/excel/importBudget')
      setImp(await parseBudgetWorkbook(await f.arrayBuffer(), new Set(items.map(i => i.code))))
    } catch (e) { flash('err', t('Excelを読み込めません: {msg}', { msg: t((e as Error).message) })) } finally { setImpBusy(false) }
  }
  async function applyImport() {
    if (!imp || imp.errors.length) return
    setImpBusy(true)
    try {
      for (let i = 0; i < imp.rows.length; i += 400) {
        const chunk = imp.rows.slice(i, i + 400).map(r => ({ ...r, updated_at: new Date().toISOString() }))
        const { error } = await supabase.from('budget_amounts').upsert(chunk)
        if (error) throw new Error(error.message)
      }
      await loadBudget(); setImp(null); flash('ok', t('予算 {n}件（{c}費目）を取り込みました', { n: imp.rows.length, c: imp.codes }))
    } catch (e) { flash('err', t('取り込みに失敗しました: {msg}', { msg: (e as Error).message })) } finally { setImpBusy(false) }
  }
  const impTotals = useMemo(() => {
    if (!imp) return null
    const by = new Map<string, number>()
    for (const r of imp.rows) { const it = itemMap.get(r.item_code); if (it?.budget_type === '運営費') by.set(r.month, (by.get(r.month) ?? 0) + r.amount_thb) }
    return by
  }, [imp, itemMap])

  // ───────────── 費目マスタ ─────────────
  const [newItem, setNewItem] = useState({ cat: 'A', name: '', cost_type: '不定期', budget_type: '運営費' })
  async function addItem() {
    const name = newItem.name.trim()
    if (!name) { flash('err', t('費目名を入力してください')); return }
    const catItems = items.filter(i => i.category_code === newItem.cat)
    if (!catItems.length) { flash('err', t('大分類が不正です')); return }
    const nums = catItems.map(i => +i.code.slice(2)).filter(n => n < 90)
    const next = (nums.length ? Math.max(...nums) : 0) + 1
    if (next >= 90) { flash('err', t('この大分類の標準コード枠（01〜89）が満杯です')); return }
    const code = `${newItem.cat}-${String(next).padStart(2, '0')}`
    const { error } = await supabase.from('cost_items').insert({
      code, category_code: newItem.cat, category_name: catItems[0].category_name, name, cost_type: newItem.cost_type,
      budget_type: newItem.cat === 'J' ? (newItem.budget_type === '運営費' ? '資産' : newItem.budget_type) : '運営費', init_status: 'new', sort_order: Math.max(...items.map(i => i.sort_order)) + 1,
    })
    if (error) { flash('err', error.message.includes('duplicate') ? t('同じ名前の費目が既にあります') : error.message); return }
    setNewItem(s => ({ ...s, name: '' })); await loadMaster(); flash('ok', t('費目 {code} {name} を追加しました（Excelの費目マスタにも同じ行を追加してください）', { code, name }))
  }
  async function toggleActive(it: CostItem) {
    const { error } = await supabase.from('cost_items').update({ is_active: !it.is_active }).eq('code', it.code)
    if (error) flash('err', error.message); else loadMaster()
  }
  async function renameItem(it: CostItem, name: string) {
    const n = name.trim()
    if (!n || n === it.name) return
    const { error } = await supabase.from('cost_items').update({ name: n }).eq('code', it.code)
    if (error) flash('err', error.message.includes('duplicate') ? t('同じ名前の費目が既にあります') : error.message); else loadMaster()
  }

  if (loading) return <div className="p-6 text-sm text-slate-400">{t('読み込み中...')}</div>
  const tabBtn = (id: Tab, label: string) => (
    <button key={id} onClick={() => setTab(id)} className={`px-4 py-2 text-sm border-b-2 -mb-px ${tab === id ? 'border-blue-600 text-blue-700 font-semibold' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{label}</button>)

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h1 className="text-xl font-bold text-slate-900">{t('予算管理')}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{t('費目コード（A〜J）別の月次予算。管理表（Excel）から取り込めます。累計・着地見込はExcel管理表の「月次予実管理」で確認します。')}</p></div>
        {isAdmin && <div className="flex gap-2">
          <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={e => { onPickExcel(e.target.files?.[0] ?? null); e.target.value = '' }} />
          <Button size="sm" variant="outline" disabled={impBusy} onClick={() => fileRef.current?.click()}><Upload size={14} className="mr-1" />{t('管理表Excelから予算を取り込む')}</Button>
        </div>}
      </div>
      {notice && (
        <div className={`rounded-md px-3 py-2 text-sm flex items-start gap-2 ${notice.kind === 'ok' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
          {notice.kind === 'ok' ? <Check size={15} className="mt-0.5 shrink-0" /> : <AlertTriangle size={15} className="mt-0.5 shrink-0" />}
          <span className="flex-1">{notice.text}</span><button onClick={() => setNotice(null)} aria-label={t('閉じる')}><X size={14} /></button>
        </div>)}
      <div className="flex border-b">{tabBtn('actual', t('当月の予実'))}{isAdmin && tabBtn('input', t('予算入力'))}{isAdmin && tabBtn('master', t('費目マスタ'))}</div>

      {tab === 'actual' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <select value={month} onChange={e => setMonth(e.target.value)} className={sel} aria-label={t('対象月')}>
              {BUDGET_MONTHS.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}</select>
            <p className="text-xs text-slate-400">{t('予算＝取り込み・入力済みの値／実績＝アプリ内の経費（Excel出力後に削除した月は0になります）')}</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card><CardContent className="pt-4 pb-3"><p className="text-xs text-slate-500">{t('運営費 予算')}</p><p className="text-lg font-bold tabular-nums">฿{fmt(totals.opB)}</p></CardContent></Card>
            <Card><CardContent className="pt-4 pb-3"><p className="text-xs text-slate-500">{t('運営費 実績')}</p><p className="text-lg font-bold tabular-nums">฿{fmt(totals.opA)}</p></CardContent></Card>
            <Card><CardContent className="pt-4 pb-3"><p className="text-xs text-slate-500">{t('差異（予算−実績）')}</p><p className={`text-lg font-bold tabular-nums ${totals.opB - totals.opA < 0 ? 'text-red-600' : ''}`}>฿{fmt(totals.opB - totals.opA)}</p></CardContent></Card>
            <Card><CardContent className="pt-4 pb-3"><p className="text-xs text-slate-500">{t('執行率')}</p><p className="text-lg font-bold tabular-nums">{totals.opB > 0 ? `${(totals.opA / totals.opB * 100).toFixed(1)}%` : '—'}</p></CardContent></Card>
          </div>
          {(totals.unset > 0 || totals.unknown > 0) && <p className="text-xs text-amber-700">⚠ {t('予算未設定で実績がある費目が{n}件あります。', { n: totals.unset })}{totals.unknown > 0 && ` ${t('費目不明の実績が฿{amt}あります。', { amt: fmt(totals.unknown) })}`}</p>}
          <Card><CardContent className="p-0 overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="border-b bg-slate-50 text-xs font-medium text-slate-500">
              <th className="text-left py-2 px-3">{t('費目')}</th><th className="text-right py-2 px-3">{t('予算')}</th><th className="text-right py-2 px-3">{t('実績')}</th>
              <th className="text-right py-2 px-3">{t('差異')}</th><th className="text-right py-2 px-3">{t('執行率')}</th><th className="text-left py-2 px-3">{t('状態')}</th></tr></thead>
            <tbody>{rows.map(({ g, its }) => {
              const sb = its.reduce((s, x) => s + (x.b ?? 0), 0), sa = its.reduce((s, x) => s + x.a, 0), anyB = its.some(x => x.b != null)
              return [
                <tr key={g.code} className="bg-blue-50/60 border-b text-xs font-semibold text-slate-700">
                  <td className="py-1.5 px-3">{g.code}. {catName(g.code, g.name)}</td><td className="text-right px-3 tabular-nums">{anyB ? fmt(sb) : '—'}</td>
                  <td className="text-right px-3 tabular-nums">{fmt(sa)}</td><td className={`text-right px-3 tabular-nums ${anyB && sb - sa < 0 ? 'text-red-600' : ''}`}>{anyB ? fmt(sb - sa) : '—'}</td><td colSpan={2} /></tr>,
                ...its.map(({ item, b, a }) => { const st = status(b, a); return (
                  <tr key={item.code} className="border-b hover:bg-slate-50">
                    <td className="py-1.5 px-3 pl-6"><span className="font-mono text-xs text-slate-400">{item.code}</span> {itemName(item.code, item.name)}{!item.is_active && <span className="text-[10px] text-slate-400"> ({t('無効')})</span>}</td>
                    <td className="text-right px-3 tabular-nums">{b != null ? fmt(b) : <span className="text-slate-300">{t('未設定')}</span>}</td>
                    <td className="text-right px-3 tabular-nums">{a ? fmt(a) : <span className="text-slate-300">0</span>}</td>
                    <td className={`text-right px-3 tabular-nums ${b != null && b - a < 0 ? 'text-red-600' : ''}`}>{b != null ? fmt(b - a) : '—'}</td>
                    <td className="text-right px-3 tabular-nums">{b ? `${(a / b * 100).toFixed(0)}%` : '—'}</td>
                    <td className="px-3"><span className={`text-[11px] px-1.5 py-0.5 rounded ${st.cls}`}>{st.text}</span></td></tr>) }),
              ]
            })}</tbody>
          </table></CardContent></Card>
          <p className="text-xs text-slate-400">{t('運営費合計は区分が「運営費」の費目のみ。資産・敷金・資金移動（J）は別管理のため合計に含めません（運営費外 実績 ฿{amt}）。', { amt: fmt(totals.otA) })}</p>
        </div>
      )}

      {isAdmin && tab === 'input' && (
        <div className="space-y-2">
          <p className="text-xs text-slate-500">{t('セルを入力して枠外をクリックすると自動保存されます。空欄＝予算未設定、0＝0円で設定。金額は根拠に基づいて入力してください。')}</p>
          {cellErr && <p className="text-xs text-red-600">{cellErr}</p>}
          <Card><CardContent className="p-0 overflow-auto max-h-[70vh]"><table className="text-xs border-collapse">
            <thead className="sticky top-0 z-10"><tr className="bg-slate-100 text-slate-600">
              <th className="sticky left-0 bg-slate-100 text-left py-2 px-2 min-w-[220px]">{t('費目')}</th>
              {BUDGET_MONTHS.map(m => <th key={m} className="py-2 px-1 min-w-[72px]">{monthLabel(m)}</th>)}<th className="py-2 px-2 min-w-[84px]">{t('合計')}</th></tr></thead>
            <tbody>{groups.map(g => [
              <tr key={g.code} className="bg-blue-50"><td colSpan={20} className="sticky left-0 py-1 px-2 font-semibold text-slate-700">{g.code}. {catName(g.code, g.name)}</td></tr>,
              ...g.items.filter(i => i.is_active || BUDGET_MONTHS.some(m => budget.has(`${i.code}|${m}`))).map(i => {
                const tot = BUDGET_MONTHS.reduce((s, m) => s + (budget.get(`${i.code}|${m}`) ?? 0), 0)
                return (<tr key={i.code} className="border-b">
                  <td className="sticky left-0 bg-white py-0.5 px-2"><span className="font-mono text-slate-400">{i.code}</span> {itemName(i.code, i.name)}</td>
                  {BUDGET_MONTHS.map(m => { const v = budget.get(`${i.code}|${m}`); return (
                    <td key={m} className="p-0"><input type="text" inputMode="decimal" defaultValue={v != null ? String(v) : ''} key={`${i.code}${m}${v ?? ''}`}
                      onBlur={e => saveCell(i.code, m, e.target.value)} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                      className={`w-full h-7 px-1 text-right tabular-nums border-0 outline-none focus:bg-yellow-50 focus:ring-1 focus:ring-blue-400 ${v == null ? 'bg-white' : 'bg-white font-medium'}`} aria-label={`${itemName(i.code, i.name)} ${monthLabel(m)}`} /></td>) })}
                  <td className="px-2 text-right tabular-nums font-semibold">{fmt(tot)}</td></tr>)
              })])}</tbody>
          </table></CardContent></Card>
        </div>
      )}

      {isAdmin && tab === 'master' && (
        <div className="space-y-3">
          <Card><CardContent className="pt-4 pb-3 flex flex-wrap items-end gap-2">
            <div><p className="text-[11px] text-slate-500 mb-1">{t('大分類')}</p>
              <select value={newItem.cat} onChange={e => setNewItem(s => ({ ...s, cat: e.target.value }))} className={sel} aria-label={t('大分類')}>
                {groups.map(g => <option key={g.code} value={g.code}>{g.code}. {g.name.slice(0, 12)}</option>)}</select></div>
            <div className="flex-1 min-w-[180px]"><p className="text-[11px] text-slate-500 mb-1">{t('新しい費目名')}</p>
              <Input value={newItem.name} onChange={e => setNewItem(s => ({ ...s, name: e.target.value }))} className="h-8 text-sm" placeholder={t('例: 駐車場代')} /></div>
            <div><p className="text-[11px] text-slate-500 mb-1">{t('費用区分')}</p>
              <select value={newItem.cost_type} onChange={e => setNewItem(s => ({ ...s, cost_type: e.target.value }))} className={sel} aria-label={t('費用区分')}>
                {['継続', '一時', '年次', '不定期'].map(c => <option key={c} value={c}>{t(c)}</option>)}</select></div>
            {newItem.cat === 'J' && <div><p className="text-[11px] text-slate-500 mb-1">{t('区分')}</p>
              <select value={newItem.budget_type} onChange={e => setNewItem(s => ({ ...s, budget_type: e.target.value }))} className={sel} aria-label={t('予算対象区分')}>
                {['資産', '預託金', '資金移動'].map(c => <option key={c} value={c}>{budgetTypeLabel(lang, c)}</option>)}</select></div>}
            <Button size="sm" onClick={addItem}><Plus size={14} className="mr-1" />{t('追加')}</Button>
          </CardContent></Card>
          <Card><CardContent className="p-0 overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="border-b bg-slate-50 text-xs font-medium text-slate-500"><th className="text-left py-2 px-3">{t('コード')}</th><th className="text-left py-2 px-3">{t('費目名')}</th>
              <th className="text-left py-2 px-3">{t('費用区分')}</th><th className="text-left py-2 px-3">{t('区分')}</th><th className="text-left py-2 px-3">{t('備考')}</th><th className="py-2 px-3">{t('有効')}</th></tr></thead>
            <tbody>{groups.map(g => [
              <tr key={g.code} className="bg-blue-50/60 border-b"><td colSpan={6} className="py-1.5 px-3 text-xs font-semibold text-slate-700">{g.code}. {catName(g.code, g.name)}</td></tr>,
              ...g.items.map(i => (
                <tr key={i.code} className={`border-b ${i.is_active ? '' : 'opacity-50'}`}>
                  <td className="py-1.5 px-3 font-mono text-xs">{i.code}</td>
                  <td className="px-3"><input defaultValue={i.name} key={i.name} onBlur={e => renameItem(i, e.target.value)} className="w-full bg-transparent border-0 border-b border-transparent hover:border-slate-300 focus:border-blue-500 outline-none py-0.5" aria-label={`${i.code} ${t('費目名')}`} /></td>
                  <td className="px-3 text-xs">{t(i.cost_type)}</td><td className="px-3 text-xs">{budgetTypeLabel(lang, i.budget_type)}</td>
                  <td className="px-3 text-[11px] text-slate-500 max-w-[320px]">{i.note ? (/要確認|漏れ/.test(i.note) ? <span className="text-amber-700">{i.note.slice(0, 60)}{i.note.length > 60 ? '…' : ''}</span> : i.note.slice(0, 60)) : ''}</td>
                  <td className="px-3 text-center"><input type="checkbox" checked={i.is_active} onChange={() => toggleActive(i)} aria-label={`${i.code} ${t('有効')}`} /></td></tr>))])}</tbody>
          </table></CardContent></Card>
          <p className="text-xs text-slate-400">{t('費目の追加・名称変更を行った場合は、Excel管理表の「費目マスタ」にも同じ内容を反映してください（費目コード・費目名で突き合わせます）。')}</p>
        </div>
      )}

      {imp && (
        <Dialog open onOpenChange={v => { if (!v && !impBusy) setImp(null) }}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle className="text-base">{t('予算の取り込み確認')}</DialogTitle></DialogHeader>
            <div className="space-y-2 text-sm">
              {imp.errors.map((e, i) => <p key={i} className="text-red-700 bg-red-50 rounded px-2 py-1">{tx(e)}</p>)}
              {imp.warnings.map((w, i) => <p key={i} className="text-amber-700 text-xs">⚠ {tx(w)}</p>)}
              {!imp.errors.length && impTotals && <>
                <p>{t('{c}費目・{n}件の月別予算を取り込みます。同じ費目・月の既存予算は上書きされ、Excelに無い既存の予算は残ります。', { c: imp.codes, n: imp.rows.length })}</p>
                <p className="text-xs text-slate-500">{t('運営費の月別合計（Excelの総合計と一致するか確認してください）:')}</p>
                <div className="grid grid-cols-3 gap-x-3 gap-y-0.5 text-xs tabular-nums">{BUDGET_MONTHS.map(m => <div key={m} className="flex justify-between"><span className="text-slate-500">{monthLabel(m)}</span><span>{fmt(impTotals.get(m) ?? 0)}</span></div>)}</div></>}
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" size="sm" onClick={() => setImp(null)} disabled={impBusy}>{t('キャンセル')}</Button>
              <Button size="sm" onClick={applyImport} disabled={impBusy || imp.errors.length > 0 || !imp.rows.length}>{impBusy ? t('取り込み中…') : t('取り込む')}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>)}
    </div>
  )
}
export default BudgetPage
