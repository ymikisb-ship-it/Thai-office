-- 002: 費目マスタ(Excel v3と同一のA-J・75費目)、経費明細の拡張、予算(月別)、月次出力記録
create table public.cost_items (
  code          text primary key,
  category_code char(1) not null check (category_code between 'A' and 'J'),
  category_name text not null,
  name          text not null unique,
  cost_type     text not null check (cost_type in ('継続','一時','年次','不定期')),
  budget_type   text not null default '運営費' check (budget_type in ('運営費','資産','預託金','資金移動')),
  init_status   text not null default 'new',
  note          text,
  sort_order    int  not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz default now()
);
alter table public.cost_items enable row level security;
create policy "全員閲覧可" on public.cost_items for select using (true);
create policy "ログイン済み操作可" on public.cost_items for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

insert into public.cost_items (code,category_code,category_name,name,cost_type,budget_type,init_status,note,sort_order) values
('A-01','A','事務所関連費','家賃','継続','運営費','existing','既存予算表 行7',1),
('A-02','A','事務所関連費','管理費','継続','運営費','existing','既存予算表 行8',2),
('A-03','A','事務所関連費','電気代・水道代','継続','運営費','existing','既存予算表 行9「電気代」（水道代の記載なし）',3),
('A-04','A','事務所関連費','インターネット・事務所通信費','継続','運営費','existing','既存予算表 行10',4),
('A-05','A','事務所関連費','清掃費・廃棄物処理費','継続','運営費','new','',5),
('A-06','A','事務所関連費','設備・空調修理費','不定期','運営費','new','',6),
('A-07','A','事務所関連費','事務所保険料','年次','運営費','new','',7),
('A-08','A','事務所関連費','その他の事務所維持費','不定期','運営費','new','',8),
('B-01','B','人件費・福利厚生費','駐在員給与','継続','運営費','existing','既存予算表 行13',9),
('B-02','B','人件費・福利厚生費','現地スタッフ給与','継続','運営費','existing','既存予算表 行14',10),
('B-03','B','人件費・福利厚生費','住宅手当・通勤手当・食事手当等','継続','運営費','new','既存の給与額に手当が含まれるか要確認。二重計上に注意',11),
('B-04','B','人件費・福利厚生費','残業代・休日勤務手当','不定期','運営費','new','',12),
('B-05','B','人件費・福利厚生費','賞与・インセンティブ','年次','運営費','new','',13),
('B-06','B','人件費・福利厚生費','会社負担社会保険料','継続','運営費','existing','既存予算表 行15（SSO会社負担）。上限750THB/人の扱いは数式に未反映→要確認',14),
('B-07','B','人件費・福利厚生費','健康診断費','年次','運営費','new','',15),
('B-08','B','人件費・福利厚生費','民間医療保険・傷害保険料','継続','運営費','new','前提条件シートC35「海外傷害保険（駐在員）3,000 THB/月」の記載あり・予算表未計上（計上漏れ候補）',16),
('B-09','B','人件費・福利厚生費','採用費・求人広告費','一時','運営費','new','',17),
('B-10','B','人件費・福利厚生費','研修費・教育費','不定期','運営費','new','',18),
('B-11','B','人件費・福利厚生費','その他の人件費・福利厚生費','不定期','運営費','new','',19),
('B-90','B','人件費・福利厚生費','所得税源泉徴収（PND1）（既存項目）','継続','運営費','existing','既存予算表 行16。従業員負担の預り金（納付管理）か会社負担かが未確定→分類要確認',20),
('C-01','C','旅費交通費','レンタカー代','継続','運営費','existing','既存予算表 行20',21),
('C-02','C','旅費交通費','ガソリン代','継続','運営費','existing','既存予算表 行21「交通費（ガソリン）」',22),
('C-03','C','旅費交通費','高速道路料金・駐車料金','不定期','運営費','new','',23),
('C-04','C','旅費交通費','航空運賃','継続','運営費','existing','既存予算表 行22（マレーシア⇔タイ）',24),
('C-05','C','旅費交通費','宿泊費','継続','運営費','existing','既存予算表 行23',25),
('C-06','C','旅費交通費','タクシー・公共交通機関利用料','継続','運営費','existing','既存予算表 行24「国内交通費（Grab他）」',26),
('C-07','C','旅費交通費','出張時の日当・食事代','不定期','運営費','new','',27),
('C-08','C','旅費交通費','顧客訪問時の交通費','不定期','運営費','new','C-06（国内交通費）との重複計上に注意',28),
('C-09','C','旅費交通費','その他の旅費交通費','不定期','運営費','new','',29),
('D-01','D','業務委託・専門家費用','会計・記帳代行費','継続','運営費','new','前提条件シートC18「5,000 THB/月」の記載あり・予算表未計上（計上漏れ候補）',30),
('D-02','D','業務委託・専門家費用','税務顧問料','継続','運営費','new','前提条件シートC19「3,000 THB/月」の記載あり・予算表未計上（計上漏れ候補）',31),
('D-03','D','業務委託・専門家費用','給与計算委託費','継続','運営費','existing','既存予算表 行32「給与セットアップ、支払代行（短期のみ）」※既存行は一時費用',32),
('D-04','D','業務委託・専門家費用','法務顧問料・契約書レビュー費','継続','運営費','new','前提条件シートC20「3,000 THB/月」の記載あり・予算表未計上（計上漏れ候補）。既存行31「就業規則サポート」の移管候補',33),
('D-05','D','業務委託・専門家費用','翻訳・通訳費','継続','運営費','new','前提条件シートC22「5,000 THB/月」の記載あり・予算表未計上（計上漏れ候補）',34),
('D-06','D','業務委託・専門家費用','外部業務委託費','不定期','運営費','existing','既存予算表 行27,28,29,31,33を暫定紐付け（分類要確認）。移管候補：行27-29→E（法定・行政手続）、行31→D-04、行33→H-05',35),
('D-07','D','業務委託・専門家費用','その他の専門家費用','不定期','運営費','new','',36),
('E-01','E','法定費用・行政手続費','VISA申請・更新費','年次','運営費','new','前提条件シートC25 VISA申請2,000 THB、C28 VISA更新5,000 THB/年の記載あり・予算表未計上（計上漏れ候補）',37),
('E-02','E','法定費用・行政手続費','Work Permit申請・更新費','年次','運営費','new','前提条件シートC26 WP申請2,000 THB、C27 WP更新20,000 THB/年の記載あり・予算表未計上（計上漏れ候補）',38),
('E-03','E','法定費用・行政手続費','政府申請手数料','一時','運営費','new','前提条件シートC23「ROL申請費 12,500 THB（中間値）」の記載あり・予算表未計上（計上漏れ候補）',39),
('E-04','E','法定費用・行政手続費','書類翻訳・公証・認証費','一時','運営費','new','前提条件シートC24「112,500 THB（中間値）」の記載あり・予算表未計上（計上漏れ候補）',40),
('E-05','E','法定費用・行政手続費','年次活動報告書の作成・提出費用','年次','運営費','new','前提条件シートC29「50,000 THB/年」、予算表注記⑥に記載あるが予算表に行なし（計上漏れ候補）',41),
('E-06','E','法定費用・行政手続費','年次会計監査費','年次','運営費','new','前提条件シートC21「150,000 THB/年（÷12按分）」の記載あり・予算表未計上（計上漏れ候補）',42),
('E-07','E','法定費用・行政手続費','その他の法定手続費用','不定期','運営費','new','',43),
('E-90','E','法定費用・行政手続費','VISA・Work Permit申請費（既存・合算項目）','一時','運営費','existing','既存予算表 行30（VISAとWPが合算）。E-01/E-02へ按分できないため既存項目として登録→分類要確認。振替える場合は二重計上に注意',44),
('F-01','F','IT・通信・備品費','携帯電話料金','継続','運営費','existing','既存予算表 行19「通信費（携帯・SIM）」',45),
('F-02','F','IT・通信・備品費','ソフトウェア利用料','継続','運営費','new','',46),
('F-03','F','IT・通信・備品費','クラウドサービス利用料','継続','運営費','new','',47),
('F-04','F','IT・通信・備品費','Google Workspace等の業務サービス利用料','継続','運営費','new','',48),
('F-05','F','IT・通信・備品費','AI検査ソフト・開発ツール利用料','継続','運営費','new','',49),
('F-06','F','IT・通信・備品費','PC・OA機器購入費','一時','運営費','existing','既存予算表 行36「PC・OA機器・初期備品」。運営費か固定資産かは会計処理要確認（J-02参照）。初期備品を含む合算行',50),
('F-07','F','IT・通信・備品費','カメラ・周辺機器購入費','一時','運営費','new','会計処理要確認（運営費か固定資産か）。J-02との重複計上に注意',51),
('F-08','F','IT・通信・備品費','PC・OA機器の修理・保守費','不定期','運営費','new','',52),
('F-09','F','IT・通信・備品費','事務用品・消耗品費','継続','運営費','existing','既存予算表 行37',53),
('F-10','F','IT・通信・備品費','郵便・宅配・国際配送費','不定期','運営費','new','',54),
('F-11','F','IT・通信・備品費','その他のIT・備品費','不定期','運営費','new','',55),
('G-01','G','営業・販促費','接待交際費','継続','運営費','existing','既存予算表 行38（備考「展示会、イベント参加費」→G-03との区分を要確認）',56),
('G-02','G','営業・販促費','顧客との会食費','不定期','運営費','new','G-01（接待交際費）との重複登録に注意',57),
('G-03','G','営業・販促費','展示会・セミナー参加費','不定期','運営費','new','既存行38/39の備考に展示会の記載あり・移管候補',58),
('G-04','G','営業・販促費','広告宣伝費','継続','運営費','existing','既存予算表 行39「広告宣伝費（SNS・展示会）」',59),
('G-05','G','営業・販促費','営業資料・名刺・販促物制作費','一時','運営費','new','前提条件シートC31「名刺・販促資料 5,000 THB（設立時一括）」の記載あり・予算表未計上（計上漏れ候補）',60),
('G-06','G','営業・販促費','その他の営業・販促費','不定期','運営費','new','',61),
('H-01','H','銀行・金融費用','銀行口座維持手数料','継続','運営費','new','',62),
('H-02','H','銀行・金融費用','国内振込手数料','不定期','運営費','new','',63),
('H-03','H','銀行・金融費用','国際送金手数料','不定期','運営費','new','',64),
('H-04','H','銀行・金融費用','為替差損益（管理用）','不定期','運営費','new','',65),
('H-05','H','銀行・金融費用','その他の銀行・金融費用','不定期','運営費','new','前提条件シートC36「銀行手数料・為替費用 1,000 THB/月」の記載あり・予算表未計上（H-01〜H-03のどれに当たるか未確定）',66),
('I-01','I','その他経費','雑費','不定期','運営費','new','',67),
('I-02','I','その他経費','予備費','不定期','運営費','new','',68),
('I-03','I','その他経費','上記分類に該当しない運営費','不定期','運営費','new','取引が増えた場合は適切な費目へ振替えること',69),
('I-90','I','その他経費','雑費・予備費（既存・合算項目）','継続','運営費','existing','既存予算表 行40（備考「突発的費用の予備枠（5%）」）。I-01/I-02に按分できないため既存項目として登録→分類要確認',70),
('J-01','J','資産・敷金・保証金（通常の運営費とは別管理）','賃貸物件の敷金・保証金','一時','預託金','existing','既存予算表 行6「デポジット（敷金）」D6=24,000 THB（月別配賦なし・7/14 CEO送金済）。運営費合計から除外',71),
('J-02','J','資産・敷金・保証金（通常の運営費とは別管理）','PC・カメラ等の固定資産取得','一時','資産','new','会計処理要確認。F-06/F-07との重複計上に注意',72),
('J-03','J','資産・敷金・保証金（通常の運営費とは別管理）','その他の資産取得','一時','資産','new','',73),
('J-04','J','資産・敷金・保証金（通常の運営費とは別管理）','本社からの資金送金','不定期','資金移動','new','',74),
('J-05','J','資産・敷金・保証金（通常の運営費とは別管理）','資本金・資金移動等の管理項目','不定期','資金移動','existing','既存予算表 行44,45（資本金 初年度25%／残額75%）',75);

