import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const year: number = body.year
  const month: number = body.month
  const activities: any[] = body.activities ?? []
  const expenses: any[] = body.expenses ?? []
  const budgets: any[] = body.budgets ?? []

  const byType: Record<string,number> = {}
  for (const a of activities) byType[a.activity_type] = (byType[a.activity_type]??0)+1
  const companies = [...new Set(activities.filter(a=>a.company_name).map(a=>a.company_name))] as string[]
  const totalJpy = expenses.reduce((s,e)=>s+e.amount_jpy,0)
  const totalThb = expenses.reduce((s,e)=>s+e.amount_thb,0)
  const byCat: Record<string,{thb:number;jpy:number}> = {}
  for (const e of expenses) {
    if (!byCat[e.category]) byCat[e.category]={thb:0,jpy:0}
    byCat[e.category].thb+=e.amount_thb; byCat[e.category].jpy+=e.amount_jpy
  }

  const prompt = `あなたは日系企業のタイ駐在員事務所担当者です。${year}年${month}月の月次報告書を作成してください。

【形式】日本企業本社向け、簡潔で要点を押さえた月次報告書。

【出力構成】
① 活動サマリー（今月の概要を3〜4行）
② 訪問企業一覧（箇条書き）
③ 活動件数集計（種別ごとの件数）
④ 経費実績（カテゴリ別集計）
⑤ 予算差異（大きく乖離した項目をコメント）
⑥ 翌月活動予定
⑦ 総括・特記事項（2〜3行）

【活動データ（${activities.length}件）】
種別: ${Object.entries(byType).map(([k,v])=>`${k}:${v}件`).join(' / ')}
接触企業: ${companies.length}社 / 出張: ${activities.filter(a=>a.is_business_trip).length}日
訪問先: ${companies.slice(0,15).join('、')}
詳細:
${activities.slice(0,20).map(a=>`[${a.activity_date}] ${a.activity_type} ${a.company_name??'—'} ${(a.content??'').slice(0,40)}`).join('\n')}

【経費（${Math.round(totalThb).toLocaleString()}THB / ${Math.round(totalJpy).toLocaleString()}円）】
${Object.entries(byCat).map(([k,v])=>`${k}: ฿${Math.round(v.thb).toLocaleString()}（¥${Math.round(v.jpy).toLocaleString()}）`).join('\n')}

【予算対比】
${budgets.filter(b=>b.month===month).map(b=>{
  const a=byCat[b.category]??{jpy:0}
  const diff=a.jpy-b.amount_jpy
  return `${b.category}: 予算¥${Math.round(b.amount_jpy).toLocaleString()} / 実績¥${Math.round(a.jpy).toLocaleString()} / ${diff>=0?'+':''}¥${Math.round(diff).toLocaleString()}`
}).join('\n')}`

  const apiKey = process.env.ANTHROPIC_API_KEY
  let draft = ''

  if (apiKey && apiKey !== 'placeholder') {
    const anthropic = new Anthropic({ apiKey })
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6', max_tokens: 2000,
      messages: [{ role:'user', content:prompt }],
    })
    draft = message.content.filter(b=>b.type==='text').map(b=>(b as {type:'text';text:string}).text).join('')
  } else {
    draft = `${year}年${month}月 タイ駐在員事務所 月次報告書\n${'='.repeat(40)}\n\n① 活動サマリー\n${month}月は${activities.length}件の活動を実施、${companies.length}社との商談・情報交換を行いました。\n\n② 訪問企業一覧\n${companies.map(c=>`・${c}`).join('\n')||'・（記録なし）'}\n\n③ 活動件数集計\n${Object.entries(byType).map(([k,v])=>`・${k}: ${v}件`).join('\n')||'・（記録なし）'}\n\n④ 経費実績\n合計: ฿${Math.round(totalThb).toLocaleString()}（¥${Math.round(totalJpy).toLocaleString()}）\n${Object.entries(byCat).map(([k,v])=>`・${k}: ฿${Math.round(v.thb).toLocaleString()}（¥${Math.round(v.jpy).toLocaleString()}）`).join('\n')||'・（記録なし）'}\n\n⑤ 予算差異\n各カテゴリ概ね計画内で推移しました。\n\n⑥ 翌月活動予定\n継続的な顧客フォローと新規開拓活動を予定しています。\n\n⑦ 総括・特記事項\n引き続き現地での情報収集と関係構築に注力します。\n\n※ ANTHROPIC_API_KEY を Netlify の環境変数に設定するとAIが詳細な報告書を生成します。`
  }

  const { data: existing } = await supabase.from('monthly_reports').select('id,status').eq('year',year).eq('month',month).single()
  if (existing?.status === 'finalized') return NextResponse.json({ error:'確定済みのレポートは再生成できません' }, { status:400 })

  const reportData = { year, month, ai_draft:draft, final_text:draft, status:'draft', generated_at:new Date().toISOString() }
  if (existing) { await supabase.from('monthly_reports').update(reportData).eq('id',(existing as any).id) }
  else { await supabase.from('monthly_reports').insert(reportData) }

  return NextResponse.json({ draft })
}
