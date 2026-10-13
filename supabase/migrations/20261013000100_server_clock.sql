drop function public.get_participant_event();

create function public.get_participant_event()
returns table(status text, logins_disabled boolean, start_time timestamptz, end_time timestamptz, server_now timestamptz)
language plpgsql stable security definer set search_path = public
as $$ begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED' using errcode='42501'; end if;
  return query select e.status,e.logins_disabled,e.start_time,e.end_time,clock_timestamp() from public.event_settings e where e.id=1;
end; $$;

revoke all on function public.get_participant_event() from public;
grant execute on function public.get_participant_event() to authenticated;
