// 費目マスタ（Excel「費目マスタ」と同一のコード体系 A〜J）
import type { SupabaseClient } from '@supabase/supabase-js'

export type BudgetType = '運営費' | '資産' | '預託金' | '資金移動'

export interface CostItem {
  code: string
  category_code: string
  category_name: string
  name: string
  cost_type: '継続' | '一時' | '年次' | '不定期'
  budget_type: BudgetType
  init_status: string
  note: string | null
  sort_order: number
  is_active: boolean
}

export async function fetchCostItems(supabase: SupabaseClient): Promise<CostItem[]> {
  const { data, error } = await supabase.from('cost_items').select('*').order('sort_order').order('code')
  if (error) throw new Error(error.message)
  return (data ?? []) as CostItem[]
}

export interface CostCategoryGroup { code: string; name: string; items: CostItem[] }

export function groupByCategory(items: CostItem[], onlyActive = true): CostCategoryGroup[] {
  const map = new Map<string, CostCategoryGroup>()
  for (const it of items) {
    if (onlyActive && !it.is_active) continue
    let g = map.get(it.category_code)
    if (!g) { g = { code: it.category_code, name: it.category_name, items: [] }; map.set(it.category_code, g) }
    g.items.push(it)
  }
  return [...map.values()].sort((a, b) => a.code.localeCompare(b.code))
}

/** 通常の運営費（資産・預託金・資金移動を除く）か */
export function isOperating(item: Pick<CostItem, 'budget_type'> | undefined | null): boolean {
  return !!item && item.budget_type === '運営費'
}

/** 'YYYY-MM' → その月の1日(YYYY-MM-01)と翌月1日 */
export function monthRange(ym: string): { start: string; end: string } {
  const [y, m] = ym.split('-').map(Number)
  const start = `${y}-${String(m).padStart(2, '0')}-01`
  const end = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
  return { start, end }
}

export const PAYMENT_METHODS = ['現金', '法人カード', '個人立替', '銀行振込', 'その他'] as const
export const PAYMENT_STATUSES = ['未払', '支払済', '精算待ち', '一部支払'] as const
export const CURRENCIES = ['THB', 'JPY', 'USD', 'MYR'] as const
export type PaymentMethodX = (typeof PAYMENT_METHODS)[number]
export type PaymentStatusX = (typeof PAYMENT_STATUSES)[number]
export type Currency = (typeof CURRENCIES)[number]

/** 通貨・金額・為替レート(1外貨=何THB)からTHB金額を計算。レート未入力の外貨は null（推測しない） */
export function toThb(currency: string, amount: number | null, rate: number | null): number | null {
  if (amount == null || !isFinite(amount)) return null
  if (currency === 'THB' || !currency) return Math.round(amount * 100) / 100
  if (rate == null || !isFinite(rate) || rate <= 0) return null
  return Math.round(amount * rate * 100) / 100
}

/** 予算の対象期間: 2026/7〜2027/12（管理表Excelと同じ18か月）。値は各月1日 */
export const BUDGET_MONTHS: string[] = Array.from({ length: 18 }, (_, i) => {
  const y = 2026 + Math.floor((6 + i) / 12), m = ((6 + i) % 12) + 1
  return `${y}-${String(m).padStart(2, '0')}-01`
})
