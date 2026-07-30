-- Site visitor stats (Asia/Seoul day buckets)
-- Unique visitors once per browser key per day; pageviews always increment.

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

-- No direct client access; use security definer RPC only.
drop policy if exists "site_visit_days: deny all" on public.site_visit_days;
drop policy if exists "site_visit_uniques: deny all" on public.site_visit_uniques;

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
