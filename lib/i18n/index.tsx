'use client'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { EN } from './dict.en'
import { TH } from './dict.th'
import { ITEM_NAMES, CATEGORY_NAMES } from './items'

export type Lang = 'ja' | 'en' | 'th'
export const LANGS: { code: Lang; label: string }[] = [
  { code: 'ja', label: '日本語' }, { code: 'en', label: 'English' }, { code: 'th', label: 'ไทย' },
]
const KEY = 'app_lang'
type Vars = Record<string, string | number>

interface Ctx {
  lang: Lang
  setLang: (l: Lang) => void
  /** 日本語の原文をキーに、選択言語へ翻訳。{name} 形式で値を差し込める */
  t: (ja: string, vars?: Vars) => string
  /** 費目名（コードで引く。無ければ元の名前） */
  itemName: (code: string | null | undefined, fallback?: string) => string
  /** 大分類名 */
  catName: (code: string | null | undefined, fallback?: string) => string
  locale: string
}

const BUDGET_TYPES: Record<string, [string, string]> = {
  '運営費': ['Operating expenses', 'ค่าใช้จ่ายดำเนินงาน'], '預託金': ['Deposit', 'เงินมัดจำ'],
  '資産': ['Asset', 'สินทรัพย์'], '資金移動': ['Fund transfer', 'การโอนเงิน'],
}

const I18nCtx = createContext<Ctx>({ lang: 'ja', setLang: () => {}, t: s => s, itemName: (_c, f) => f ?? '', catName: (_c, f) => f ?? '', locale: 'ja-JP' })

function fill(s: string, vars?: Vars) {
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s
}

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('ja')
  useEffect(() => {
    try { const v = localStorage.getItem(KEY); if (v === 'en' || v === 'th' || v === 'ja') setLangState(v) } catch { /* 無視 */ }
  }, [])
  useEffect(() => { document.documentElement.lang = lang }, [lang])
  const setLang = useCallback((l: Lang) => { setLangState(l); try { localStorage.setItem(KEY, l) } catch { /* 無視 */ } }, [])
  const value = useMemo<Ctx>(() => {
    const dict = lang === 'en' ? EN : lang === 'th' ? TH : null
    const idx = lang === 'en' ? 0 : 1
    return {
      lang, setLang,
      t: (ja, vars) => fill((dict && dict[ja]) || ja, vars),
      itemName: (code, fallback = '') => (lang !== 'ja' && code && ITEM_NAMES[code]) ? ITEM_NAMES[code][idx] : fallback,
      catName: (code, fallback = '') => (lang !== 'ja' && code && CATEGORY_NAMES[code]) ? CATEGORY_NAMES[code][idx] : fallback,
      locale: lang === 'ja' ? 'ja-JP' : lang === 'en' ? 'en-GB' : 'th-TH-u-ca-gregory',
    }
  }, [lang, setLang])
  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>
}

export const useI18n = () => useContext(I18nCtx)

/** 予算区分(運営費/預託金/資産/資金移動)の表示名 */
export function budgetTypeLabel(lang: Lang, v: string) {
  if (lang === 'ja') return v
  return BUDGET_TYPES[v]?.[lang === 'en' ? 0 : 1] ?? v
}

export function LangSwitcher({ className = '' }: { className?: string }) {
  const { lang, setLang } = useI18n()
  return (
    <select value={lang} onChange={e => setLang(e.target.value as Lang)} aria-label="Language / ภาษา / 言語"
      className={`h-8 rounded-md border border-input bg-white px-2 text-sm text-slate-900 ${className}`}>
      {LANGS.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
    </select>
  )
}
