alter table public.profiles
  add column if not exists active_session_id uuid,
  add column if not exists last_heartbeat timestamptz;

create or replace function public.acquire_active_session(p_new_session_id uuid)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  current_profile public.profiles%rowtype;
begin
  if auth.uid() is null or p_new_session_id is null then
    return 'UNAUTHORIZED';
  end if;

  select * into current_profile
  from public.profiles
  where id = auth.uid()
  for update;

  if current_profile.id is null then
    return 'PROFILE_NOT_FOUND';
  end if;

  if current_profile.active_session_id = p_new_session_id then
    update public.profiles
    set last_heartbeat = now()
    where id = auth.uid();
    return 'OK';
  end if;

  if current_profile.active_session_id is not null
     and current_profile.last_heartbeat is not null
     and current_profile.last_heartbeat > now() - interval '30 seconds' then
    return 'LOCKED';
  end if;

  update public.profiles
  set active_session_id = p_new_session_id,
      last_heartbeat = now()
  where id = auth.uid();
  return 'OK';
end;
$$;

create or replace function public.heartbeat_active_session(p_session_id uuid)
returns text
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null or p_session_id is null then
    return 'UNAUTHORIZED';
  end if;

  update public.profiles
  set last_heartbeat = now()
  where id = auth.uid()
    and active_session_id = p_session_id;

  if found then return 'OK'; end if;
  return 'SESSION_REPLACED';
end;
$$;

create or replace function public.release_active_session(p_session_id uuid)
returns text
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null or p_session_id is null then
    return 'UNAUTHORIZED';
  end if;

  update public.profiles
  set active_session_id = null,
      last_heartbeat = null
  where id = auth.uid()
    and active_session_id = p_session_id;

  if found then return 'OK'; end if;
  return 'SESSION_REPLACED';
end;
$$;

revoke all on function public.acquire_active_session(uuid) from public;
revoke all on function public.heartbeat_active_session(uuid) from public;
revoke all on function public.release_active_session(uuid) from public;
grant execute on function public.acquire_active_session(uuid) to authenticated;
grant execute on function public.heartbeat_active_session(uuid) to authenticated;
grant execute on function public.release_active_session(uuid) to authenticated;
