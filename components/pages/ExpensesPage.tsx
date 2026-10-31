'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createBrowserClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Camera, FileUp, Plus, Download, Archive, Trash2, Paperclip, X, Check, AlertTriangle } from 'lucide-react'
import ExpenseForm, { type FormState, emptyForm, formThb, validateForm } from '@/components/expenses/ExpenseForm'
import { type CostItem, fetchCostItems, monthRange, groupByCategory } from '@/lib/costItems'
import { type ExpenseRecord, duplicateKey, receiptFileName, rowsChecksum } from '@/lib/expenses'
import { parseReceiptText, vendorKey } from '@/lib/receipt/parse'
import { extractReceipt, compressForUpload, isPdf } from '@/lib/receipt/extract'
import { useI18n, budgetTypeLabel } from '@/lib/i18n'

const DEFAULT_JPY_RATE = 4.8
const VENDOR_MAP_KEY = 'vendor_item_map_v1'

function today(): string { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
function loadVendorMap(): Record<string, string> { try { return JSON.parse(localStorage.getItem(VENDOR_MAP_KEY) || '{}') } catch { return {} } }
function rememberVendor(vendor: string, code: string) {
  const k = vendorKey(vendor); if (!k || !code) return
  try { const m = loadVendorMap(); m[k] = code; localStorage.setItem(VENDOR_MAP_KEY, JSON.stringify(m)) } catch { /* 学習は任意機能 */ }
}
function downloadBlob(blob: Blob, name: string) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000)
}
const fmt = (n: number) => Math.round(n).toLocaleString()

interface Draft {
  id: string
  file: File | null
  preview: string | null
  status: 'reading' | 'ready' | 'saving' | 'error'
  message: string
  form: FormState
  suggestions: string[]
  warnings: string[]
  rawText: string
  confidence: number | null
  error: string | null
  allowNoFile: boolean
}

type Props = Record<string, never>

