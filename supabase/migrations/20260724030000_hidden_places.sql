-- Soft-delete / hide places from the public list (admin only write)
create table if not exists public.hidden_places (
  place_sid text primary key,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.hidden_places enable row level security;

drop policy if exists "hidden_places: anyone can read" on public.hidden_places;
create policy "hidden_places: anyone can read"
  on public.hidden_places for select
  using (true);

drop policy if exists "hidden_places: admin insert" on public.hidden_places;
create policy "hidden_places: admin insert"
  on public.hidden_places for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "hidden_places: admin delete" on public.hidden_places;
create policy "hidden_places: admin delete"
  on public.hidden_places for delete
  to authenticated
  using (public.is_admin());

grant select on public.hidden_places to anon, authenticated;
grant insert, delete on public.hidden_places to authenticated;
