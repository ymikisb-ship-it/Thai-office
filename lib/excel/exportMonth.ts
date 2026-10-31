// 月次Excel出力：管理表「経費実績明細」の列構成(19列)と同一のシート＋月次サマリ＋領収書一覧
import ExcelJS from 'exceljs'
import type { CostItem } from '../costItems'
import { type ExpenseRecord, receiptFileName, totalsByItem } from '../expenses'

export const DETAIL_HEADERS = ['No.', '取引日', '計上月', '支払日', '費目コード', '大分類', '費目名', '取引先', '内容', '通貨', '外貨/元金額', '為替レート\n(THB/通貨)',
  'THB金額', '支払方法', '支払状況', '領収書\n(有/無)', '証憑番号', '立替者', '備考'] as const

const TEAL = 'FF0A6E7A', NAVY = 'FF0D2B45', GOLD = 'FFB8860B', SUB = 'FFD6EAF8', GREY = 'FFF0F2F5'
const thin = { style: 'thin' as const, color: { argb: 'FFBFBFBF' } }
const BORDER = { top: thin, left: thin, bottom: thin, right: thin }
const FONT = 'Noto Sans CJK SC'

function utc(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

function head(ws: ExcelJS.Worksheet, row: number, color = TEAL) {
  const r = ws.getRow(row)
  r.height = 36
  r.eachCell(c => {
    c.font = { name: FONT, size: 9, bold: true, color: { argb: 'FFFFFFFF' } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } }
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    c.border = BORDER
  })
}

export interface ExportInput {
  ym: string                                  // 'YYYY-MM'
  expenses: ExpenseRecord[]
  items: CostItem[]
  budgets: Record<string, number>             // 費目コード→当月予算（設定済みのみ。未設定は含めない）
}

export function expenseSheetRow(e: ExpenseRecord, items: Map<string, CostItem>, seq: number) {
  const it = e.item_code ? items.get(e.item_code) : undefined
  const isThb = !e.currency || e.currency === 'THB'
  const month = e.expense_date.slice(0, 7) + '-01'
  return [
    seq,
    utc(e.expense_date),
    utc(month),
    e.payment_date ? utc(e.payment_date) : null,
    e.item_code ?? '',
    it?.category_name ?? e.category ?? '',
    it?.name ?? '',
    e.vendor ?? '',
    e.description ?? '',
    e.currency || 'THB',
    isThb ? Number(e.amount_thb) : (e.foreign_amount != null ? Number(e.foreign_amount) : null),
    isThb ? null : (e.fx_rate != null ? Number(e.fx_rate) : null),
    Number(e.amount_thb),
    e.payment_method,
    e.payment_status,
    e.has_receipt ? '有' : '無',
    e.receipt_no ?? '',
    e.advanced_by ?? '',
    e.memo ?? '',
  ]
}

