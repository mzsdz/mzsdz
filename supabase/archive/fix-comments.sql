-- 댓글 INSERT가 안 될 때: 이 파일만 SQL Editor에서 실행하세요.
-- (schema.sql 전체를 다시 돌리기 싫을 때용 최소 패치)
-- ARCHIVED: 내용은 migrations/20260724000000_baseline.sql 에 포함됨.

alter table public.comments enable row level security;

drop policy if exists "comments: anyone can read" on public.comments;
create policy "comments: anyone can read"
  on public.comments for select
  using (true);

drop policy if exists "comments: logged-in user insert own" on public.comments;
create policy "comments: logged-in user insert own"
  on public.comments for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "comments: owner or admin delete" on public.comments;
create policy "comments: owner or admin delete"
  on public.comments for delete
  to authenticated
  using (auth.uid() = user_id or public.is_admin());

grant select on public.comments to anon, authenticated;
grant insert, delete on public.comments to authenticated;
