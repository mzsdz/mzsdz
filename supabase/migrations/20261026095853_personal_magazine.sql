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
