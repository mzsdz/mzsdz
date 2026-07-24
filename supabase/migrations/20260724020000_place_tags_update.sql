-- Allow admins to update place_tags (e.g. repair kind cuisine/region)
drop policy if exists "place_tags: admin update" on public.place_tags;
create policy "place_tags: admin update"
  on public.place_tags for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant update on public.place_tags to authenticated;
