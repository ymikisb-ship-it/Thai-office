// 管理表（運営費予算 v3 Excel）から月別予算を取り込む
//  ・「月次・年次予算」シート：AB列の費目コード × F〜K(2026/7〜12)・N〜Y(2027/1〜12)
//  ・「追加費目予算」シート：A列の費目コード × 同じ月列
// 空欄＝予算未設定（取り込まない）。数式セルは Excel が保存した計算結果を使う。
// ※ 画像・コメント・入力規則を含むExcelでも確実に読めるよう、必要なシートのXMLだけを直接読む。
import JSZip from 'jszip'
import { BUDGET_MONTHS } from '../costItems'

// F..K = 列6..11、N..Y = 列14..25
const MONTH_COLS = [...[6, 7, 8, 9, 10, 11], ...[14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25]]

export interface BudgetImportRow { item_code: string; month: string; amount_thb: number }
export interface BudgetImportResult {
  rows: BudgetImportRow[]
  codes: number
  uncached: number            // 計算結果が保存されていない数式セル数（Excelで開いて保存し直す必要）
  unknownCodes: string[]
  warnings: string[]
  errors: string[]
}

interface Cell { v: string | null; hasFormula: boolean; type: string | null }
type Sheet = Map<string, Cell>

const decode = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')

function ref(col: number, row: number): string { let s = ''; let n = col; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26) } return `${s}${row}` }

function parseSharedStrings(xml: string | null): string[] {
  if (!xml) return []
  const out: string[] = []
  for (const si of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    let t = ''
    for (const m of si[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) t += decode(m[1])
    out.push(t)
  }
  return out
}

function parseSheet(xml: string, shared: string[]): Sheet {
  const cells: Sheet = new Map()
  for (const m of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const attrs = m[1], inner = m[2] ?? ''
    const r = attrs.match(/\br="([A-Z]+\d+)"/)?.[1]; if (!r) continue
    const type = attrs.match(/\bt="([^"]+)"/)?.[1] ?? null
    const hasFormula = /<f\b/.test(inner)
    let v: string | null = null
    const vm = inner.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)
    if (type === 'inlineStr') { v = [...inner.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(x => decode(x[1])).join('') }
    else if (vm) {
      v = vm[1]
      if (type === 's') v = shared[parseInt(v, 10)] ?? ''
      else v = decode(v)
    }
    cells.set(r, { v, hasFormula, type })
  }
  return cells
}

async function loadSheets(buf: ArrayBuffer, names: string[]): Promise<Map<string, Sheet>> {
  const zip = await JSZip.loadAsync(buf)
  const wbXml = await zip.file('xl/workbook.xml')?.async('string')
  const relXml = await zip.file('xl/_rels/workbook.xml.rels')?.async('string')
  if (!wbXml || !relXml) throw new Error('Excelファイルの形式を読み取れません')
  const rels = new Map<string, string>()
  for (const m of relXml.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const id = m[1].match(/\bId="([^"]+)"/)?.[1], target = m[1].match(/\bTarget="([^"]+)"/)?.[1]
    if (id && target) rels.set(id, target)
  }
  const shared = parseSharedStrings((await zip.file('xl/sharedStrings.xml')?.async('string')) ?? null)
  const out = new Map<string, Sheet>()
  for (const m of wbXml.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const name = decode(m[1].match(/\bname="([^"]*)"/)?.[1] ?? '')
    const rid = m[1].match(/\br:id="([^"]+)"/)?.[1] ?? m[1].match(/\bid="([^"]+)"/)?.[1]
    if (!names.includes(name) || !rid) continue
    let target = rels.get(rid); if (!target) continue
    target = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`
    const xml = await zip.file(target)?.async('string')
    if (xml) out.set(name, parseSheet(xml, shared))
  }
  return out
}

function num(c: Cell | undefined): { value: number | null; uncached: boolean } {
  if (!c) return { value: null, uncached: false }
  if (c.hasFormula && (c.v == null || (c.v === '' && c.type !== 'str'))) return { value: null, uncached: true }
  if (c.v == null || c.v === '') return { value: null, uncached: false }
  if (c.type === 's' || c.type === 'str' || c.type === 'inlineStr' || c.type === 'e' || c.type === 'b') return { value: null, uncached: false }
  const n = Number(c.v)
  return { value: isFinite(n) ? n : null, uncached: false }
}
const str = (c: Cell | undefined) => (c?.v ?? '').trim()

export async function parseBudgetWorkbook(buf: ArrayBuffer, validCodes: Set<string>): Promise<BudgetImportResult> {
  const res: BudgetImportResult = { rows: [], codes: 0, uncached: 0, unknownCodes: [], warnings: [], errors: [] }
  let sheets: Map<string, Sheet>
  try { sheets = await loadSheets(buf, ['月次・年次予算', '追加費目予算']) }
  catch (e) { res.errors.push(`Excelファイルを読み取れません: ${(e as Error).message}`); return res }
  const main = sheets.get('月次・年次予算')
  if (!main) { res.errors.push('「月次・年次予算」シートが見つかりません。運営費予算(v3)のExcelを選択してください。'); return res }
  if (str(main.get('F4')) !== '2026/7' || str(main.get('Y4')) !== '2027/12') {
    res.errors.push('月の見出し（F4=2026/7 … Y4=2027/12）が想定と異なります。形式を確認してください。'); return res
  }
  const acc = new Map<string, (number | null)[]>()
  const unknown = new Set<string>()
  const scan = (ws: Sheet, r0: number, r1: number, codeCol: number) => {
    for (let r = r0; r <= r1; r++) {
      const code = str(ws.get(ref(codeCol, r)))
      if (!code) continue
      if (!validCodes.has(code)) { unknown.add(code); continue }
      MONTH_COLS.forEach((c, idx) => {
        const { value, uncached } = num(ws.get(ref(c, r)))
        if (uncached) { res.uncached++; return }
        if (value == null) return
        let a = acc.get(code); if (!a) { a = new Array(18).fill(null); acc.set(code, a) }
        a[idx] = (a[idx] ?? 0) + value
      })
    }
  }
  scan(main, 6, 46, 28)    // AB列
  const extra = sheets.get('追加費目予算')
  if (extra) scan(extra, 6, 85, 1)
  else res.warnings.push('「追加費目予算」シートが無いため、既存費目のみ取り込みます。')
  for (const [code, arr] of acc) arr.forEach((v, idx) => { if (v != null) res.rows.push({ item_code: code, month: BUDGET_MONTHS[idx], amount_thb: Math.round(v * 100) / 100 }) })
  res.codes = acc.size
  res.unknownCodes = [...unknown]
  if (res.uncached > 0) res.errors.push(`数式の計算結果が保存されていないセルが${res.uncached}個あります。Excelでこのファイルを開き、上書き保存してから取り込んでください。`)
  if (unknown.size) res.warnings.push(`費目マスタに無いコード（取り込み対象外）: ${[...unknown].join(', ')}`)
  if (!res.rows.length && !res.errors.length) res.warnings.push('取り込める予算額が見つかりませんでした。')
  return res
}
