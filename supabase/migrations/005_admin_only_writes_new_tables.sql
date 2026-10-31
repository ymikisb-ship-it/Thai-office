-- 今回追加したテーブルの書き込みを管理者(admin)のみに限定（閲覧は従来どおり）
create or replace function public.is_admin() returns boolean
language sql stable security invoker set search_path = public
as $$ select exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin') $$;
drop policy "ログイン済み操作可" on public.cost_items;
drop policy "ログイン済み操作可" on public.budget_amounts;
drop policy "ログイン済み操作可" on public.month_exports;
create policy "管理者のみ追加" on public.cost_items for insert with check (public.is_admin());
create policy "管理者のみ更新" on public.cost_items for update using (public.is_admin()) with check (public.is_admin());
create policy "管理者のみ削除" on public.cost_items for delete using (public.is_admin());
create policy "管理者のみ追加" on public.budget_amounts for insert with check (public.is_admin());
create policy "管理者のみ更新" on public.budget_amounts for update using (public.is_admin()) with check (public.is_admin());
create policy "管理者のみ削除" on public.budget_amounts for delete using (public.is_admin());
create policy "管理者のみ追加" on public.month_exports for insert with check (public.is_admin());
create policy "管理者のみ更新" on public.month_exports for update using (public.is_admin()) with check (public.is_admin());
create policy "管理者のみ削除" on public.month_exports for delete using (public.is_admin());
