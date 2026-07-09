-- ============================================================
-- タイ駐在員事務所 運営管理システム
-- Supabase / PostgreSQL マイグレーション v1
-- ============================================================

-- ユーザー拡張プロフィール（Supabase Authと連携）
create table public.users (
  id        uuid primary key references auth.users(id) on delete cascade,
  name      varchar(100) not null,
  role      varchar(20)  not null check (role in ('sales', 'admin')),
  email     varchar(255) not null unique,
  created_at timestamptz default now()
);

-- 経費テーブル
create table public.expenses (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users(id),
  expense_date    date not null,
  category        varchar(50) not null check (
    category in ('給与','家賃','通信費','交通費','接待交際費','出張費','備品','その他')
  ),
  amount_thb      numeric(12,2) not null check (amount_thb >= 0),
  amount_jpy      numeric(12,2) not null check (amount_jpy >= 0),
  exchange_rate   numeric(8,4) not null,          -- 入力時レートをスナップショット保存
  payment_method  varchar(20) not null check (
    payment_method in ('現金','法人カード','個人立替')
  ),
  memo            text,
  receipt_url     text,                            -- Supabase Storage URL
  ocr_raw         jsonb,                           -- OCR生データ（監査用）
  created_at      timestamptz default now()
);

-- 活動テーブル
create table public.activities (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users(id),
  activity_date   date not null,
  activity_type   varchar(30) not null check (
    activity_type in ('訪問','WEB会議','出張','電話','その他')
  ),
  company_name    varchar(200),
  contact_person  varchar(100),
  content         text,
  outcome         text,
  duration_min    int check (duration_min > 0),
  is_business_trip boolean default false,
  created_at      timestamptz default now()
);

-- 予算テーブル（month=0 で年間合計を表現）
create table public.budgets (
  id            uuid primary key default gen_random_uuid(),
  fiscal_year   int not null,
  month         int not null check (month between 0 and 12),  -- 0=年間
  category      varchar(50) not null check (
    category in ('給与','家賃','通信費','交通費','接待交際費','出張費','備品','その他','合計')
  ),
  amount_thb    numeric(12,2) not null default 0,
  amount_jpy    numeric(12,2) not null default 0,
  updated_by    uuid references public.users(id),
  updated_at    timestamptz default now(),
  unique (fiscal_year, month, category)
);

-- 翌月活動予定テーブル
create table public.monthly_plans (
  id                  uuid primary key default gen_random_uuid(),
  year                int not null,
  month               int not null check (month between 1 and 12),
  planned_activities  text,
  target_visits       int default 0,
  target_meetings     int default 0,
  notes               text,
  created_by          uuid references public.users(id),
  created_at          timestamptz default now(),
  unique (year, month)
);

-- 月次レポートテーブル
create table public.monthly_reports (
  id            uuid primary key default gen_random_uuid(),
  year          int not null,
  month         int not null check (month between 1 and 12),
  ai_draft      text,                              -- AI生成草稿
  final_text    text,                              -- 最終確定テキスト
  status        varchar(20) not null default 'draft' check (
    status in ('draft','reviewing','finalized')
  ),
  generated_at  timestamptz,
  finalized_at  timestamptz,
  finalized_by  uuid references public.users(id),
  unique (year, month)
);

-- ============================================================
-- インデックス
-- ============================================================
create index idx_expenses_date       on public.expenses(expense_date);
create index idx_expenses_category   on public.expenses(category);
create index idx_expenses_user       on public.expenses(user_id);
create index idx_activities_date     on public.activities(activity_date);
create index idx_activities_type     on public.activities(activity_type);
create index idx_activities_user     on public.activities(user_id);
create index idx_budgets_year_month  on public.budgets(fiscal_year, month);

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================
alter table public.users           enable row level security;
alter table public.expenses        enable row level security;
alter table public.activities      enable row level security;
alter table public.budgets         enable row level security;
alter table public.monthly_plans   enable row level security;
alter table public.monthly_reports enable row level security;

-- users: 全員が全レコードを閲覧可能、自分のレコードのみ編集可能
create policy "全員閲覧可" on public.users for select using (true);
create policy "自分のみ更新" on public.users for update using (auth.uid() = id);

-- expenses: 全員閲覧可、自分のレコードのみ挿入・更新・削除可能
create policy "全員閲覧可" on public.expenses for select using (true);
create policy "自分のみ挿入" on public.expenses for insert with check (auth.uid() = user_id);
create policy "自分のみ更新" on public.expenses for update using (auth.uid() = user_id);
create policy "自分のみ削除" on public.expenses for delete using (auth.uid() = user_id);

-- activities: 同上
create policy "全員閲覧可" on public.activities for select using (true);
create policy "自分のみ挿入" on public.activities for insert with check (auth.uid() = user_id);
create policy "自分のみ更新" on public.activities for update using (auth.uid() = user_id);
create policy "自分のみ削除" on public.activities for delete using (auth.uid() = user_id);

-- budgets・plans・reports: 全員閲覧・全員挿入・更新可（2名のみの小規模運用）
create policy "全員閲覧可" on public.budgets         for select using (true);
create policy "全員操作可" on public.budgets         for all    using (auth.role() = 'authenticated');
create policy "全員閲覧可" on public.monthly_plans   for select using (true);
create policy "全員操作可" on public.monthly_plans   for all    using (auth.role() = 'authenticated');
create policy "全員閲覧可" on public.monthly_reports for select using (true);
create policy "全員操作可" on public.monthly_reports for all    using (auth.role() = 'authenticated');

-- ============================================================
-- 月次集計ビュー（ダッシュボード用）
-- ============================================================
create or replace view public.monthly_expense_summary as
select
  date_trunc('month', expense_date)::date as month,
  category,
  sum(amount_thb) as total_thb,
  sum(amount_jpy) as total_jpy,
  count(*) as count
from public.expenses
group by 1, 2;

create or replace view public.monthly_activity_summary as
select
  date_trunc('month', activity_date)::date as month,
  activity_type,
  count(*) as count,
  count(distinct company_name) as unique_companies,
  sum(case when is_business_trip then 1 else 0 end) as trip_days
from public.activities
group by 1, 2;
