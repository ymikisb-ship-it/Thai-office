'use client'
// 領収書ファイル（紙の撮影画像・電子領収書の画像/PDF）からテキストを取り出す。
// すべてブラウザ内で処理（外部APIキー不要）。画像→Tesseract.js、PDF→埋込テキスト優先・無ければ画像化してOCR。
import type { Worker as TesseractWorker } from 'tesseract.js'

export interface ExtractResult {
  text: string
  confidence: number            // 0-100
  method: 'ocr' | 'pdf-text' | 'pdf-ocr'
  pages: number
}

export type ProgressFn = (message: string) => void

let _worker: Promise<TesseractWorker> | null = null
function getWorker(): Promise<TesseractWorker> {
  if (!_worker) {
    _worker = import('tesseract.js')
      .then(m => m.createWorker(['tha', 'eng']))
      .catch(e => { _worker = null; throw e })
  }
  return _worker
}

export function isPdf(file: Blob & { name?: string }): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name ?? '')
}

async function loadBitmap(file: Blob): Promise<{ source: CanvasImageSource; w: number; h: number; close?: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return { source: bmp, w: bmp.width, h: bmp.height, close: () => bmp.close() }
    } catch { /* フォールバックへ */ }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('画像を読み込めません')); i.src = url
    })
    return { source: img, w: img.naturalWidth, h: img.naturalHeight }
  } finally { URL.revokeObjectURL(url) }
}

/** 画像をOCRに適したサイズ・コントラストのcanvasにする */
export async function imageToCanvas(file: Blob, opts: { maxSide?: number; enhance?: boolean } = {}): Promise<HTMLCanvasElement> {
  const maxSide = opts.maxSide ?? 2200
  const bm = await loadBitmap(file)
  const longest = Math.max(bm.w, bm.h)
  let scale = longest > maxSide ? maxSide / longest : 1
  if (longest < 1200) scale = Math.min(2, 1600 / longest)   // 小さい画像は拡大して認識率を上げる
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bm.w * scale)); canvas.height = Math.max(1, Math.round(bm.h * scale))
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bm.source, 0, 0, canvas.width, canvas.height)
  bm.close?.()
  if (opts.enhance !== false) enhanceContrast(ctx, canvas.width, canvas.height)
  return canvas
}

/** グレースケール化＋ヒストグラム伸張（影・薄いレシート対策） */
function enhanceContrast(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const img = ctx.getImageData(0, 0, w, h)
  const d = img.data
  const hist = new Uint32Array(256)
  for (let i = 0; i < d.length; i += 4) {
    const g = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000 | 0
    d[i] = d[i + 1] = d[i + 2] = g
    hist[g]++
  }
  const total = w * h
  let acc = 0, lo = 0, hi = 255
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= total * 0.01) { lo = v; break } }
  acc = 0
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= total * 0.01) { hi = v; break } }
  if (hi - lo < 30) { ctx.putImageData(img, 0, 0); return }
  const k = 255 / (hi - lo)
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.max(0, Math.min(255, (d[i] - lo) * k))
    d[i] = d[i + 1] = d[i + 2] = v
  }
  ctx.putImageData(img, 0, 0)
}

async function ocrCanvas(canvas: HTMLCanvasElement): Promise<{ text: string; confidence: number }> {
  const worker = await getWorker()
  const { data } = await worker.recognize(canvas)
  return { text: data.text ?? '', confidence: data.confidence ?? 0 }
}

/** 保存用に画像を縮小・JPEG化（PDFはそのまま）。月1〜2回のExcel出力＋削除運用なので容量を抑える */
export async function compressForUpload(file: File): Promise<{ blob: Blob; ext: string; contentType: string }> {
  if (isPdf(file)) return { blob: file, ext: 'pdf', contentType: 'application/pdf' }
  try {
    const canvas = await imageToCanvas(file, { maxSide: 1800, enhance: false })
    const blob: Blob | null = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.82))
    if (blob && blob.size > 0) return { blob, ext: 'jpg', contentType: 'image/jpeg' }
  } catch { /* 元ファイルをそのまま保存 */ }
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'jpg'
  return { blob: file, ext, contentType: file.type || 'application/octet-stream' }
}

async function extractPdf(file: File, onProgress?: ProgressFn): Promise<ExtractResult> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString()
  const data = new Uint8Array(await file.arrayBuffer())
  const pdf = await pdfjs.getDocument({ data }).promise
  const pages = Math.min(pdf.numPages, 3)
  // 1) 埋込テキスト（電子領収書の多くはこちらで正確に取れる）
  let text = ''
  for (let p = 1; p <= pages; p++) {
    const page = await pdf.getPage(p)
    const content = await page.getTextContent()
    let line = ''
    for (const it of content.items as { str?: string; hasEOL?: boolean }[]) {
      if (typeof it.str !== 'string') continue
      line += it.str + (it.hasEOL ? '\n' : ' ')
    }
    text += line + '\n'
  }
  if (text.replace(/\s/g, '').length >= 40 && /\d/.test(text)) {
    return { text, confidence: 100, method: 'pdf-text', pages: pdf.numPages }
  }
  // 2) 画像化してOCR（スキャンPDF）
  let all = ''; let confSum = 0
  for (let p = 1; p <= pages; p++) {
    onProgress?.(`PDFを画像化して解析中 (${p}/${pages})`)
    const page = await pdf.getPage(p)
    const viewport = page.getViewport({ scale: 2.2 })
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(viewport.width); canvas.height = Math.round(viewport.height)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvasContext: ctx, viewport, canvas }).promise
    enhanceContrast(ctx, canvas.width, canvas.height)
    const r = await ocrCanvas(canvas)
    all += r.text + '\n'; confSum += r.confidence
  }
  return { text: all, confidence: confSum / pages, method: 'pdf-ocr', pages: pdf.numPages }
}

export async function extractReceipt(file: File, onProgress?: ProgressFn): Promise<ExtractResult> {
  if (isPdf(file)) {
    onProgress?.('PDFを読み込み中')
    return extractPdf(file, onProgress)
  }
  onProgress?.('画像を解析中（初回は読み取りエンジンの読み込みに時間がかかります）')
  const canvas = await imageToCanvas(file)
  const r = await ocrCanvas(canvas)
  return { text: r.text, confidence: r.confidence, method: 'ocr', pages: 1 }
}
