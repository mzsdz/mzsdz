-- 맛집신동진: profiles / admin_memos / comments / place_tags
-- Canonical full schema (keep in sync with supabase/migrations).
-- New projects: run this once in SQL Editor, or use `npx supabase db push`.
-- Safe to re-run: policies are dropped before recreate.
-- ---------------------------------------------------------------------------
-- profiles (extends auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- Nicknames unique (case-insensitive, ignore blank)
create unique index if not exists profiles_display_name_unique_ci
  on public.profiles (lower(trim(display_name)))
  where display_name is not null and length(trim(display_name)) > 0;

alter table public.profiles enable row level security;

drop policy if exists "profiles: anyone can read" on public.profiles;
create policy "profiles: anyone can read"
  on public.profiles for select
  using (true);

drop policy if exists "profiles: users update own row" on public.profiles;
create policy "profiles: users update own row"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  nick text;
begin
  nick := coalesce(
    nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    nullif(trim(new.raw_user_meta_data->>'name'), ''),
    nullif(trim(new.raw_user_meta_data->>'preferred_username'), ''),
    nullif(trim(split_part(new.email, '@', 1)), '')
  );

  begin
    insert into public.profiles (id, display_name)
    values (new.id, nick)
    on conflict (id) do nothing;
  exception
    when unique_violation then
      -- Nickname taken: create row without name so UI asks for a new one
      insert into public.profiles (id, display_name)
      values (new.id, null)
      on conflict (id) do nothing;
  end;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper: current user is admin?
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_admin from public.profiles where id = auth.uid()),
    false
  );
$$;

-- ---------------------------------------------------------------------------
-- admin_memos (one memo per place_sid; readable by all, writable by admin)
-- ---------------------------------------------------------------------------
create table if not exists public.admin_memos (
  place_sid text primary key,
  body text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

alter table public.admin_memos enable row level security;

drop policy if exists "admin_memos: anyone can read" on public.admin_memos;
create policy "admin_memos: anyone can read"
  on public.admin_memos for select
  using (true);

drop policy if exists "admin_memos: admin insert" on public.admin_memos;
create policy "admin_memos: admin insert"
  on public.admin_memos for insert
  with check (public.is_admin());

drop policy if exists "admin_memos: admin update" on public.admin_memos;
create policy "admin_memos: admin update"
  on public.admin_memos for update
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "admin_memos: admin delete" on public.admin_memos;
create policy "admin_memos: admin delete"
  on public.admin_memos for delete
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- comments (login required to write; anyone can read)
-- ---------------------------------------------------------------------------
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  place_sid text not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(trim(body)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists comments_place_sid_created_at_idx
  on public.comments (place_sid, created_at desc);

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

-- ---------------------------------------------------------------------------
-- place_tags (custom region/cuisine tags; readable by all, writable by admin)
create table if not exists public.place_tags (
  id uuid primary key default gen_random_uuid(),
  place_sid text not null,
  kind text not null default 'cuisine' check (kind in ('cuisine', 'region')),
  label text not null check (char_length(trim(label)) > 0),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists place_tags_place_sid_kind_label_unique_ci
  on public.place_tags (place_sid, kind, lower(trim(label)));

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

drop policy if exists "place_tags: admin update" on public.place_tags;
create policy "place_tags: admin update"
  on public.place_tags for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- API roles need table privileges (SELECT works without INSERT otherwise)
grant usage on schema public to anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant update on public.profiles to authenticated;
grant select on public.admin_memos to anon, authenticated;
grant insert, update, delete on public.admin_memos to authenticated;
grant select on public.comments to anon, authenticated;
grant insert, delete on public.comments to authenticated;
grant select on public.place_tags to anon, authenticated;
grant insert, update, delete on public.place_tags to authenticated;

-- ---------------------------------------------------------------------------
-- hidden_places: admin can remove places from the public list
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

-- ---------------------------------------------------------------------------
-- place_stars: admin overrides for ★ / 미방문
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

-- ---------------------------------------------------------------------------
-- Promote yourself to admin (run once after signing up with your email):
--   update public.profiles set is_admin = true
--   where id = (select id from auth.users where email = 'you@example.com');
-- ---------------------------------------------------------------------------
