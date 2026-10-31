// 経費明細（expensesテーブル）の型と共通ヘルパー
import type { CostItem } from './costItems'

export interface ExpenseRecord {
  id: string
  user_id: string
  expense_date: string          // YYYY-MM-DD
  category: string              // 大分類名（費目マスタ由来）
  item_code: string | null
  amount_thb: number
  amount_jpy: number
  exchange_rate: number         // 円/THB（参考換算）
  currency: string
  foreign_amount: number | null
  fx_rate: number | null        // THB/外貨
  vendor: string | null
  description: string | null
  payment_date: string | null
  payment_method: string
  payment_status: string
  has_receipt: boolean
  receipt_no: string | null
  advanced_by: string | null
  receipt_path: string | null
  memo: string | null
  ocr_raw: Record<string, unknown> | null
  created_at: string
}

/** 領収書ZIP内のファイル名（Excelの証憑番号・領収書一覧と対応） */
export function receiptFileName(e: Pick<ExpenseRecord, 'expense_date' | 'item_code' | 'amount_thb' | 'vendor' | 'receipt_path'>, seq: number): string {
  const ext = (e.receipt_path?.split('.').pop() || 'jpg').toLowerCase()
  const clean = (s: string) => s.replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 24)
  const parts = [String(seq).padStart(3, '0'), e.expense_date, e.item_code ?? 'NA', String(Math.round(e.amount_thb)), clean(e.vendor ?? '')].filter(Boolean)
  return `${parts.join('_')}.${ext}`
}

export interface ItemTotal { code: string; name: string; categoryCode: string; categoryName: string; budgetType: string; count: number; total: number }

/** 費目別集計（費目マスタに無いコードは「不明」として別扱い） */
export function totalsByItem(expenses: ExpenseRecord[], items: CostItem[]): { rows: ItemTotal[]; unclassified: { count: number; total: number } } {
  const byCode = new Map(items.map(i => [i.code, i]))
  const acc = new Map<string, ItemTotal>()
  const un = { count: 0, total: 0 }
  for (const e of expenses) {
    const it = e.item_code ? byCode.get(e.item_code) : undefined
    if (!it) { un.count++; un.total += Number(e.amount_thb); continue }
    let r = acc.get(it.code)
    if (!r) { r = { code: it.code, name: it.name, categoryCode: it.category_code, categoryName: it.category_name, budgetType: it.budget_type, count: 0, total: 0 }; acc.set(it.code, r) }
    r.count++; r.total += Number(e.amount_thb)
  }
  const rows = [...acc.values()].sort((a, b) => a.code.localeCompare(b.code))
  return { rows, unclassified: un }
}

/** 重複の疑い（同一日・同一金額・同一取引先） */
export function duplicateKey(date: string, amountThb: number, vendor: string | null): string {
  return `${date}|${Math.round(amountThb * 100)}|${(vendor ?? '').toLowerCase().replace(/\s+/g, '')}`
}

/** 明細内容のチェックサム（Excel出力後に追加・変更・削除があったかの検出用。FNV-1a） */
export function rowsChecksum(rows: Pick<ExpenseRecord, 'id' | 'expense_date' | 'item_code' | 'amount_thb' | 'vendor' | 'payment_status' | 'receipt_path'>[]): string {
  const keys = rows.map(r => `${r.id}|${r.expense_date}|${r.item_code ?? ''}|${Number(r.amount_thb).toFixed(2)}|${r.vendor ?? ''}|${r.payment_status}|${r.receipt_path ?? ''}`).sort()
  let h = 0x811c9dc5
  for (const ch of keys.join('\n')) { h ^= ch.codePointAt(0)!; h = Math.imul(h, 0x01000193) >>> 0 }
  return `${keys.length}:${h.toString(16)}`
}
