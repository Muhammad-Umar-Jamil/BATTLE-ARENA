-- Shared targets apply only to the selected round and existing teams.
create or replace function public.set_round_team_secrets(p_level_id integer, p_target_secret text)
returns integer language plpgsql security definer set search_path = public
as $$
declare changed integer;
begin
  if not public.is_current_user_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if p_level_id is null or p_level_id not between 1 and 3
     or p_target_secret is null or length(trim(p_target_secret)) not between 1 and 500 then
    raise exception 'INVALID_SECRET' using errcode = '22023';
  end if;
  insert into public.team_secrets(user_id, level_id, target_secret)
    select id, p_level_id, trim(p_target_secret) from public.profiles where is_admin = false
  on conflict (user_id, level_id) do update
    set target_secret = excluded.target_secret, updated_at = now();
  get diagnostics changed = row_count;
  return changed;
end;
$$;
revoke all on function public.set_round_team_secrets(integer, text) from public;
grant execute on function public.set_round_team_secrets(integer, text) to authenticated;

-- Historical guesses have no trustworthy snapshot: deliberately leave them null.
alter table public.submissions add column target_secret_at_submission text;
create or replace function public.record_submission_for_user(
  p_user_id uuid, p_level_id integer, p_submitted_word text,
  p_similarity_score integer, p_awarded_points integer, p_target_secret text
)
returns table(similarity_score integer, awarded_points integer, is_new_best boolean,
  previous_best integer, total_score integer, guess_used boolean)
language plpgsql security definer set search_path = public
as $$
declare new_total integer;
begin
  if p_user_id is null or p_level_id is null or p_level_id not between 1 and 3
     or p_submitted_word is null or length(trim(p_submitted_word)) not between 1 and 500
     or (p_target_secret is not null and length(trim(p_target_secret)) not between 1 and 500) then
    raise exception 'INVALID_SUBMISSION' using errcode = '22023';
  end if;
  if p_similarity_score is null or p_similarity_score not between 0 and 100
     or p_awarded_points is null or p_awarded_points < 0 then
    raise exception 'INVALID_SCORE' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_level_id::text, 0));
  if exists (select 1 from public.submissions s where s.user_id = p_user_id and s.level_id = p_level_id) then
    raise exception 'GUESS_ALREADY_USED' using errcode = '23505';
  end if;
  insert into public.submissions(user_id, level_id, submitted_word, similarity_score,
    awarded_points, target_secret_at_submission)
  values(p_user_id, p_level_id, trim(p_submitted_word), p_similarity_score,
    p_awarded_points, p_target_secret);
  update public.profiles p set total_score = p.total_score + p_awarded_points
    where p.id = p_user_id returning p.total_score into new_total;
  return query select p_similarity_score, p_awarded_points, true, 0, coalesce(new_total, 0), true;
end;
$$;
revoke all on function public.record_submission_for_user(uuid, integer, text, integer, integer, text) from public, anon, authenticated;
grant execute on function public.record_submission_for_user(uuid, integer, text, integer, integer, text) to service_role;

-- Keep the old server compatible during deployment without inventing a snapshot.
create or replace function public.record_submission_for_user(
  p_user_id uuid, p_level_id integer, p_submitted_word text,
  p_similarity_score integer, p_awarded_points integer
)
returns table(similarity_score integer, awarded_points integer, is_new_best boolean,
  previous_best integer, total_score integer, guess_used boolean)
language sql security definer set search_path = public
as $$
  select * from public.record_submission_for_user(p_user_id, p_level_id,
    p_submitted_word, p_similarity_score, p_awarded_points, null::text);
$$;

create or replace function public.admin_list_submissions()
returns table(id uuid, user_id uuid, username text, level_id integer,
  submitted_word text, target_secret_at_submission text, similarity_score integer,
  awarded_points integer, created_at timestamptz)
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_current_user_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  return query select s.id, s.user_id, p.username, s.level_id, s.submitted_word,
    s.target_secret_at_submission, s.similarity_score, s.awarded_points, s.created_at
    from public.submissions s join public.profiles p on p.id = s.user_id
    where p.is_admin = false order by s.created_at desc, s.id;
end;
$$;
revoke all on function public.admin_list_submissions() from public;
grant execute on function public.admin_list_submissions() to authenticated;
