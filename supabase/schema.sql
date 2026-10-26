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

-- ---------------------------------------------------------------------------
-- site_visit_days / site_visit_uniques (public visitor counters)
-- ---------------------------------------------------------------------------
create table if not exists public.site_visit_days (
  day date primary key,
  unique_visitors integer not null default 0 check (unique_visitors >= 0),
  pageviews integer not null default 0 check (pageviews >= 0)
);

create table if not exists public.site_visit_uniques (
  day date not null,
  visitor_key text not null,
  first_seen_at timestamptz not null default now(),
  primary key (day, visitor_key)
);

create index if not exists site_visit_uniques_day_idx
  on public.site_visit_uniques (day);

alter table public.site_visit_days enable row level security;
alter table public.site_visit_uniques enable row level security;

revoke all on public.site_visit_days from anon, authenticated;
revoke all on public.site_visit_uniques from anon, authenticated;

create or replace function public.touch_site_visit(p_visitor_key text default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := (timezone('Asia/Seoul', now()))::date;
  yday date := today - 1;
  vkey text := nullif(trim(coalesce(p_visitor_key, '')), '');
  new_unique int := 0;
  t_today int := 0;
  t_yday int := 0;
  t_total int := 0;
begin
  if vkey is not null and char_length(vkey) between 8 and 80 then
    insert into public.site_visit_days (day, unique_visitors, pageviews)
    values (today, 0, 0)
    on conflict (day) do nothing;

    insert into public.site_visit_uniques (day, visitor_key)
    values (today, vkey)
    on conflict (day, visitor_key) do nothing;

    get diagnostics new_unique = row_count;

    update public.site_visit_days
    set
      unique_visitors = unique_visitors + new_unique,
      pageviews = pageviews + 1
    where day = today;
  end if;

  select coalesce(unique_visitors, 0) into t_today
  from public.site_visit_days
  where day = today;

  select coalesce(unique_visitors, 0) into t_yday
  from public.site_visit_days
  where day = yday;

  select coalesce(sum(unique_visitors), 0)::int into t_total
  from public.site_visit_days;

  return json_build_object(
    'today', coalesce(t_today, 0),
    'yesterday', coalesce(t_yday, 0),
    'total', coalesce(t_total, 0),
    'day', today
  );
end;
$$;

revoke all on function public.touch_site_visit(text) from public;
grant execute on function public.touch_site_visit(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Promote yourself to admin (run once after signing up with your email):
--   update public.profiles set is_admin = true
--   where id = (select id from auth.users where email = 'you@example.com');
-- ---------------------------------------------------------------------------


-- Personal magazine membership and aggregate counts
-- Personal magazine: private reactions and wishlist; public aggregate counts only.
create schema if not exists magazine_private;
revoke all on schema magazine_private from public, anon, authenticated;

create table if not exists public.magazine_articles (
  id text primary key check (id ~ '^[a-z0-9-]{1,64}$'),
  title text not null,
  status text not null default 'draft' check (status in ('draft','published'))
);
alter table public.magazine_articles enable row level security;
drop policy if exists magazine_articles_read on public.magazine_articles;
create policy magazine_articles_read on public.magazine_articles for select to anon, authenticated using (true);
revoke all on public.magazine_articles from public, anon, authenticated;
grant select on public.magazine_articles to anon, authenticated;

create table if not exists public.article_reactions (
  user_id uuid not null references auth.users(id) on delete cascade,
  article_id text not null references public.magazine_articles(id) on delete cascade,
  interested boolean not null default false,
  liked boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key(user_id, article_id)
);
create index if not exists article_reactions_article_idx on public.article_reactions(article_id);
alter table public.article_reactions enable row level security;
drop policy if exists article_reactions_own_read on public.article_reactions;
create policy article_reactions_own_read on public.article_reactions for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists article_reactions_own_insert on public.article_reactions;
create policy article_reactions_own_insert on public.article_reactions for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists article_reactions_own_update on public.article_reactions;
create policy article_reactions_own_update on public.article_reactions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists article_reactions_own_delete on public.article_reactions;
create policy article_reactions_own_delete on public.article_reactions for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on public.article_reactions from public, anon, authenticated;
grant select, insert, delete on public.article_reactions to authenticated;
grant update(interested,liked,updated_at) on public.article_reactions to authenticated;

create table if not exists public.article_totals (
  article_id text primary key references public.magazine_articles(id) on delete cascade,
  interest_count bigint not null default 0 check (interest_count >= 0),
  like_count bigint not null default 0 check (like_count >= 0)
);
alter table public.article_totals enable row level security;
drop policy if exists article_totals_public_read on public.article_totals;
create policy article_totals_public_read on public.article_totals for select to anon, authenticated using (true);
revoke all on public.article_totals from public, anon, authenticated;
grant select on public.article_totals to anon, authenticated;

-- This privileged trigger is not exposed through the API. Only aggregate numbers
-- are written; clients cannot write totals or call this function themselves.
create or replace function magazine_private.sync_article_totals()
returns trigger language plpgsql security definer set search_path = '' as $$
declare aid text; interest_delta integer; like_delta integer;
begin
  aid := case when tg_op = 'DELETE' then old.article_id else new.article_id end;
  interest_delta := (case when tg_op <> 'DELETE' and new.interested then 1 else 0 end) - (case when tg_op <> 'INSERT' and old.interested then 1 else 0 end);
  like_delta := (case when tg_op <> 'DELETE' and new.liked then 1 else 0 end) - (case when tg_op <> 'INSERT' and old.liked then 1 else 0 end);
  -- Catalog removal cascades should not recreate the deleted catalog row.
  if not exists(select 1 from public.magazine_articles where id = aid) then return null; end if;
  insert into public.article_totals(article_id) values(aid) on conflict do nothing;
  update public.article_totals set interest_count = interest_count + interest_delta, like_count = like_count + like_delta where article_id = aid;
  return null;
end;
$$;
revoke all on function magazine_private.sync_article_totals() from public, anon, authenticated;
drop trigger if exists article_reactions_totals on public.article_reactions;
create trigger article_reactions_totals after insert or update or delete on public.article_reactions for each row execute function magazine_private.sync_article_totals();

-- Set only the requested flag atomically so cross-device interest/like updates
-- do not overwrite each other. Ownership is still enforced by the caller's RLS.
create or replace function public.set_article_reaction(p_article_id text, p_kind text, p_enabled boolean)
returns table(interested boolean, liked boolean)
language plpgsql security invoker set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Login required' using errcode='42501'; end if;
  if p_enabled is null then raise exception 'Enabled must be boolean'; end if;
  if p_kind = 'interest' then
    insert into public.article_reactions(user_id,article_id,interested) values(uid,p_article_id,p_enabled)
    on conflict(user_id,article_id) do update set interested=excluded.interested, updated_at=now();
  elsif p_kind = 'like' then
    insert into public.article_reactions(user_id,article_id,liked) values(uid,p_article_id,p_enabled)
    on conflict(user_id,article_id) do update set liked=excluded.liked, updated_at=now();
  else raise exception 'Invalid reaction kind'; end if;
  return query select r.interested,r.liked from public.article_reactions r where r.user_id=uid and r.article_id=p_article_id;
end;
$$;
revoke all on function public.set_article_reaction(text,text,boolean) from public, anon, authenticated;
grant execute on function public.set_article_reaction(text,text,boolean) to authenticated;

create table if not exists public.place_wishlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  place_sid text check (place_sid is null or place_sid ~ '^[0-9]{1,30}$'),
  name text not null check (char_length(trim(name)) between 1 and 120),
  address text not null default '' check(char_length(address) <= 240),
  map_url text check(map_url is null or map_url ~ '^https://(map[.]naver[.]com|naver[.]me|maps[.]app[.]goo[.]gl|place[.]map[.]kakao[.]com)(/|$)'),
  memo text not null default '' check(char_length(memo) <= 500),
  created_at timestamptz not null default now(),
  unique(user_id,place_sid)
);
create index if not exists place_wishlist_user_created_idx on public.place_wishlist(user_id,created_at desc);
alter table public.place_wishlist enable row level security;
drop policy if exists place_wishlist_own_read on public.place_wishlist;
create policy place_wishlist_own_read on public.place_wishlist for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists place_wishlist_own_insert on public.place_wishlist;
create policy place_wishlist_own_insert on public.place_wishlist for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists place_wishlist_own_update on public.place_wishlist;
create policy place_wishlist_own_update on public.place_wishlist for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists place_wishlist_own_delete on public.place_wishlist;
create policy place_wishlist_own_delete on public.place_wishlist for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on public.place_wishlist from public, anon, authenticated;
grant select,insert,update,delete on public.place_wishlist to authenticated;

-- Existing profile policies allow updating one's own row. Restrict the column
-- grant so a member can change a nickname but cannot grant themselves admin.
revoke update on public.profiles from public, anon, authenticated;
grant update(display_name) on public.profiles to authenticated;

insert into public.magazine_articles(id,title,status) values
('pyongyang','평양냉면 입문에 성공하려면','draft'),
('cutlet','프리미엄 카츠는 일반 돈가스와 무엇이 다를까?','draft'),
('omakase','오마카세는 왜 이렇게 비쌀까?','draft'),
('jajang','맛있는 짜장면은 어떻게 구분할까?','draft'),
('coffee','산미 있는 커피는 왜 누군가에겐 신맛만 날까?','draft'),
('hanwoo','한우 1++이면 무조건 더 맛있을까?','draft'),
('nope','오래된 식당은 왜 살아남았을까?','draft'),
('salt','비싼 소금은 음식 맛을 바꿀까?','draft')
on conflict(id) do update set title=excluded.title,status=excluded.status;
insert into public.article_totals(article_id) select id from public.magazine_articles on conflict do nothing;
