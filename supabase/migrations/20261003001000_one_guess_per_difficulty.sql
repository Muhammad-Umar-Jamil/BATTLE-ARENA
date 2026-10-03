-- Enforce one accepted guess for each team and difficulty.
-- Existing duplicate rows are reduced to the earliest accepted attempt before
-- the unique index is installed; totals are then rebuilt from the retained rows.
with ranked as (
  select id,
    row_number() over (partition by user_id, level_id order by created_at asc, id asc) as attempt_number
  from public.submissions
), removed as (
  delete from public.submissions s
  using ranked r
  where s.id = r.id and r.attempt_number > 1
  returning s.user_id
)
update public.profiles p
set total_score = coalesce((
  select sum(s.awarded_points)::integer
  from public.submissions s
  where s.user_id = p.id
), 0)
where p.is_admin = false;

create unique index if not exists submissions_one_guess_per_team_level_idx
  on public.submissions(user_id, level_id);

drop function if exists public.record_submission(integer,text,integer,integer);
create or replace function public.record_submission(
  p_level_id integer,
  p_submitted_word text,
  p_similarity_score integer,
  p_awarded_points integer
)
returns table(
  similarity_score integer,
  awarded_points integer,
  is_new_best boolean,
  previous_best integer,
  total_score integer,
  guess_used boolean
)
language plpgsql security definer set search_path = public
as $$
declare
  new_total integer;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHORIZED' using errcode = '42501';
  end if;
  if p_level_id not between 1 and 3
     or p_submitted_word is null
     or length(trim(p_submitted_word)) not between 1 and 500 then
    raise exception 'INVALID_SUBMISSION' using errcode = '22023';
  end if;
  if p_similarity_score not between 0 and 100 or p_awarded_points < 0 then
    raise exception 'INVALID_SCORE' using errcode = '22023';
  end if;

  -- Serialize attempts for the same team/difficulty so concurrent requests
  -- cannot both consume the single guess.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':' || p_level_id::text, 0));
  if exists (
    select 1 from public.submissions
    where user_id = auth.uid() and level_id = p_level_id
  ) then
    raise exception 'GUESS_ALREADY_USED' using errcode = '23505';
  end if;

  insert into public.submissions(user_id, level_id, submitted_word, similarity_score, awarded_points)
  values (auth.uid(), p_level_id, trim(p_submitted_word), p_similarity_score, p_awarded_points);

  update public.profiles
  set total_score = total_score + p_awarded_points
  where id = auth.uid()
  returning total_score into new_total;

  return query select
    p_similarity_score,
    p_awarded_points,
    true,
    0,
    coalesce(new_total, 0),
    true;
end;
$$;

revoke all on function public.record_submission(integer,text,integer,integer) from public;
grant execute on function public.record_submission(integer,text,integer,integer) to authenticated;

-- Expose only attempt-used flags to the admin console.
drop function if exists public.admin_list_teams();
create or replace function public.admin_list_teams()
returns table (
  id uuid,
  username text,
  total_score integer,
  active_session_id uuid,
  last_heartbeat timestamptz,
  is_active boolean,
  easy_guess_used boolean,
  medium_guess_used boolean,
  hard_guess_used boolean
)
language plpgsql stable security definer set search_path = public
as $$ begin
  if not public.is_current_user_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  return query
  select p.id,
    p.username,
    p.total_score,
    p.active_session_id,
    p.last_heartbeat,
    (p.active_session_id is not null and p.last_heartbeat > now() - interval '30 seconds'),
    exists (select 1 from public.submissions s where s.user_id = p.id and s.level_id = 1),
    exists (select 1 from public.submissions s where s.user_id = p.id and s.level_id = 2),
    exists (select 1 from public.submissions s where s.user_id = p.id and s.level_id = 3)
  from public.profiles p
  where p.is_admin = false
  order by p.username;
end; $$;

revoke all on function public.admin_list_teams() from public;
grant execute on function public.admin_list_teams() to authenticated;
