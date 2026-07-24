-- added_places: admin-added restaurants (merged at runtime with static places.js)
create table if not exists public.added_places (
  place_sid text primary key,
  name text not null,
  address text not null default '',
  category text not null default '',
  stars smallint not null default 0 check (stars between 0 and 3),
  px double precision,
  py double precision,
  source_url text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.added_places enable row level security;

drop policy if exists "added_places: anyone can read" on public.added_places;
create policy "added_places: anyone can read"
  on public.added_places for select
  using (true);

drop policy if exists "added_places: admin insert" on public.added_places;
create policy "added_places: admin insert"
  on public.added_places for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "added_places: admin update" on public.added_places;
create policy "added_places: admin update"
  on public.added_places for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "added_places: admin delete" on public.added_places;
create policy "added_places: admin delete"
  on public.added_places for delete
  to authenticated
  using (public.is_admin());

grant select on public.added_places to anon, authenticated;
grant insert, update, delete on public.added_places to authenticated;
