create or replace function public.clear_chat_history(p_level_id integer)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null or p_level_id not between 1 and 3 then
    raise exception 'UNAUTHORIZED' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.submissions s
    where s.user_id = auth.uid() and s.level_id = p_level_id
  ) then
    raise exception 'LEVEL_LOCKED' using errcode = '42501';
  end if;
  update public.chat_messages
  set deleted_at = now()
  where user_id = auth.uid() and level_id = p_level_id and deleted_at is null;
end;
$$;
