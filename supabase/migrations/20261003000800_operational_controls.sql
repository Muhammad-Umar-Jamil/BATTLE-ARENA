create or replace function public.force_logout_all_teams()
returns integer language plpgsql security definer set search_path=public
as $$ declare changed integer; begin
  if not public.is_current_user_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
  update public.profiles set active_session_id=null,last_heartbeat=null where is_admin=false;
  get diagnostics changed = row_count; return changed;
end; $$;
revoke all on function public.force_logout_all_teams() from public;
grant execute on function public.force_logout_all_teams() to authenticated;
