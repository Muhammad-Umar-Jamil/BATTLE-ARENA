create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  level_id integer not null references public.guardrails(level_id) on delete cascade,
  submitted_word text not null check (length(trim(submitted_word)) between 1 and 500),
  similarity_score integer not null check (similarity_score between 0 and 100),
  awarded_points integer not null check (awarded_points >= 0),
  created_at timestamptz not null default now()
);
create index if not exists submissions_user_level_idx on public.submissions(user_id, level_id, created_at desc);
alter table public.submissions enable row level security;
revoke all on public.submissions from anon, authenticated;

create or replace function public.record_submission(p_level_id integer,p_submitted_word text,p_similarity_score integer,p_awarded_points integer)
returns table(similarity_score integer,awarded_points integer,is_new_best boolean,previous_best integer,total_score integer)
language plpgsql security definer set search_path = public
as $$
declare old_best integer; new_total integer; inserted_id uuid;
begin
  if auth.uid() is null or p_level_id not between 1 and 3 or p_submitted_word is null or length(trim(p_submitted_word)) not between 1 and 500 then raise exception 'INVALID_SUBMISSION'; end if;
  if p_similarity_score not between 0 and 100 or p_awarded_points < 0 then raise exception 'INVALID_SCORE'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':' || p_level_id::text, 0));
  select coalesce(max(s.awarded_points),0) into old_best from public.submissions s where s.user_id=auth.uid() and s.level_id=p_level_id;
  insert into public.submissions(user_id,level_id,submitted_word,similarity_score,awarded_points) values(auth.uid(),p_level_id,trim(p_submitted_word),p_similarity_score,p_awarded_points) returning id into inserted_id;
  if p_awarded_points > old_best then
    update public.profiles set total_score=total_score + p_awarded_points - old_best where id=auth.uid() returning total_score into new_total;
  else
    select total_score into new_total from public.profiles where id=auth.uid();
  end if;
  return query select p_similarity_score,p_awarded_points,p_awarded_points > old_best,old_best,new_total;
end; $$;

create or replace function public.list_submissions(p_level_id integer)
returns table(id uuid,submitted_word text,similarity_score integer,awarded_points integer,created_at timestamptz)
language plpgsql stable security definer set search_path=public
as $$ begin
  if auth.uid() is null or p_level_id not between 1 and 3 then raise exception 'UNAUTHORIZED'; end if;
  return query select s.id,s.submitted_word,s.similarity_score,s.awarded_points,s.created_at from public.submissions s where s.user_id=auth.uid() and s.level_id=p_level_id order by s.created_at desc limit 50;
end; $$;

create or replace function public.public_leaderboard()
returns table(rank bigint,username text,total_score integer)
language sql stable security definer set search_path=public
as $$
  select row_number() over(order by p.total_score desc,p.username asc),p.username,p.total_score from public.profiles p where p.is_admin=false order by p.total_score desc,p.username asc;
$$;
revoke all on function public.record_submission(integer,text,integer,integer), public.list_submissions(integer), public.public_leaderboard() from public;
grant execute on function public.record_submission(integer,text,integer,integer), public.list_submissions(integer), public.public_leaderboard() to authenticated;
