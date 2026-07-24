-- Per-place star rating overrides (0=미방문, 1..3=★)
create table if not exists public.place_stars (
  place_sid text primary key,
  stars smallint not null check (stars between 0 and 3),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.place_stars enable row level security;

drop policy if exists "place_stars: anyone can read" on public.place_stars;
create policy "place_stars: anyone can read"
  on public.place_stars for select
  using (true);

drop policy if exists "place_stars: admin insert" on public.place_stars;
create policy "place_stars: admin insert"
  on public.place_stars for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "place_stars: admin update" on public.place_stars;
create policy "place_stars: admin update"
  on public.place_stars for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "place_stars: admin delete" on public.place_stars;
create policy "place_stars: admin delete"
  on public.place_stars for delete
  to authenticated
  using (public.is_admin());

grant select on public.place_stars to anon, authenticated;
grant insert, update, delete on public.place_stars to authenticated;
