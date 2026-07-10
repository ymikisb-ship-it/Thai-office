export type UserRole = 'sales' | 'admin'
export type ExpenseCategory = '給与'|'家賃'|'通信費'|'交通費'|'接待交際費'|'出張費'|'備品'|'その他'
export type PaymentMethod = '現金'|'法人カード'|'個人立替'
export type ActivityType = '訪問'|'WEB会議'|'出張'|'電話'|'その他'
export type ReportStatus = 'draft'|'reviewing'|'finalized'

export interface AppUser { id:string; name:string; role:UserRole; email:string; created_at:string }
export interface Expense {
  id:string; user_id:string; expense_date:string; category:ExpenseCategory
  amount_thb:number; amount_jpy:number; exchange_rate:number
  payment_method:PaymentMethod; memo:string|null; receipt_url:string|null
  ocr_raw:Record<string,unknown>|null; created_at:string
  users?:{name:string}
}
export interface Activity {
  id:string; user_id:string; activity_date:string; activity_type:ActivityType
  company_name:string|null; contact_person:string|null; content:string|null
  outcome:string|null; is_business_trip:boolean; created_at:string
  users?:{name:string}
}
export interface Budget {
  id:string; fiscal_year:number; month:number; category:string
  amount_thb:number; amount_jpy:number; updated_at:string
}
export interface BudgetLineItem {
  id:string; category:ExpenseCategory; label:string; sort_order:number; created_at:string
}
export interface BudgetLineAmount {
  id:string; fiscal_year:number; month:number; line_item_id:string
  amount_thb:number; updated_at:string
}
export interface MonthlyReport {
  id:string; year:number; month:number; ai_draft:string|null
  final_text:string|null; status:ReportStatus
  generated_at:string|null; finalized_at:string|null
}
