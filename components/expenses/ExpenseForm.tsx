'use client'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { type CostItem, groupByCategory, toThb, PAYMENT_METHODS, PAYMENT_STATUSES } from '@/lib/costItems'
import { useI18n, budgetTypeLabel } from '@/lib/i18n'

export interface FormState {
  date: string
  vendor: string
  itemCode: string
  amount: string
  currency: string
  fxRate: string
  paymentMethod: string
  paymentStatus: string
  paymentDate: string
  receiptNo: string
  description: string
  memo: string
}

export function emptyForm(date: string): FormState {
  return { date, vendor: '', itemCode: '', amount: '', currency: 'THB', fxRate: '', paymentMethod: '現金', paymentStatus: '支払済',
    paymentDate: '', receiptNo: '', description: '', memo: '' }
}

export function formThb(f: FormState): number | null {
  const a = parseFloat(f.amount)
  const r = f.fxRate === '' ? null : parseFloat(f.fxRate)
  return toThb(f.currency, isNaN(a) ? null : a, r != null && isNaN(r) ? null : r)
}

/** 保存前の入力チェック。エラーが無ければ空配列 */
export function validateForm(f: FormState): string[] {
  const errs: string[] = []
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date) || isNaN(Date.parse(f.date))) errs.push('日付を入力してください')
  if (!f.itemCode) errs.push('費目を選択してください')
  const a = parseFloat(f.amount)
  if (isNaN(a) || a <= 0) errs.push('金額は0より大きい数値を入力してください')
  return errs
}

const sel = 'h-8 w-full rounded-md border border-input bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

export function ItemSelect({ items, value, onChange, suggestions = [], showInactive }: {
  items: CostItem[]; value: string; onChange: (code: string) => void; suggestions?: string[]; showInactive?: boolean
}) {
  const { t, itemName, catName } = useI18n()
  const groups = groupByCategory(items, !showInactive)
  const byCode = new Map(items.map(i => [i.code, i]))
  const sugg = suggestions.map(c => byCode.get(c)).filter((x): x is CostItem => !!x && x.is_active)
  return (
    <div className="space-y-1">
      <select value={value} onChange={e => onChange(e.target.value)} className={sel} aria-label={t('費目')}>
        <option value="">{t('— 費目を選択 —')}</option>
        {groups.map(g => (
          <optgroup key={g.code} label={`${g.code}. ${catName(g.code, g.name)}`}>
            {g.items.map(i => <option key={i.code} value={i.code}>{i.code}　{itemName(i.code, i.name)}</option>)}
          </optgroup>
        ))}
      </select>
      {sugg.length > 0 && !value && (
        <div className="flex flex-wrap gap-1 items-center">
          <span className="text-[10px] text-slate-400">{t('候補:')}</span>
          {sugg.slice(0, 4).map(i => (
            <button key={i.code} type="button" onClick={() => onChange(i.code)}
              className="text-[11px] px-1.5 py-0.5 rounded border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100">
              {i.code} {itemName(i.code, i.name)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ExpenseForm({ f, set, items, suggestions, jpyRate, itemLocked }: {
  f: FormState; set: (patch: Partial<FormState>) => void; items: CostItem[]; suggestions?: string[]; jpyRate: number; itemLocked?: boolean
}) {
  const { t, lang, itemName, catName } = useI18n()
  const thb = formThb(f)
  const item = items.find(i => i.code === f.itemCode)
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1"><Label className="text-xs text-slate-500">{t('取引日')} *</Label>
          <Input type="date" value={f.date} onChange={e => set({ date: e.target.value })} className="h-8 text-sm" /></div>
        <div className="space-y-1"><Label className="text-xs text-slate-500">{t('取引先')}</Label>
          <Input value={f.vendor} onChange={e => set({ vendor: e.target.value })} className="h-8 text-sm" placeholder={t('店名・会社名')} /></div>
      </div>
      <div className="space-y-1"><Label className="text-xs text-slate-500">{t('費目')} *（{t('選ぶと大分類・区分が自動で決まります')}）</Label>
        <ItemSelect items={items} value={f.itemCode} onChange={code => set({ itemCode: code })} suggestions={suggestions} showInactive={itemLocked} />
        {item && <p className="text-[11px] text-slate-500">{t('大分類')}: {item.category_code}. {catName(item.category_code, item.category_name)}　{t('区分')}: {budgetTypeLabel(lang, item.budget_type)}{item.budget_type !== '運営費' && <span className="text-amber-600">（{t('運営費合計には含まれません')}）</span>}</p>}
        {item?.note && /要確認/.test(item.note) && <p className="text-[11px] text-amber-600">⚠ {lang === 'ja' ? item.note.slice(0, 80) : t('この費目は分類の確認が必要です（管理者に確認してください）')}</p>}
      </div>
      <div className="space-y-1"><Label className="text-xs text-slate-500">{t('金額（THB）')} *</Label>
        <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">฿</span>
          <Input type="number" inputMode="decimal" step="0.01" min="0" value={f.amount} onChange={e => set({ amount: e.target.value })} className="h-8 text-sm pl-6" placeholder="0.00" /></div>
        {thb != null && <p className="text-[11px] text-slate-400">{t('参考円換算')}: ¥{Math.round(thb * jpyRate).toLocaleString()}（1THB={jpyRate} JPY）</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1"><Label className="text-xs text-slate-500">{t('支払方法')}</Label>
          <select value={f.paymentMethod} onChange={e => set({ paymentMethod: e.target.value })} className={sel} aria-label={t('支払方法')}>
            {PAYMENT_METHODS.map(p => <option key={p} value={p}>{t(p)}</option>)}</select></div>
        <div className="space-y-1"><Label className="text-xs text-slate-500">{t('支払状況')}</Label>
          <select value={f.paymentStatus} onChange={e => set({ paymentStatus: e.target.value })} className={sel} aria-label={t('支払状況')}>
            {PAYMENT_STATUSES.map(p => <option key={p} value={p}>{t(p)}</option>)}</select></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1"><Label className="text-xs text-slate-500">{t('証憑番号（領収書No.）')}</Label>
          <Input value={f.receiptNo} onChange={e => set({ receiptNo: e.target.value })} className="h-8 text-sm" /></div>
        <div className="space-y-1"><Label className="text-xs text-slate-500">{t('支払日（任意）')}</Label>
          <Input type="date" value={f.paymentDate} onChange={e => set({ paymentDate: e.target.value })} className="h-8 text-sm" /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1"><Label className="text-xs text-slate-500">{t('内容')}</Label>
          <Input value={f.description} onChange={e => set({ description: e.target.value })} className="h-8 text-sm" placeholder={t('例: 10月分 家賃')} /></div>
        <div className="space-y-1"><Label className="text-xs text-slate-500">{t('備考')}</Label>
          <Input value={f.memo} onChange={e => set({ memo: e.target.value })} className="h-8 text-sm" /></div>
      </div>
    </div>
  )
}
