-- 닉네임 중복 방지 (이미 스키마를 적용한 프로젝트용)
-- SQL Editor에서 한 번 실행하세요.
-- ARCHIVED: 내용은 migrations/20260724000000_baseline.sql 에 포함됨.

create unique index if not exists profiles_display_name_unique_ci
  on public.profiles (lower(trim(display_name)))
  where display_name is not null and length(trim(display_name)) > 0;

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
      insert into public.profiles (id, display_name)
      values (new.id, null)
      on conflict (id) do nothing;
  end;

  return new;
end;
$$;
