create table if not exists public.event_settings (
  id integer primary key default 1 check (id = 1),
  status text not null default 'pending' check (status in ('pending', 'running', 'finished')),
  logins_disabled boolean not null default false,
  start_time timestamptz,
  end_time timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.event_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.team_secrets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  level_id integer not null references public.guardrails(level_id) on delete cascade,
  target_secret text not null check (length(trim(target_secret)) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, level_id)
);

alter table public.event_settings enable row level security;
alter table public.team_secrets enable row level security;
revoke all on public.event_settings, public.team_secrets from anon, authenticated;

create or replace function public.get_event_settings()
returns table (id integer, status text, logins_disabled boolean, start_time timestamptz, end_time timestamptz, updated_at timestamptz)
language plpgsql stable security definer set search_path = public
as $$ begin
  if not public.is_current_user_admin() then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
  return query select e.id,e.status,e.logins_disabled,e.start_time,e.end_time,e.updated_at from public.event_settings e where e.id=1;
end; $$;

create or replace function public.start_event(p_duration_minutes integer)
returns public.event_settings
language plpgsql security definer set search_path = public
as $$ declare result public.event_settings; begin
  if not public.is_current_user_admin() then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
  if p_duration_minutes not between 1 and 480 then raise exception 'INVALID_DURATION'; end if;
  update public.event_settings set status='running',logins_disabled=false,start_time=now(),end_time=now() + make_interval(mins => p_duration_minutes),updated_at=now() where id=1 returning * into result;
  return result;
end; $$;

create or replace function public.stop_event()
returns public.event_settings
language plpgsql security definer set search_path = public
as $$ declare result public.event_settings; begin
  if not public.is_current_user_admin() then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
  update public.event_settings set status='finished',logins_disabled=true,end_time=coalesce(end_time,now()),updated_at=now() where id=1 returning * into result;
  update public.profiles set active_session_id=null,last_heartbeat=null where is_admin=false;
  return result;
end; $$;

create or replace function public.set_login_lock(p_disabled boolean)
returns public.event_settings
language plpgsql security definer set search_path = public
as $$ declare result public.event_settings; begin
  if not public.is_current_user_admin() then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
  update public.event_settings set logins_disabled=p_disabled,updated_at=now() where id=1 returning * into result;
  return result;
end; $$;

create or replace function public.admin_list_teams()
returns table (id uuid, username text, total_score integer, active_session_id uuid, last_heartbeat timestamptz, is_active boolean)
language plpgsql stable security definer set search_path = public
as $$ begin
  if not public.is_current_user_admin() then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
  return query select p.id,p.username,p.total_score,p.active_session_id,p.last_heartbeat,
    (p.active_session_id is not null and p.last_heartbeat > now() - interval '30 seconds')
  from public.profiles p where p.is_admin=false order by p.username;
end; $$;

create or replace function public.admin_list_team_secrets()
returns table (user_id uuid, username text, level_id integer, target_secret text)
language plpgsql stable security definer set search_path = public
as $$ begin
  if not public.is_current_user_admin() then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
  return query select p.id,p.username,g.level_id,coalesce(s.target_secret,'')
  from public.profiles p cross join public.guardrails g left join public.team_secrets s on s.user_id=p.id and s.level_id=g.level_id
  where p.is_admin=false order by p.username,g.level_id;
end; $$;

create or replace function public.save_team_secret(p_user_id uuid,p_level_id integer,p_target_secret text)
returns void language plpgsql security definer set search_path = public
as $$ begin
  if not public.is_current_user_admin() then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
  if p_level_id not between 1 and 3 or p_target_secret is null or length(trim(p_target_secret)) not between 1 and 500 then raise exception 'INVALID_SECRET'; end if;
  insert into public.team_secrets(user_id,level_id,target_secret) values(p_user_id,p_level_id,trim(p_target_secret))
  on conflict(user_id,level_id) do update set target_secret=excluded.target_secret,updated_at=now();
end; $$;

create or replace function public.force_logout_team(p_user_id uuid)
returns void language plpgsql security definer set search_path = public
as $$ begin
  if not public.is_current_user_admin() then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
  update public.profiles set active_session_id=null,last_heartbeat=null where id=p_user_id and is_admin=false;
end; $$;

create or replace function public.acquire_active_session(p_new_session_id uuid)
returns text language plpgsql security definer set search_path = public
as $$ declare current_profile public.profiles%rowtype; event_row public.event_settings%rowtype; begin
  if auth.uid() is null or p_new_session_id is null then return 'UNAUTHORIZED'; end if;
  select * into current_profile from public.profiles where id=auth.uid() for update;
  if current_profile.id is null then return 'PROFILE_NOT_FOUND'; end if;
  if not current_profile.is_admin then
    select * into event_row from public.event_settings where id=1;
    if event_row.logins_disabled then return 'DISABLED'; end if;
    if event_row.status <> 'running' or event_row.end_time is not null and event_row.end_time <= now() then return 'EVENT_NOT_STARTED'; end if;
  end if;
  if current_profile.active_session_id=p_new_session_id then update public.profiles set last_heartbeat=now() where id=auth.uid(); return 'OK'; end if;
  if current_profile.active_session_id is not null and current_profile.last_heartbeat is not null and current_profile.last_heartbeat > now()-interval '30 seconds' then return 'LOCKED'; end if;
  update public.profiles set active_session_id=p_new_session_id,last_heartbeat=now() where id=auth.uid(); return 'OK';
end; $$;

revoke all on function public.get_event_settings() from public;
revoke all on function public.start_event(integer) from public;
revoke all on function public.stop_event() from public;
revoke all on function public.set_login_lock(boolean) from public;
revoke all on function public.admin_list_teams() from public;
revoke all on function public.admin_list_team_secrets() from public;
revoke all on function public.save_team_secret(uuid,integer,text) from public;
revoke all on function public.force_logout_team(uuid) from public;
grant execute on function public.get_event_settings(), public.start_event(integer), public.stop_event(), public.set_login_lock(boolean), public.admin_list_teams(), public.admin_list_team_secrets(), public.save_team_secret(uuid,integer,text), public.force_logout_team(uuid) to authenticated;
