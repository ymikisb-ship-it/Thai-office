// 領収書テキスト（OCR／PDF抽出）の解析。ブラウザ・Node両方で動く純粋関数のみ。
// OCRは誤読を含むため、結果は必ず利用者が確認・修正する前提（候補として提示）。

export interface ParsedReceipt {
  vendor: string | null
  amount: number | null          // 合計金額（通貨は currency）
  currency: 'THB' | 'JPY' | 'USD' | 'MYR' | null   // 明確に判定できた場合のみ
  date: string | null            // YYYY-MM-DD（西暦）
  receiptNo: string | null
  itemCodes: string[]            // 費目コード候補（先頭が第一候補）
  confidence: number             // OCR信頼度 0-100（PDFテキスト抽出は100）
  warnings: string[]
  rawText: string
}

const THAI_DIGITS = '๐๑๒๓๔๕๖๗๘๙'
export function normalizeDigits(s: string): string {
  return s.replace(/[๐-๙]/g, c => String(THAI_DIGITS.indexOf(c)))
          .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
}

const TOTAL_RE = /(รวมทั้งสิ้น|ยอดรวมสุทธิ|ยอดสุทธิ|ยอดรวม|รวมเงิน|ราคารวม|สุทธิ|grand\s*total|total\s*amount|amount\s*due|net\s*total|total\s*due|\btotal\b|合計|総計|お支払)/i
const EXCLUDE_RE = /(vat|ภาษี|tax|เงินสด|cash|เงินทอน|change|ทอน|รับเงิน|tendered|point|พอยท์|แต้ม|discount|ส่วนลด|subtotal|sub\s*total|ก่อนภาษี|before)/i

function parseMoney(token: string): number | null {
  const t = token.replace(/,/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null
  const v = parseFloat(t)
  return isFinite(v) ? v : null
}

interface Tok { v: number; dec: boolean }
function moneyTokens(line: string): Tok[] {
  const l = normalizeDigits(line)
  const out: Tok[] = []
  const re = /(?<![\d.\/-])(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)(?![\d\/-]|%)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(l))) {
    const v = parseMoney(m[1])
    if (v != null) out.push({ v, dec: m[1].includes('.') })
  }
  return out
}

function extractAmount(lines: string[]): { amount: number | null; sure: boolean } {
  // 1) 合計キーワード行（除外語を含む行は後回し）。複数あれば最後の合計行を採用
  let best: number | null = null
  for (const line of lines) {
    if (TOTAL_RE.test(line) && !/sub\s*total|subtotal|ก่อนภาษี|vat|ภาษี/i.test(line)) {
      const nums = moneyTokens(line).map(t => t.v).filter(n => n > 0 && n < 100_000_000 && !(Number.isInteger(n) && String(n).length >= 10))
      if (nums.length) best = nums[nums.length - 1]
    }
  }
  if (best != null) return { amount: best, sure: true }
  // 2) 合計語が無い：小数2桁の金額のうち最大（税・釣銭・電話番号等を除く）
  const cand: Tok[] = []
  for (const line of lines) {
    if (EXCLUDE_RE.test(line)) continue
    for (const t of moneyTokens(line)) {
      if (t.v > 0 && t.v < 10_000_000 && !(!t.dec && String(t.v).length >= 9)) cand.push(t)
    }
  }
  if (!cand.length) return { amount: null, sure: false }
  const withDecimals = cand.filter(t => t.dec)
  const pool = (withDecimals.length ? withDecimals : cand).map(t => t.v)
  return { amount: Math.max(...pool), sure: false }
}

const MONTHS_EN = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const MONTHS_TH = ['ม.ค', 'ก.พ', 'มี.ค', 'เม.ย', 'พ.ค', 'มิ.ย', 'ก.ค', 'ส.ค', 'ก.ย', 'ต.ค', 'พ.ย', 'ธ.ค']