-- 経費明細の拡張（既存データは0件のため旧8分類の変換は不要）
do $$
declare r record;
begin
  for r in select conname from pg_constraint where conrelid='public.expenses'::regclass and contype='c'
           and (pg_get_constraintdef(oid) like '%category%' or pg_get_constraintdef(oid) like '%payment_method%')
  loop execute format('alter table public.expenses drop constraint %I', r.conname); end loop;
end $$;
alter table public.expenses add constraint expenses_payment_method_check check (payment_method in ('現金','法人カード','個人立替','銀行振込','その他'));
alter table public.expenses
  add column item_code      text references public.cost_items(code),
  add column currency       varchar(3) not null default 'THB',
  add column foreign_amount numeric(14,2),
  add column fx_rate        numeric(12,6),
  add column vendor         text,
  add column description    text,
  add column payment_date   date,
  add column payment_status varchar(10) not null default '支払済' check (payment_status in ('未払','支払済','精算待ち','一部支払')),
  add column has_receipt    boolean not null default false,
  add column receipt_no     text,
  add column advanced_by    text,
  add column receipt_path   text;
create index idx_expenses_item on public.expenses(item_code);

-- 予算（費目×月。行が無い＝予算未設定、0＝0円で設定）
create table public.budget_amounts (
  item_code  text not null references public.cost_items(code) on delete cascade,
  month      date not null check (extract(day from month) = 1),
  amount_thb numeric(14,2) not null check (amount_thb >= 0),
  updated_at timestamptz default now(),
  primary key (item_code, month)
);
alter table public.budget_amounts enable row level security;
create policy "全員閲覧可" on public.budget_amounts for select using (true);
create policy "ログイン済み操作可" on public.budget_amounts for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop table if exists public.budget_line_amounts;
drop table if exists public.budget_line_items;

-- 月次Excel出力の記録（出力済みの月だけアプリ内データを削除できる）
create table public.month_exports (
  ym              char(7) primary key,
  exported_at     timestamptz not null default now(),
  exported_by     uuid references public.users(id),
  row_count       int not null,
  total_thb       numeric(14,2) not null,
  data_deleted_at timestamptz,
  checksum        text
);
alter table public.month_exports enable row level security;
create policy "全員閲覧可" on public.month_exports for select using (true);
create policy "ログイン済み操作可" on public.month_exports for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- 経費の削除・更新は本人または総務(admin)
drop policy if exists "自分のみ削除" on public.expenses;
drop policy if exists "自分のみ更新" on public.expenses;
create policy "本人または総務が削除" on public.expenses for delete
  using (auth.uid() = user_id or exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));
create policy "本人または総務が更新" on public.expenses for update
  using (auth.uid() = user_id or exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));

-- 領収書は非公開バケット（署名付きURLで表示）。削除はログイン済みユーザー
update storage.buckets set public = false where id = 'receipts';
drop policy if exists "receipts: authenticated delete own folder" on storage.objects;
create policy "receipts: authenticated delete" on storage.objects for delete
  using (bucket_id = 'receipts' and auth.role() = 'authenticated');
