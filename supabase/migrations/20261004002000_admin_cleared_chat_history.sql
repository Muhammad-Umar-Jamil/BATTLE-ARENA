-- Keep cleared conversations recoverable for administrators.
-- Participant clearing already soft-deletes rows; this read-only function exposes
-- those rows to admins without exposing them to other participants.
create or replace function public.admin_list_cleared_chat_history()
returns table(
  id uuid,
  username text,
  level_id integer,
  role text,
  content text,
  created_at timestamptz,
  deleted_at timestamptz
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_current_user_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;

  return query
    select m.id, p.username, m.level_id, m.role, m.content, m.created_at, m.deleted_at
    from public.chat_messages m
    join public.profiles p on p.id = m.user_id
    where m.deleted_at is not null
    order by m.deleted_at desc, m.created_at asc
    limit 1000;
end;
$$;

revoke all on function public.admin_list_cleared_chat_history() from public;
grant execute on function public.admin_list_cleared_chat_history() to authenticated;