function iso(y: number, m: number, d: number, today: Date): string | null {
  if (y > 2400) y -= 543                     // 仏暦→西暦
  if (y < 100) y += 2000
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2020 || y > 2100) return null
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCMonth() !== m - 1) return null
  // 未来日付（翌日以降）は誤読の可能性が高いので採用しない
  if (dt.getTime() > Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) + 86_400_000) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function extractDate(rawText: string, today = new Date()): string | null {
  const t = normalizeDigits(rawText)
  let m: RegExpMatchArray | null
  // yyyy-mm-dd / yyyy/mm/dd
  if ((m = t.match(/(?<!\d)(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})(?!\d)/))) {
    const r = iso(+m[1], +m[2], +m[3], today); if (r) return r
  }
  // dd/mm/yyyy, dd-mm-yy（タイ・日本以外の欧州式＝日が先）
  const all = [...t.matchAll(/(?<!\d)(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4}|\d{2})(?!\d)/g)]
  for (const a of all) { const r = iso(+a[3], +a[2], +a[1], today); if (r) return r }
  // 12 Oct 2026 / Oct 12, 2026
  const en = new RegExp(`(\\d{1,2})\\s*(${MONTHS_EN.join('|')})[a-z]*\\.?,?\\s*(\\d{4})`, 'i')
  if ((m = t.match(en))) { const r = iso(+m[3], MONTHS_EN.indexOf(m[2].toLowerCase()) + 1, +m[1], today); if (r) return r }
  const en2 = new RegExp(`(${MONTHS_EN.join('|')})[a-z]*\\.?\\s*(\\d{1,2}),?\\s*(\\d{4})`, 'i')
  if ((m = t.match(en2))) { const r = iso(+m[3], MONTHS_EN.indexOf(m[1].toLowerCase()) + 1, +m[2], today); if (r) return r }
  // 12 ต.ค. 2569
  const th = new RegExp(`(\\d{1,2})\\s*(${MONTHS_TH.map(s => s.replace(/\./g, '\\.?')).join('|')})\\.?\\s*(\\d{2,4})`)
  if ((m = t.match(th))) {
    const idx = MONTHS_TH.findIndex(s => m![2].replace(/\./g, '') === s.replace(/\./g, ''))
    if (idx >= 0) { const r = iso(+m[3], idx + 1, +m[1], today); if (r) return r }
  }
  // 2026年10月12日
  if ((m = t.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/))) { const r = iso(+m[1], +m[2], +m[3], today); if (r) return r }
  return null
}

function extractVendor(lines: string[]): string | null {
  const marker = /(co\.?,?\s*ltd|company|limited|บริษัท|บจก|ร้าน|shop|mart|store|restaurant|cafe|coffee|hotel|โรงแรม|inc\b|株式会社)/i
  const head = lines.slice(0, 8)
  const hit = head.find(l => marker.test(l) && /[A-Za-zก-๙぀-ヿ一-鿿]/.test(l))
  const pick = hit ?? head.find(l => (l.match(/[A-Za-zก-๙぀-ヿ一-鿿]/g) || []).length >= 3 && !/^\d/.test(l))
  return pick ? pick.replace(/\s{2,}/g, ' ').slice(0, 40) : null
}

