-- All writes below are rolled back. No test accounts or production content persist.
begin;
do $$ declare a uuid; b uuid; before_i bigint; before_l bigint; prior_i boolean; prior_l boolean; begin
  select id into a from auth.users order by created_at limit 1;
  select id into b from auth.users where id <> a order by created_at limit 1;
  if a is null or b is null then raise exception 'Two existing accounts are needed for isolation test'; end if;
  perform set_config('qa.user_a',a::text,true);
  perform set_config('qa.user_b',b::text,true);
  select interest_count,like_count into before_i,before_l from public.article_totals where article_id='pyongyang';
  select interested,liked into prior_i,prior_l from public.article_reactions where user_id=a and article_id='pyongyang';
  perform set_config('qa.expected_i',(before_i + case when coalesce(prior_i,false) then 0 else 1 end)::text,true);
  perform set_config('qa.expected_l',(before_l + case when coalesce(prior_l,false) then 0 else 1 end)::text,true);
  perform set_config('request.jwt.claim.sub',a::text,true);
end $$;
set local role authenticated;
select public.set_article_reaction('pyongyang','interest',true);
select public.set_article_reaction('pyongyang','interest',true);
select public.set_article_reaction('pyongyang','like',true);
do $$ declare r record; begin
  select * into r from public.article_reactions where article_id='pyongyang';
  if not r.interested or not r.liked then raise exception 'Reaction flags overwrote one another'; end if;
  if not exists(select 1 from public.article_totals where article_id='pyongyang' and interest_count=current_setting('qa.expected_i')::bigint and like_count=current_setting('qa.expected_l')::bigint) then raise exception 'Count/idempotency failed'; end if;
  begin update public.article_reactions set article_id='cutlet' where article_id='pyongyang'; raise exception 'Article ID update unexpectedly allowed'; exception when insufficient_privilege then null; end;
  begin update public.profiles set is_admin=true where id=auth.uid(); raise exception 'Admin escalation unexpectedly allowed'; exception when insufficient_privilege then null; end;
  begin update public.article_totals set interest_count=999 where article_id='pyongyang'; raise exception 'Total tampering unexpectedly allowed'; exception when insufficient_privilege then null; end;
  insert into public.place_wishlist(user_id,place_sid,name,map_url) values(auth.uid(),'999999999999999999999999999999','__transactional_QA_wishlist__','https://map.naver.com/p/entry/place/999999999999999999999999999999');
end $$;
reset role;
do $$ begin perform set_config('request.jwt.claim.sub',current_setting('qa.user_b'),true); end $$;
set local role authenticated;
do $$ begin
  if exists(select 1 from public.article_reactions where user_id=current_setting('qa.user_a')::uuid) then raise exception 'Another user reactions leaked'; end if;
  if exists(select 1 from public.place_wishlist where user_id=current_setting('qa.user_a')::uuid) then raise exception 'Another user wishlist leaked'; end if;
  delete from public.place_wishlist where user_id=current_setting('qa.user_a')::uuid;
  if found then raise exception 'Another user wishlist deleted'; end if;
  begin insert into public.article_reactions(user_id,article_id,liked) values(current_setting('qa.user_a')::uuid,'salt',true); raise exception 'Cross-user reaction insert unexpectedly allowed'; exception when insufficient_privilege then null; end;
  begin insert into public.place_wishlist(user_id,name) values(current_setting('qa.user_a')::uuid,'cross-user'); raise exception 'Cross-user wishlist insert unexpectedly allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
do $$ begin
  perform interest_count from public.article_totals limit 1;
  begin perform user_id from public.article_reactions limit 1; raise exception 'Anonymous reaction data unexpectedly readable'; exception when insufficient_privilege then null; end;
  begin perform user_id from public.place_wishlist limit 1; raise exception 'Anonymous wishlist unexpectedly readable'; exception when insufficient_privilege then null; end;
  begin perform public.set_article_reaction('salt','like',true); raise exception 'Anonymous reaction unexpectedly allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'PASS: private records, idempotent reaction counts, cross-user isolation, anonymous restrictions and admin-column protection; all test writes rolled back' as result;