export async function buildMonthWorkbook(input: ExportInput): Promise<ArrayBuffer> {
  const { ym, items, budgets } = input
  const expenses = [...input.expenses].sort((a, b) => a.expense_date.localeCompare(b.expense_date) || a.created_at.localeCompare(b.created_at))
  const itemMap = new Map(items.map(i => [i.code, i]))
  const wb = new ExcelJS.Workbook()
  wb.creator = 'タイ駐在員事務所 管理システム'
  wb.created = new Date()

  // ── 1. 経費実績明細（管理表の経費実績明細と同一列） ──
  const ws = wb.addWorksheet('経費実績明細', { views: [{ state: 'frozen', ySplit: 1, xSplit: 2 }] })
  ws.addRow([...DETAIL_HEADERS])
  head(ws, 1)
  expenses.forEach((e, i) => ws.addRow(expenseSheetRow(e, itemMap, i + 1)))
  const widths = [6, 11, 9, 11, 10, 20, 28, 20, 28, 7, 13, 11, 13, 11, 10, 8, 14, 10, 24]
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w })
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    row.eachCell({ includeEmpty: true }, (c, col) => {
      c.font = { name: FONT, size: 9 }; c.border = BORDER
      c.alignment = { vertical: 'middle', horizontal: [1, 2, 3, 4, 5, 10, 14, 15, 16].includes(col) ? 'center' : [11, 12, 13].includes(col) ? 'right' : 'left' }
    })
    row.getCell(2).numFmt = 'yyyy/mm/dd'; row.getCell(4).numFmt = 'yyyy/mm/dd'; row.getCell(3).numFmt = 'yyyy/m'
    row.getCell(11).numFmt = '#,##0.00;(#,##0.00);-'; row.getCell(12).numFmt = '0.0000'; row.getCell(13).numFmt = '#,##0.00;(#,##0.00);-'
  }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, ws.rowCount), column: 19 } }

  // ── 2. 月次サマリ（費目別・大分類別。運営費とそれ以外を分離） ──
  const sm = wb.addWorksheet('月次サマリ', { views: [{ state: 'frozen', ySplit: 4 }] })
  sm.getCell('A1').value = `月次サマリ ${ym.replace('-', '年')}月　単位：THB`
  sm.getCell('A1').font = { name: FONT, size: 13, bold: true }
  sm.getCell('A2').value = '※ 予算は管理システムに登録済みの費目のみ表示（未設定の費目は「未設定」）。差異＝予算−実績（マイナス＝超過）'
  sm.getCell('A2').font = { name: FONT, size: 8, color: { argb: 'FF4A5568' } }
  sm.addRow([])
  sm.addRow(['費目コード', '大分類', '費目名', '区分', '件数', '実績(THB)', '当月予算(THB)', '差異(THB)'])
  head(sm, 4, NAVY)
  const { rows, unclassified } = totalsByItem(expenses, items)
  const cats = new Map<string, { name: string; rows: typeof rows }>()
  for (const r of rows) { const g = cats.get(r.categoryCode) ?? { name: r.categoryName, rows: [] }; g.rows.push(r); cats.set(r.categoryCode, g) }
  let opTotal = 0, opBudget = 0, opBudgetAny = false, otherTotal = 0
  const money = '#,##0;(#,##0);-'
  const addDetail = (vals: (string | number | null)[], bold = false, fillArgb?: string) => {
    const row = sm.addRow(vals)
    row.eachCell({ includeEmpty: true }, (c, col) => {
      c.font = { name: FONT, size: 9, bold }; c.border = BORDER
      if (fillArgb) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillArgb } }
      c.alignment = { vertical: 'middle', horizontal: col >= 5 ? 'right' : 'left' }
      if (col >= 6) c.numFmt = money
    })
    return row
  }
  for (const [code, g] of [...cats.entries()].sort()) {
    let sub = 0, subB = 0, anyB = false
    for (const r of g.rows) {
      const b = budgets[r.code]
      const op = r.budgetType === '運営費'
      if (op) { opTotal += r.total; if (b != null) { opBudget += b; opBudgetAny = true } } else otherTotal += r.total
      sub += r.total; if (b != null) { subB += b; anyB = true }
      const row = addDetail([r.code, r.categoryName, r.name, r.budgetType, r.count, r.total, b ?? '未設定', b != null ? b - r.total : ''])
      if (b == null) row.getCell(7).alignment = { horizontal: 'right' }
    }
    addDetail([`${code} 小計`, g.name, '', '', '', sub, anyB ? subB : '', anyB ? subB - sub : ''], true, SUB)
  }
  if (unclassified.count) addDetail(['（費目不明）', '', '費目コード未設定・マスタに無いコード', '', unclassified.count, unclassified.total, '', ''], true, 'FFF8CBAD')
  sm.addRow([])
  addDetail(['【運営費 合計】', '', '資産・敷金・資金移動を除く', '', '', opTotal, opBudgetAny ? opBudget : '', opBudgetAny ? opBudget - opTotal : ''], true, 'FFD9E1F2')
  addDetail(['【運営費外 合計】', '', '資産・敷金・保証金・資金移動（別管理）', '', '', otherTotal, '', ''], true, 'FFE4DFEC')
  addDetail(['【総合計】', '', '全明細の合計', '', expenses.length, opTotal + otherTotal + unclassified.total, '', ''], true, GREY)
  ;[12, 22, 34, 10, 7, 14, 14, 14].forEach((w, i) => { sm.getColumn(i + 1).width = w })

  // ── 3. 領収書一覧（ZIP内のファイル名と対応） ──
  const rc = wb.addWorksheet('領収書一覧')
  rc.addRow(['No.', '取引日', '取引先', 'THB金額', '証憑番号', '領収書(有/無)', '領収書ファイル名（ZIP内）'])
  head(rc, 1, GOLD)
  expenses.forEach((e, i) => {
    const row = rc.addRow([i + 1, utc(e.expense_date), e.vendor ?? '', Number(e.amount_thb), e.receipt_no ?? '', e.has_receipt ? '有' : '無', e.receipt_path ? receiptFileName(e, i + 1) : ''])
    row.eachCell({ includeEmpty: true }, c => { c.font = { name: FONT, size: 9 }; c.border = BORDER })
    row.getCell(2).numFmt = 'yyyy/mm/dd'; row.getCell(4).numFmt = '#,##0.00'
  })
  ;[6, 11, 24, 13, 14, 12, 56].forEach((w, i) => { rc.getColumn(i + 1).width = w })

  // ── 4. 貼り付け手順 ──
  const gd = wb.addWorksheet('貼り付け手順')
  const lines = [
    '【管理表（運営費予算 v3）への取り込み手順】',
    '1. 管理表の「経費実績明細」シートを開き、最初の空行（A列の番号が空の行）を確認します。',
    '2. 本ファイルの「経費実績明細」シートの B2 から S{最終行} までを範囲選択してコピーします（A列のNo.は含めません）。',
    '3. 管理表の「経費実績明細」シートの、最初の空行の B列 に「値として貼り付け」します。',
    '4. 月次予実管理シートの対象月を選ぶと、予算と実績が自動集計されます。「整合チェック」が OK であることを確認してください。',
    '',
    '※ 本ファイルの C列（計上月）・E列（費目コード）・F列（大分類）・M列（THB金額）は値で入っており、そのまま貼り付けて集計に使えます。',
    '※ 外貨の明細は為替レート（THB/通貨）が入力されたものだけTHB金額が入ります。',
    '※ Excelへ保存したのち、アプリ側の「この月のデータを削除」を実行してください（領収書画像はZIPで別途保存）。',
  ]
  lines.forEach((t, i) => { const c = gd.getCell(`A${i + 1}`); c.value = t; c.font = { name: FONT, size: i === 0 ? 12 : 10, bold: i === 0 } })
  gd.getColumn(1).width = 120

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer
}