function extractReceiptNo(text: string): string | null {
  const t = normalizeDigits(text)
  const m = t.match(/(?:receipt|invoice|inv|bill|เลขที่|ใบเสร็จ|ใบกำกับภาษี|領収書?番号|no)\.?\s*(?:no\.?|number|#|:)?\s*[:#]?\s*((?=[A-Z0-9\-\/]*\d)[A-Z0-9][A-Z0-9\-\/]{3,24})/i)
  return m ? m[1] : null
}

function detectCurrency(text: string): ParsedReceipt['currency'] {
  if (/฿|บาท|\bthb\b|\bbaht\b/i.test(text)) return 'THB'
  if (/\bmyr\b|\bRM\s?\d/i.test(text)) return 'MYR'
  if (/\busd\b|US\$|\$\s?\d/i.test(text)) return 'USD'
  if (/\bjpy\b|円|¥|￥/i.test(text)) return 'JPY'
  return null
}

// ─── 費目候補（OCRは意味理解ができないためキーワード推定。必ず利用者が確認する） ───
const ITEM_RULES: [RegExp, string[]][] = [
  [/ปั๊ม|ปตท|ptt|shell|caltex|esso|bangchak|บางจาก|fuel|gasoline|diesel|เบนซิน|แก๊สโซฮอล์|ガソリン/i, ['C-02']],
  [/parking|จอดรถ|ที่จอด|toll|ทางด่วน|ทางหลวง|easy\s*pass|m-?pass|expressway|高速|駐車/i, ['C-03']],
  [/grab|bolt|taxi|แท็กซี่|แท็กซี|bts|mrt|รถไฟฟ้า|airport\s*rail|bus|รถเมล์|motorcycle|วิน|タクシー/i, ['C-06']],
  [/airasia|thai\s*airways|nok\s*air|thai\s*lion|vietjet|scoot|singapore\s*air|jal|ana\b|boarding|e-?ticket|สายการบิน|航空/i, ['C-04']],
  [/hotel|โรงแรม|resort|inn\b|accommodation|agoda|booking\.com|ホテル|宿泊/i, ['C-05']],
  [/avis|hertz|sixt|budget\s*rent|car\s*rental|rent\s*a\s*car|เช่ารถ|レンタカー/i, ['C-01']],
  [/ais|true\s*move|truemove|dtac|ทรู|เอไอเอส|ดีแทค|sim\b|ซิม|prepaid|topup|top-?up|mobile/i, ['F-01']],
  [/3bb|true\s*online|nt\s*broadband|tot\b|fiber|fibre|ไฟเบอร์|internet|อินเทอร์เน็ต|wifi/i, ['A-04']],
  [/การไฟฟ้า|pea\b|mea\b|electric|การประปา|waterworks|water\s*supply|ค่าไฟ|ค่าน้ำ|電気|水道/i, ['A-03']],
  [/google\s*workspace|gsuite|g\s*suite|google\s*cloud/i, ['F-04', 'F-03']],
  [/aws|amazon\s*web|azure|cloudflare|netlify|supabase|vercel|digitalocean|heroku|cloud/i, ['F-03', 'F-02']],
  [/microsoft|adobe|zoom|slack|notion|github|openai|anthropic|dropbox|canva|license|subscription|software|ซอฟต์แวร์/i, ['F-02', 'F-04']],
  [/ไปรษณีย์|thailand\s*post|kerry|flash\s*express|dhl|fedex|ups\b|ems\b|j&t|postage|courier|ส่งพัสดุ|郵便|宅配/i, ['F-10']],
  [/officemate|office\s*mate|b2s|index\s*living|stationery|เครื่องเขียน|กระดาษ|toner|หมึก|文具|事務用品/i, ['F-09']],
  [/ซ่อม|repair|service\s*center|maintenance|ซ่อมบำรุง/i, ['F-08', 'A-06']],
  [/notebook|laptop|macbook|ipad|monitor|keyboard|mouse|banana\s*it|jib\b|advice\b|ibood|computer|คอมพิวเตอร์|camera|กล้อง|lens/i, ['F-06', 'F-07', 'J-02']],
  [/visa|work\s*permit|immigration|ตรวจคนเข้าเมือง|วีซ่า|ใบอนุญาตทำงาน/i, ['E-01', 'E-02', 'E-03']],
  [/audit|ตรวจสอบบัญชี|accounting|bookkeep|ทำบัญชี|สำนักงานบัญชี|会計/i, ['D-01', 'E-06']],
  [/legal|law\s*firm|ทนาย|สำนักงานกฎหมาย|notar|น็อตตารี|法務/i, ['D-04', 'E-04']],
  [/translat|interpret|แปล|翻訳/i, ['D-05', 'E-04']],
  [/namecard|name\s*card|business\s*card|brochure|flyer|poster|print|พิมพ์|โรงพิมพ์|นามบัตร|名刺/i, ['G-05']],
  [/exhibition|expo\b|seminar|conference|trade\s*show|booth|งานแสดง|展示会/i, ['G-03']],
  [/facebook|meta\s*ads|google\s*ads|line\s*ads|tiktok|advertis|โฆษณา|広告/i, ['G-04']],
  [/swift|remittance|wire\s*transfer|international\s*transfer|โอนเงินต่างประเทศ|送金/i, ['H-03']],
  [/bank\s*fee|service\s*charge|ค่าธรรมเนียม|annual\s*fee|account\s*fee|手数料/i, ['H-01', 'H-02']],
  [/rent\b|ค่าเช่า|lease|common\s*fee|ค่าส่วนกลาง|家賃/i, ['A-01', 'A-02']],
  [/cleaning|แม่บ้าน|ทำความสะอาด|waste|ขยะ|清掃/i, ['A-05']],
  [/restaurant|ร้านอาหาร|cafe|coffee|starbucks|amazon\s*caf|ภัตตาคาร|food|bistro|bar\b|grill|sushi|izakaya|ramen|dining|เครื่องดื่ม|レストラン/i, ['G-02', 'C-07', 'G-01']],
  [/7-?eleven|เซเว่น|tops\b|big\s*c|lotus|makro|villa\s*market|family\s*mart|mart\b|supermarket|ซุปเปอร์/i, ['F-09', 'I-01', 'G-01']],
]

export function suggestItemCodes(text: string): string[] {
  const out: string[] = []
  for (const [re, codes] of ITEM_RULES) {
    if (re.test(text)) for (const c of codes) if (!out.includes(c)) out.push(c)
    if (out.length >= 4) break
  }
  return out
}

export function parseReceiptText(rawText: string, confidence: number, today = new Date()): ParsedReceipt {
  const text = normalizeDigits(rawText || '')
  const lines = text.split(/\r?\n/).map(l => l.replace(/[|_~`]+/g, ' ').replace(/\s+/g, ' ').trim()).filter(l => l.length > 0)
  const warnings: string[] = []
  const { amount, sure } = extractAmount(lines)
  const date = extractDate(text, today)
  const vendor = extractVendor(lines)
  const currency = detectCurrency(text)
  if (confidence < 60) warnings.push('読み取り精度が低い画像です。内容を必ず確認・修正してください。')
  if (amount == null) warnings.push('金額を読み取れませんでした。手入力してください。')
  else if (!sure) warnings.push('合計金額の行を特定できず、最大の金額を採用しました。金額を確認してください。')
  if (!date) warnings.push('日付を読み取れませんでした。手入力してください。')
  return {
    vendor, amount, currency, date, receiptNo: extractReceiptNo(text),
    itemCodes: suggestItemCodes(text), confidence, warnings, rawText,
  }
}

/** 取引先名の正規化（学習用キー） */
export function vendorKey(v: string | null | undefined): string {
  return (v ?? '').toLowerCase().replace(/[\s.,\-_()（）]/g, '').slice(0, 30)
}