export function ExpensesPage(_props: Props = {}) {
  void _props
  const supabase = useMemo(() => createBrowserClient(), [])
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const ym = `${year}-${String(month).padStart(2, '0')}`
  const { t, lang, itemName, catName, locale } = useI18n()
  const ymLabel = t('{y}年{m}月', { y: year, m: month })
  const progressText = (m: string) => { const mm = m.match(/^PDFを画像化して解析中 (\(.*\))$/); return mm ? `${t('PDFを画像化して解析中')} ${mm[1]}` : t(m) }
  const monthName = (m: number) => lang === 'ja' ? `${m}月` : new Date(2000, m - 1, 1).toLocaleString(locale, { month: 'long' })
  const [items, setItems] = useState<CostItem[]>([])
  const [jpyRate, setJpyRate] = useState(DEFAULT_JPY_RATE)
  const [userId, setUserId] = useState<string | null>(null)
  const [userName, setUserName] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [members, setMembers] = useState<{ id: string; name: string }[]>([])
  const [applicantId, setApplicantId] = useState<string>('')
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [exportInfo, setExportInfo] = useState<{ exported_at: string; row_count: number; total_thb: number; checksum: string | null; data_deleted_at: string | null } | null>(null)
  const [catFilter, setCatFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [edit, setEdit] = useState<ExpenseRecord | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [delOpen, setDelOpen] = useState(false)
  const queue = useRef<string[]>([])
  const running = useRef(false)
  const draftsRef = useRef<Draft[]>([])
  useEffect(() => { draftsRef.current = drafts }, [drafts])

  const itemMap = useMemo(() => new Map(items.map(i => [i.code, i])), [items])

  // ─── 初期データ ───
  useEffect(() => {
    (async () => {
      try { setItems(await fetchCostItems(supabase)) } catch (e) { setLoadError(t('費目マスタを読み込めません: {msg}', { msg: (e as Error).message })) }
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUserId(user.id)
        const { data: p } = await supabase.from('users').select('name,role').eq('id', user.id).single()
        setUserName(p?.name ?? ''); setIsAdmin(p?.role === 'admin')
        setApplicantId(user.id)
      }
      const { data: us } = await supabase.from('users').select('id,name').order('name')
      setMembers(us ?? [])
      const { data: s } = await supabase.from('settings').select('value').eq('key', 'exchange_rate').maybeSingle()
      const r = s ? parseFloat(s.value) : NaN
      if (isFinite(r) && r > 0) setJpyRate(r)
    })()
  }, [supabase])

  const load = useCallback(async () => {
    setLoading(true); setLoadError(null)
    const { start, end } = monthRange(ym)
    const [e, x] = await Promise.all([
      supabase.from('expenses').select('*').gte('expense_date', start).lt('expense_date', end).order('expense_date', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('month_exports').select('*').eq('ym', ym).maybeSingle(),
    ])
    if (e.error) setLoadError(t('経費を読み込めません: {msg}', { msg: e.error.message }))
    setExpenses((e.data ?? []) as ExpenseRecord[])
    setExportInfo(x.data ?? null)
    setLoading(false)
  }, [supabase, ym])
  useEffect(() => { load() }, [load])

  // ─── 集計 ───
  const visible = useMemo(() => expenses.filter(e => {
    if (catFilter !== 'all' && itemMap.get(e.item_code ?? '')?.category_code !== catFilter) return false
    if (search) {
      const s = search.toLowerCase()
      const hay = `${e.vendor ?? ''} ${e.description ?? ''} ${e.memo ?? ''} ${e.item_code ?? ''} ${itemMap.get(e.item_code ?? '')?.name ?? ''}`.toLowerCase()
      if (!hay.includes(s)) return false
    }
    return true
  }), [expenses, catFilter, search, itemMap])
  const sums = useMemo(() => {
    let op = 0, other = 0
    for (const e of expenses) { if (itemMap.get(e.item_code ?? '')?.budget_type === '運営費') op += Number(e.amount_thb); else other += Number(e.amount_thb) }
    return { op, other, all: op + other }
  }, [expenses, itemMap])
  const dupSet = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of expenses) { const k = duplicateKey(e.expense_date, Number(e.amount_thb), e.vendor); m.set(k, (m.get(k) ?? 0) + 1) }
    return new Set([...m.entries()].filter(([, c]) => c > 1).map(([k]) => k))
  }, [expenses])
  const changedAfterExport = !!exportInfo && (
    exportInfo.checksum
      ? rowsChecksum(expenses) !== exportInfo.checksum
      : expenses.length !== exportInfo.row_count || Math.abs(sums.all - Number(exportInfo.total_thb)) > 0.005)

  const flash = (kind: 'ok' | 'err', text: string) => { setNotice({ kind, text }); if (kind === 'ok') setTimeout(() => setNotice(n => (n && n.text === text ? null : n)), 6000) }

  // ─── 領収書取り込み（OCR/PDF） ───
  const patchDraft = (id: string, patch: Partial<Draft>) => setDrafts(ds => ds.map(d => (d.id === id ? { ...d, ...patch } : d)))
  const patchForm = (id: string, p: Partial<FormState>) => setDrafts(ds => ds.map(d => (d.id === id ? { ...d, form: { ...d.form, ...p } } : d)))

  async function runQueue() {
    if (running.current) return
    running.current = true
    try {
      while (queue.current.length) {
        const id = queue.current.shift()!
        const d = draftsRef.current.find(x => x.id === id)
        if (!d || !d.file) continue
        try {
          const r = await extractReceipt(d.file, m => patchDraft(id, { message: m }))
          const p = parseReceiptText(r.text, r.confidence)
          const vmap = loadVendorMap()
          const learned = p.vendor ? vmap[vendorKey(p.vendor)] : undefined
          const codes = [...(learned ? [learned] : []), ...p.itemCodes.filter(c => c !== learned)]
          setDrafts(ds => ds.map(x => x.id !== id ? x : {
            ...x, status: 'ready', message: '', suggestions: codes, warnings: p.currency && p.currency !== 'THB' ? [...p.warnings.map(w => t(w)), t('THB以外の通貨（{cur}）の表記があります。タイバーツ建ての領収書か確認してください。', { cur: p.currency })] : p.warnings.map(w => t(w)), rawText: p.rawText, confidence: r.confidence,
            form: {
              ...x.form,
              date: p.date ?? x.form.date,
              vendor: p.vendor ?? x.form.vendor,
              amount: p.amount != null ? String(p.amount) : x.form.amount,
              receiptNo: p.receiptNo ?? x.form.receiptNo,
              itemCode: learned && itemMap.get(learned)?.is_active ? learned : x.form.itemCode,
            },
          }))
        } catch (e) {
          patchDraft(id, { status: 'ready', message: '', warnings: [t('読み取りに失敗しました（{msg}）。手入力してください。', { msg: t((e as Error).message) })] })
        }
      }
    } finally { running.current = false }
  }

  function addFiles(files: FileList | File[] | null) {
    if (!files) return
    const list = [...files]
    const accepted: File[] = []
    for (const f of list) {
      if (!(f.type.startsWith('image/') || isPdf(f))) { flash('err', t('{name}: 画像またはPDFのみ取り込めます', { name: f.name })); continue }
      if (f.size > 25 * 1024 * 1024) { flash('err', t('{name}: 25MBを超えるため取り込めません', { name: f.name })); continue }
      accepted.push(f)
    }
    if (!accepted.length) return
    const created: Draft[] = accepted.map(f => ({
      id: crypto.randomUUID(), file: f, preview: f.type.startsWith('image/') ? URL.createObjectURL(f) : null, status: 'reading', message: t('順番待ち…'),
      form: { ...emptyForm(today()), }, suggestions: [], warnings: [], rawText: '', confidence: null, error: null, allowNoFile: false,
    }))
    draftsRef.current = [...draftsRef.current, ...created]
    setDrafts(ds => [...ds, ...created])
    queue.current.push(...created.map(c => c.id))
    runQueue()
  }

  function addManual() {
    const d: Draft = { id: crypto.randomUUID(), file: null, preview: null, status: 'ready', message: '', form: emptyForm(today()), suggestions: [], warnings: [], rawText: '', confidence: null, error: null, allowNoFile: false }
    setDrafts(ds => [...ds, d])
  }

  function discard(id: string) {
    const d = draftsRef.current.find(x => x.id === id)
    if (d?.preview) URL.revokeObjectURL(d.preview)
    queue.current = queue.current.filter(q => q !== id)
    setDrafts(ds => ds.filter(x => x.id !== id))
  }

  async function saveDraft(id: string, withoutFile = false) {
    const d = draftsRef.current.find(x => x.id === id)
    if (!d || d.status === 'saving') return
    const errs = validateForm(d.form).map(m => t(m))
    if (errs.length) { patchDraft(id, { error: errs.join(' / ') }); return }
    if (!userId) { patchDraft(id, { error: t('ログイン情報を取得できません。再ログインしてください。') }); return }
    const f = d.form
    const thb = formThb(f)!
    // 重複確認（同日・同額・同取引先）
    const { data: dup } = await supabase.from('expenses').select('id,vendor').eq('expense_date', f.date).eq('amount_thb', thb)
    const sameVendor = (dup ?? []).filter(x => (x.vendor ?? '').toLowerCase().replace(/\s+/g, '') === f.vendor.toLowerCase().replace(/\s+/g, ''))
    if (sameVendor.length && !confirm(t('同じ日付・金額・取引先の経費が既に登録されています。重複の可能性があります。それでも保存しますか？'))) return
    patchDraft(id, { status: 'saving', error: null })
    let receiptPath: string | null = null
    if (d.file && !withoutFile) {
      try {
        const up = await compressForUpload(d.file)
        const path = `${userId}/${f.date.slice(0, 7)}/${crypto.randomUUID()}.${up.ext}`
        const { error } = await supabase.storage.from('receipts').upload(path, up.blob, { contentType: up.contentType, upsert: false })
        if (error) throw new Error(error.message)
        receiptPath = path
      } catch (e) {
        patchDraft(id, { status: 'ready', error: t('領収書の保存に失敗しました（{msg}）。もう一度保存するか、「領収書なしで保存」を選んでください。', { msg: (e as Error).message }), allowNoFile: true })
        return
      }
    }
    const item = itemMap.get(f.itemCode)!
    const isThb = f.currency === 'THB'
    const { error } = await supabase.from('expenses').insert({
      user_id: applicantId || userId, expense_date: f.date, category: item.category_name, item_code: item.code,
      amount_thb: thb, amount_jpy: Math.round(thb * jpyRate), exchange_rate: jpyRate,
      currency: f.currency, foreign_amount: isThb ? null : parseFloat(f.amount), fx_rate: isThb ? null : parseFloat(f.fxRate),
      vendor: f.vendor.trim() || null, description: f.description.trim() || null, payment_date: f.paymentDate || null,
      payment_method: f.paymentMethod, payment_status: f.paymentStatus, has_receipt: !!receiptPath, receipt_no: f.receiptNo.trim() || null,
      advanced_by: f.paymentMethod === '個人立替' ? (members.find(m => m.id === (applicantId || userId))?.name || userName || null) : null, receipt_path: receiptPath, memo: f.memo.trim() || null,
      ocr_raw: d.rawText ? { text: d.rawText.slice(0, 4000), confidence: d.confidence, suggestions: d.suggestions } : null,
    })
    if (error) {
      if (receiptPath) await supabase.storage.from('receipts').remove([receiptPath])
      patchDraft(id, { status: 'ready', error: t('保存に失敗しました: {msg}', { msg: error.message }) })
      return
    }
    rememberVendor(f.vendor, f.itemCode)
    discard(id)
    flash('ok', t('保存しました（{code} {name} ฿{amt}）', { code: item.code, name: itemName(item.code, item.name), amt: thb.toLocaleString() }))
    // 取引日が表示中の月と違えば、その月へ移動して確認できるようにする
    if (f.date.slice(0, 7) !== ym) { setYear(+f.date.slice(0, 4)); setMonth(+f.date.slice(5, 7)) } else load()
  }

  // ─── 編集・削除 ───
  const [editForm, setEditForm] = useState<FormState | null>(null)
  const [editErr, setEditErr] = useState<string | null>(null)
  const [editSaving, setEditSaving] = useState(false)
  function openEdit(e: ExpenseRecord) {
    if (!isAdmin) { flash('err', t('登録済みの経費の修正・削除は管理者のみ可能です')); return }
    setEdit(e); setEditErr(null)
    setEditForm({
      date: e.expense_date, vendor: e.vendor ?? '', itemCode: e.item_code ?? '', amount: String(e.currency === 'THB' ? e.amount_thb : (e.foreign_amount ?? '')),
      currency: e.currency || 'THB', fxRate: e.fx_rate != null ? String(e.fx_rate) : '', paymentMethod: e.payment_method, paymentStatus: e.payment_status,
      paymentDate: e.payment_date ?? '', receiptNo: e.receipt_no ?? '', description: e.description ?? '', memo: e.memo ?? '',
    })
  }
  async function saveEdit() {
    if (!edit || !editForm) return
    const errs = validateForm(editForm).map(m => t(m))
    if (errs.length) { setEditErr(errs.join(' / ')); return }
    setEditSaving(true)
    const f = editForm, item = itemMap.get(f.itemCode)!, thb = formThb(f)!, isThb = f.currency === 'THB'
    const { error } = await supabase.from('expenses').update({
      expense_date: f.date, category: item.category_name, item_code: item.code, amount_thb: thb, amount_jpy: Math.round(thb * (edit.exchange_rate || jpyRate)),
      currency: f.currency, foreign_amount: isThb ? null : parseFloat(f.amount), fx_rate: isThb ? null : parseFloat(f.fxRate),
      vendor: f.vendor.trim() || null, description: f.description.trim() || null, payment_date: f.paymentDate || null,
      payment_method: f.paymentMethod, payment_status: f.paymentStatus, receipt_no: f.receiptNo.trim() || null,
      advanced_by: f.paymentMethod === '個人立替' ? (edit.advanced_by || userName || null) : null, memo: f.memo.trim() || null,
    }).eq('id', edit.id)
    setEditSaving(false)
    if (error) { setEditErr(t('保存に失敗しました: {msg}', { msg: error.message })); return }
    setEdit(null); load(); flash('ok', t('更新しました'))
  }
  async function deleteOne() {
    if (!edit) return
    if (!confirm(t('この経費を削除しますか？（領収書画像も削除されます）'))) return
    if (edit.receipt_path) { const { error } = await supabase.storage.from('receipts').remove([edit.receipt_path]); if (error) { setEditErr(t('領収書画像の削除に失敗: {msg}', { msg: error.message })); return } }
    const { error } = await supabase.from('expenses').delete().eq('id', edit.id)
    if (error) { setEditErr(t('削除に失敗しました: {msg}', { msg: error.message })); return }
    setEdit(null); load()
  }
  async function openReceipt(path: string) {
    const { data, error } = await supabase.storage.from('receipts').createSignedUrl(path, 300)
    if (error || !data) { flash('err', t('領収書を開けません: {msg}', { msg: error?.message ?? '' })); return }
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  // ─── 月次Excel出力・領収書ZIP・月次削除 ───
  async function exportExcel() {
    setBusy(t('Excelを作成中…'))
    try {
      const { start, end } = monthRange(ym)
      const [all, bud] = await Promise.all([
        supabase.from('expenses').select('*').gte('expense_date', start).lt('expense_date', end).limit(5000),
        supabase.from('budget_amounts').select('item_code,amount_thb').eq('month', start),
      ])
      if (all.error) throw new Error(all.error.message)
      if (bud.error) throw new Error(bud.error.message)
      const rows = (all.data ?? []) as ExpenseRecord[]
      if (!rows.length) { flash('err', t('この月の経費がありません')); return }
      const budgets: Record<string, number> = {}
      for (const b of bud.data ?? []) budgets[b.item_code] = Number(b.amount_thb)
      const { buildMonthWorkbook } = await import('@/lib/excel/exportMonth')
      const buf = await buildMonthWorkbook({ ym, expenses: rows, items, budgets, lang, t, itemName, catName })
      downloadBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${t('経費実績明細_{ym}', { ym })}.xlsx`)
      const total = rows.reduce((s, r) => s + Number(r.amount_thb), 0)
      // 出力日時はDBの時刻(now())を使う。再出力時は一度削除して作り直す
      const del = await supabase.from('month_exports').delete().eq('ym', ym)
      if (del.error) throw new Error(t('出力記録の更新に失敗: {msg}', { msg: del.error.message }))
      const { error } = await supabase.from('month_exports').insert({ ym, exported_by: userId, row_count: rows.length, total_thb: total, checksum: rowsChecksum(rows) })
      if (error) throw new Error(t('出力記録の保存に失敗: {msg}', { msg: error.message }))
      await load()
      flash('ok', t('{n}件をExcel出力しました。PCに保存されたことを確認してください。', { n: rows.length }))
    } catch (e) { flash('err', t('Excel出力に失敗しました: {msg}', { msg: (e as Error).message })) } finally { setBusy(null) }
  }

  async function exportZip() {
    const withFiles = expenses.filter(e => e.receipt_path).sort((a, b) => a.expense_date.localeCompare(b.expense_date) || a.created_at.localeCompare(b.created_at))
    if (!withFiles.length) { flash('err', t('この月に保存された領収書画像はありません')); return }
    setBusy(t('領収書をまとめています…'))
    try {
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()
      const sorted = [...expenses].sort((a, b) => a.expense_date.localeCompare(b.expense_date) || a.created_at.localeCompare(b.created_at))
      let done = 0
      for (const e of withFiles) {
        const { data, error } = await supabase.storage.from('receipts').download(e.receipt_path!)
        if (error || !data) throw new Error(`${e.expense_date} ${e.vendor ?? ''}: ${error?.message ?? t('ダウンロード失敗')}`)
        zip.file(receiptFileName(e, sorted.findIndex(x => x.id === e.id) + 1), data)
        setBusy(`${t('領収書をまとめています…')} ${++done}/${withFiles.length}`)
      }
      const blob = await zip.generateAsync({ type: 'blob' })
      downloadBlob(blob, `${t('領収書_{ym}', { ym })}.zip`)
      flash('ok', t('領収書{n}件をZIPにしました', { n: withFiles.length }))
    } catch (e) { flash('err', t('ZIP作成に失敗しました: {msg}', { msg: (e as Error).message })) } finally { setBusy(null) }
  }

  const [ack, setAck] = useState(false)
  async function deleteMonth() {
    setBusy(t('この月のデータを削除中…'))
    try {
      const paths = expenses.map(e => e.receipt_path).filter((p): p is string => !!p)
      for (let i = 0; i < paths.length; i += 50) {
        const { error } = await supabase.storage.from('receipts').remove(paths.slice(i, i + 50))
        if (error) throw new Error(t('領収書画像の削除に失敗: {msg}', { msg: error.message }))
      }
      const { start, end } = monthRange(ym)
      const { error } = await supabase.from('expenses').delete().gte('expense_date', start).lt('expense_date', end)
      if (error) throw new Error(error.message)
      const { count } = await supabase.from('expenses').select('id', { count: 'exact', head: true }).gte('expense_date', start).lt('expense_date', end)
      if (count && count > 0) throw new Error(t('{n}件を削除できませんでした（管理者権限が必要です）', { n: count }))
      await supabase.from('month_exports').update({ data_deleted_at: new Date().toISOString() }).eq('ym', ym)
      setDelOpen(false); setAck(false); await load()
      flash('ok', t('{ym}のデータを削除しました', { ym: ymLabel }))
    } catch (e) { flash('err', t('削除に失敗しました（途中まで削除された可能性があります。画面を更新して確認してください）: {msg}', { msg: (e as Error).message })); await load() } finally { setBusy(null) }
  }

  const canDelete = !!exportInfo && !changedAfterExport && expenses.length > 0
  const groups = useMemo(() => groupByCategory(items, false), [items])
  const camRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{t('経費管理')}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{t('{ym} — {n}件　領収書は撮影・画像・PDFから自動入力できます', { ym: ymLabel, n: expenses.length })}</p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <label className="flex items-center gap-1 text-xs text-slate-500">{t('申請者')}
            <select value={applicantId} onChange={e => setApplicantId(e.target.value)} className="h-8 rounded-md border border-input bg-white px-2 text-sm text-slate-900" aria-label={t('申請者（代理申請の場合は変更）')}>
              {members.map(m => <option key={m.id} value={m.id}>{m.name}{m.id === userId ? t('（自分）') : ''}</option>)}
            </select>
          </label>
          <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
          <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
          <Button size="sm" onClick={() => camRef.current?.click()}><Camera size={14} className="mr-1" />{t('撮影')}</Button>
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}><FileUp size={14} className="mr-1" />{t('画像・PDF取込')}</Button>
          <Button size="sm" variant="outline" onClick={addManual}><Plus size={14} className="mr-1" />{t('手入力')}</Button>
        </div>
      </div>

      {notice && (
        <div className={`rounded-md px-3 py-2 text-sm flex items-start gap-2 ${notice.kind === 'ok' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
          {notice.kind === 'ok' ? <Check size={15} className="mt-0.5 shrink-0" /> : <AlertTriangle size={15} className="mt-0.5 shrink-0" />}
          <span className="flex-1">{notice.text}</span>
          <button onClick={() => setNotice(null)} aria-label={t('閉じる')}><X size={14} /></button>
        </div>
      )}
      {loadError && <div className="rounded-md px-3 py-2 text-sm bg-red-50 text-red-800 border border-red-200">{loadError}</div>}

      {/* 取り込み中・入力待ちの明細（保存するまでデータは登録されません） */}
      {drafts.map((d, idx) => (
        <Card key={d.id} className="border-blue-200 bg-blue-50/30"><CardContent className="pt-4 space-y-3">
          <div className="flex items-start gap-3">
            {d.preview ? <img src={d.preview} alt={t('領収書')} className="w-16 h-16 object-cover rounded border" />
              : <div className="w-16 h-16 rounded border border-slate-200 bg-white flex items-center justify-center text-slate-300"><Paperclip size={20} /></div>}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">{t('新規経費')} {idx + 1}{d.file ? `（${d.file.name}）` : `（${t('手入力')}）`}</p>
              {d.status === 'reading' && <p className="text-xs text-blue-700 mt-1">{t('解析中…')} {progressText(d.message)}</p>}
              {d.status !== 'reading' && d.file && <p className="text-[11px] text-slate-500 mt-1">{t('自動入力した内容は候補です。日付・金額・費目を必ず確認・修正してから保存してください。')}{d.confidence != null && d.confidence < 100 && ` (${t('読み取り精度')} ${Math.round(d.confidence)}%)`}</p>}
              {d.warnings.map((w, i) => <p key={i} className="text-[11px] text-amber-700 mt-0.5">⚠ {w}</p>)}
            </div>
            <button onClick={() => discard(d.id)} className="text-slate-400 hover:text-slate-600" aria-label={t('破棄')}><X size={16} /></button>
          </div>
          {d.status !== 'reading' && (
            <>
              <ExpenseForm f={d.form} set={p => patchForm(d.id, p)} items={items} suggestions={d.suggestions} jpyRate={jpyRate} />
              {d.rawText && <details className="text-[11px] text-slate-500"><summary className="cursor-pointer">{t('読み取ったテキストを確認')}</summary><pre className="whitespace-pre-wrap bg-white border rounded p-2 mt-1 max-h-40 overflow-auto">{d.rawText}</pre></details>}
              {d.error && <p className="text-xs text-red-600">{d.error}</p>}
              <div className="flex gap-2">
                <Button size="sm" className="flex-1" disabled={d.status === 'saving'} onClick={() => saveDraft(d.id)}>{d.status === 'saving' ? t('保存中…') : t('保存')}</Button>
                {d.allowNoFile && <Button size="sm" variant="outline" onClick={() => saveDraft(d.id, true)}>{t('領収書なしで保存')}</Button>}
              </div>
            </>
          )}
        </CardContent></Card>
      ))}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="pt-4 pb-3"><p className="text-xs text-slate-500 mb-1">{t('運営費 合計（THB）')}</p><p className="text-lg font-bold tabular-nums">฿{fmt(sums.op)}</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><p className="text-xs text-slate-500 mb-1">{t('運営費外（敷金・資産等）')}</p><p className="text-lg font-bold tabular-nums">฿{fmt(sums.other)}</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><p className="text-xs text-slate-500 mb-1">{t('参考円換算（運営費）')}</p><p className="text-lg font-bold tabular-nums">¥{fmt(sums.op * jpyRate)}</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><p className="text-xs text-slate-500 mb-1">{t('件数 / 領収書あり')}</p><p className="text-lg font-bold">{expenses.length} / {expenses.filter(e => e.has_receipt).length}</p></CardContent></Card>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <select value={year} onChange={e => setYear(+e.target.value)} className="h-8 rounded-md border border-input bg-white px-2 text-sm" aria-label={t('年')}>
          {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => <option key={y} value={y}>{t('{y}年', { y })}</option>)}</select>
        <select value={month} onChange={e => setMonth(+e.target.value)} className="h-8 rounded-md border border-input bg-white px-2 text-sm" aria-label={t('月')}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{monthName(m)}</option>)}</select>
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)} className="h-8 rounded-md border border-input bg-white px-2 text-sm max-w-[200px]" aria-label={t('大分類')}>
          <option value="all">{t('全大分類')}</option>{groups.map(g => <option key={g.code} value={g.code}>{g.code}. {catName(g.code, g.name).slice(0, lang === 'ja' ? 14 : 30)}</option>)}</select>
        <Input placeholder={t('キーワード検索')} value={search} onChange={e => setSearch(e.target.value)} className="h-8 text-sm w-40" />
        {isAdmin && <div className="ml-auto flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" disabled={!expenses.length || !!busy} onClick={exportZip}><Archive size={14} className="mr-1" />{t('領収書ZIP')}</Button>
          <Button size="sm" disabled={!expenses.length || !!busy} onClick={exportExcel}><Download size={14} className="mr-1" />{t('月次Excel出力')}</Button>
        </div>}
      </div>
      {busy && <p className="text-sm text-blue-700">{busy}</p>}

      {/* 月次出力・削除の状態（管理者のみ） */}
      {isAdmin && <Card><CardContent className="py-3 flex flex-wrap items-center gap-3 text-sm">
        {exportInfo ? (
          exportInfo.data_deleted_at
            ? <p className="text-slate-600">✔ {t('{ym}はExcel出力済み、アプリ内データは削除済みです（出力 {at}）。', { ym: ymLabel, at: new Date(exportInfo.exported_at).toLocaleString(locale) })}</p>
            : changedAfterExport
              ? <p className="text-amber-700">⚠ {t('前回のExcel出力（{at}／{n}件）の後に追加・削除・金額変更があります。もう一度「月次Excel出力」を実行してください。', { at: new Date(exportInfo.exported_at).toLocaleString(locale), n: exportInfo.row_count })}</p>
              : <p className="text-green-700">✔ {t('Excel出力済み（{at}／{n}件）。PCに保存したことを確認のうえ、不要なら削除できます。', { at: new Date(exportInfo.exported_at).toLocaleString(locale), n: exportInfo.row_count })}</p>
        ) : <p className="text-slate-500">{t('この月はまだExcel出力していません。月末に「月次Excel出力」→「領収書ZIP」で保存してください。')}</p>}
        <Button size="sm" variant="outline" className="ml-auto text-red-600 border-red-200 hover:bg-red-50" disabled={!canDelete || !!busy} onClick={() => { setAck(false); setDelOpen(true) }}>
          <Trash2 size={14} className="mr-1" />{t('この月のデータを削除')}</Button>
      </CardContent></Card>}

      <Card><CardContent className="p-0">
        {loading ? <div className="flex items-center justify-center h-32"><p className="text-sm text-slate-400">{t('読み込み中...')}</p></div>
          : visible.length === 0 ? <div className="flex items-center justify-center h-32"><p className="text-sm text-slate-400">{t('データがありません')}</p></div>
            : <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead><tr className="border-b bg-slate-50 text-xs font-medium text-slate-500">
                <th className="text-left py-2.5 px-3">{t('日付')}</th><th className="text-left py-2.5 px-3">{t('取引先・内容')}</th><th className="text-left py-2.5 px-3">{t('費目')}</th>
                <th className="text-right py-2.5 px-3">THB</th><th className="text-left py-2.5 px-3">{t('支払')}</th><th className="text-center py-2.5 px-3">{t('領収書')}</th></tr></thead>
              <tbody>{visible.map(e => {
                const it = itemMap.get(e.item_code ?? '')
                const dup = dupSet.has(duplicateKey(e.expense_date, Number(e.amount_thb), e.vendor))
                return (
                  <tr key={e.id} className="border-b hover:bg-slate-50 cursor-pointer" onClick={() => openEdit(e)}>
                    <td className="py-2.5 px-3 tabular-nums text-slate-600 whitespace-nowrap">{e.expense_date.slice(5).replace('-', '/')}</td>
                    <td className="py-2.5 px-3 max-w-[220px]"><p className="truncate">{e.vendor ?? '—'}{dup && <span className="ml-1 text-[10px] text-amber-600">{t('重複?')}</span>}</p>
                      {(e.description || e.memo) && <p className="text-[11px] text-slate-400 truncate">{e.description || e.memo}</p>}</td>
                    <td className="py-2.5 px-3 text-xs">{it ? <><span className="font-mono text-slate-400">{it.code}</span> {itemName(it.code, it.name)}</> : <span className="text-red-600">{t('費目不明')}</span>}
                      {it && it.budget_type !== '運営費' && <span className="ml-1 text-[10px] px-1 rounded bg-purple-50 text-purple-700">{budgetTypeLabel(lang, it.budget_type)}</span>}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums font-medium">฿{Number(e.amount_thb).toLocaleString()}{e.currency !== 'THB' && <span className="block text-[10px] text-slate-400">{e.foreign_amount} {e.currency}</span>}</td>
                    <td className="py-2.5 px-3 text-xs text-slate-500 whitespace-nowrap">{t(e.payment_method)}<span className={`block text-[10px] ${e.payment_status === '支払済' ? 'text-slate-400' : 'text-amber-600'}`}>{t(e.payment_status)}</span></td>
                    <td className="py-2.5 px-3 text-center" onClick={ev => ev.stopPropagation()}>
                      {e.receipt_path ? <button className="text-blue-600 hover:underline text-xs" onClick={() => openReceipt(e.receipt_path!)}>{t('表示')}</button> : <span className="text-[11px] text-slate-300">{t('なし')}</span>}</td>
                  </tr>)
              })}</tbody>
              <tfoot><tr className="border-t bg-slate-50"><td colSpan={3} className="py-2.5 px-3 text-xs text-slate-500 font-medium">{t('{n}件（表示中）', { n: visible.length })}</td>
                <td className="py-2.5 px-3 text-right font-semibold">฿{fmt(visible.reduce((s, e) => s + Number(e.amount_thb), 0))}</td><td colSpan={2} /></tr></tfoot>
            </table></div>}
      </CardContent></Card>

      {/* 編集 */}
      {edit && editForm && (
        <Dialog open onOpenChange={v => { if (!v) setEdit(null) }}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle className="text-base">{t('経費を編集')}</DialogTitle></DialogHeader>
            <ExpenseForm f={editForm} set={p => setEditForm(f => (f ? { ...f, ...p } : f))} items={items} jpyRate={edit.exchange_rate || jpyRate} itemLocked />
            {edit.receipt_path && <button className="text-xs text-blue-600 hover:underline text-left" onClick={() => openReceipt(edit.receipt_path!)}>{t('領収書を表示')}</button>}
            {editErr && <p className="text-xs text-red-600">{editErr}</p>}
            <DialogFooter className="gap-2">
              <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50 mr-auto" onClick={deleteOne}>{t('削除')}</Button>
              <Button variant="outline" size="sm" onClick={() => setEdit(null)}>{t('キャンセル')}</Button>
              <Button size="sm" onClick={saveEdit} disabled={editSaving}>{editSaving ? t('保存中...') : t('保存')}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* 月次削除の確認 */}
      {delOpen && (
        <Dialog open onOpenChange={v => { if (!v && !busy) setDelOpen(false) }}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle className="text-base text-red-700">{t('{ym}のデータを削除', { ym: ymLabel })}</DialogTitle></DialogHeader>
            <div className="space-y-3 text-sm">
              <p>{t('経費 {n}件（合計 ฿{total}）と、保存済みの領収書画像 {r}件 を削除します。元に戻せません。', { n: expenses.length, total: fmt(sums.all), r: expenses.filter(e => e.receipt_path).length })}</p>
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} className="mt-1" />
                <span>{t('月次Excelと領収書ZIPをPCに保存し、中身を確認しました。')}</span></label>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" size="sm" onClick={() => setDelOpen(false)} disabled={!!busy}>{t('キャンセル')}</Button>
              <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white" disabled={!ack || !!busy} onClick={deleteMonth}>{busy ? t('削除中…') : t('削除する')}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
export default ExpensesPage
