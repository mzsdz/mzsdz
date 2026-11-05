-- Register the published personal essay without changing existing reactions.
insert into public.magazine_articles(id,title,status)
values ('restaurants-we-miss','사라진 맛집들','published')
on conflict (id) do update set title=excluded.title,status=excluded.status;
insert into public.article_totals(article_id)
values ('restaurants-we-miss') on conflict do nothing;
