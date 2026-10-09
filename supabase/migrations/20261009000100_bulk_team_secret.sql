-- Allow administrators to assign one target word to every team and level.
create or replace function public.set_all_team_secrets(p_target_secret text)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  changed integer;
begin
  if not public.is_current_user_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if p_target_secret is null or length(trim(p_target_secret)) not between 1 and 500 then
    raise exception 'INVALID_SECRET';
  end if;

  insert into public.team_secrets(user_id, level_id, target_secret)
    select p.id, g.level_id, trim(p_target_secret)
    from public.profiles p
    cross join public.guardrails g
    where p.is_admin = false
  on conflict (user_id, level_id) do update
    set target_secret = excluded.target_secret, updated_at = now();

  get diagnostics changed = row_count;
  return changed;
end;
$$;

revoke all on function public.set_all_team_secrets(text) from public;
grant execute on function public.set_all_team_secrets(text) to authenticated;
