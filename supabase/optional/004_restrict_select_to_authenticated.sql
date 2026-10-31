-- 【任意・未適用】閲覧ポリシーが using(true) のため、公開されている匿名キーだけで
-- users / expenses / activities などを読み取れる状態です。ログイン済みユーザーのみに限定します。
-- 適用前に: アプリは常にログイン後にデータを読むため通常は影響しませんが、念のためログインして動作確認してください。
drop policy "全員閲覧可" on public.users;
drop policy "全員閲覧可" on public.expenses;
drop policy "全員閲覧可" on public.activities;
drop policy "全員閲覧可" on public.budgets;
drop policy "全員閲覧可" on public.monthly_plans;
drop policy "全員閲覧可" on public.monthly_reports;
drop policy "全員閲覧可" on public.cost_items;
drop policy "全員閲覧可" on public.budget_amounts;
drop policy "全員閲覧可" on public.month_exports;
create policy "ログイン済みのみ閲覧可" on public.users           for select using (auth.role() = 'authenticated');
create policy "ログイン済みのみ閲覧可" on public.expenses        for select using (auth.role() = 'authenticated');
create policy "ログイン済みのみ閲覧可" on public.activities      for select using (auth.role() = 'authenticated');
create policy "ログイン済みのみ閲覧可" on public.budgets         for select using (auth.role() = 'authenticated');
create policy "ログイン済みのみ閲覧可" on public.monthly_plans   for select using (auth.role() = 'authenticated');
create policy "ログイン済みのみ閲覧可" on public.monthly_reports for select using (auth.role() = 'authenticated');
create policy "ログイン済みのみ閲覧可" on public.cost_items      for select using (auth.role() = 'authenticated');
create policy "ログイン済みのみ閲覧可" on public.budget_amounts  for select using (auth.role() = 'authenticated');
create policy "ログイン済みのみ閲覧可" on public.month_exports   for select using (auth.role() = 'authenticated');
alter view public.monthly_expense_summary set (security_invoker = true);
alter view public.monthly_activity_summary set (security_invoker = true);
