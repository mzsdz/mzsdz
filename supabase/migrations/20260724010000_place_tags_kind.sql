-- place_tags: distinguish region vs cuisine custom tags
alter table public.place_tags
  add column if not exists kind text;

update public.place_tags
set kind = 'cuisine'
where kind is null or trim(kind) = '';

alter table public.place_tags
  alter column kind set default 'cuisine';

alter table public.place_tags
  alter column kind set not null;

alter table public.place_tags
  drop constraint if exists place_tags_kind_check;

alter table public.place_tags
  add constraint place_tags_kind_check
  check (kind in ('cuisine', 'region'));

drop index if exists place_tags_place_sid_label_unique_ci;

create unique index if not exists place_tags_place_sid_kind_label_unique_ci
  on public.place_tags (place_sid, kind, lower(trim(label)));
