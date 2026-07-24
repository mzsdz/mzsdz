-- 커스텀 태그(place_tags): SQL Editor에서 이 파일만 실행하세요.
-- (schema.sql 전체를 다시 돌리기 싫을 때용 최소 패치)
-- ARCHIVED: 내용은 migrations/20260724000000_baseline.sql 에 포함됨.

create table if not exists public.place_tags (
  id uuid primary key default gen_random_uuid(),
  place_sid text not null,
  label text not null check (char_length(trim(label)) > 0),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists place_tags_place_sid_label_unique_ci
  on public.place_tags (place_sid, lower(trim(label)));

create index if not exists place_tags_place_sid_idx
  on public.place_tags (place_sid);

alter table public.place_tags enable row level security;

drop policy if exists "place_tags: anyone can read" on public.place_tags;
create policy "place_tags: anyone can read"
  on public.place_tags for select
  using (true);

drop policy if exists "place_tags: admin insert" on public.place_tags;
create policy "place_tags: admin insert"
  on public.place_tags for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "place_tags: admin delete" on public.place_tags;
create policy "place_tags: admin delete"
  on public.place_tags for delete
  to authenticated
  using (public.is_admin());

grant select on public.place_tags to anon, authenticated;
grant insert, delete on public.place_tags to authenticated;
