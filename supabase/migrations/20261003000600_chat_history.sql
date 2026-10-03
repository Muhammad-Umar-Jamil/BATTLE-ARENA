create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  level_id integer not null references public.guardrails(level_id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null check (length(content) between 1 and 20000),
  request_id uuid,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists chat_messages_user_level_created_idx on public.chat_messages(user_id, level_id, created_at);
alter table public.chat_messages enable row level security;
revoke all on public.chat_messages from anon, authenticated;

create or replace function public.get_participant_event()
returns table(status text, logins_disabled boolean, start_time timestamptz, end_time timestamptz)
language plpgsql stable security definer set search_path = public
as $$ begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED' using errcode='42501'; end if;
  return query select e.status,e.logins_disabled,e.start_time,e.end_time from public.event_settings e where e.id=1;
end; $$;

create or replace function public.list_chat_messages(p_level_id integer)
returns table(id uuid, role text, content text, created_at timestamptz)
language plpgsql stable security definer set search_path = public
as $$ begin
  if auth.uid() is null or p_level_id not between 1 and 3 then raise exception 'UNAUTHORIZED' using errcode='42501'; end if;
  return query select m.id,m.role,m.content,m.created_at from public.chat_messages m
    where m.user_id=auth.uid() and m.level_id=p_level_id and m.deleted_at is null order by m.created_at;
end; $$;

create or replace function public.clear_chat_history(p_level_id integer)
returns void language plpgsql security definer set search_path = public
as $$ begin
  if auth.uid() is null or p_level_id not between 1 and 3 then raise exception 'UNAUTHORIZED' using errcode='42501'; end if;
  update public.chat_messages set deleted_at=now() where user_id=auth.uid() and level_id=p_level_id and deleted_at is null;
end; $$;

revoke all on function public.get_participant_event() from public;
revoke all on function public.list_chat_messages(integer) from public;
revoke all on function public.clear_chat_history(integer) from public;
grant execute on function public.get_participant_event(), public.list_chat_messages(integer), public.clear_chat_history(integer) to authenticated;
