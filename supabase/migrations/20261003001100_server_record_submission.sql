create or replace function public.record_submission_for_user(
  p_user_id uuid,
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
  if p_user_id is null or p_level_id not between 1 and 3
     or p_submitted_word is null
     or length(trim(p_submitted_word)) not between 1 and 500 then
    raise exception 'INVALID_SUBMISSION' using errcode = '22023';
  end if;
  if p_similarity_score not between 0 and 100 or p_awarded_points < 0 then
    raise exception 'INVALID_SCORE' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_level_id::text, 0));
  if exists (select 1 from public.submissions where user_id = p_user_id and level_id = p_level_id) then
    raise exception 'GUESS_ALREADY_USED' using errcode = '23505';
  end if;

  insert into public.submissions(user_id, level_id, submitted_word, similarity_score, awarded_points)
  values (p_user_id, p_level_id, trim(p_submitted_word), p_similarity_score, p_awarded_points);

  update public.profiles set total_score = total_score + p_awarded_points
  where id = p_user_id
  returning total_score into new_total;

  return query select p_similarity_score, p_awarded_points, true, 0, coalesce(new_total, 0), true;
end;
$$;

revoke all on function public.record_submission_for_user(uuid, integer, text, integer, integer) from public;
grant execute on function public.record_submission_for_user(uuid, integer, text, integer, integer) to service_role;
