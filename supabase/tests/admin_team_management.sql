-- Runs against the actual linked database. Every mutation is rolled back.
begin;
do $$
declare
  team_a uuid := gen_random_uuid();
  team_b uuid := gen_random_uuid();
  admin_id uuid;
  before_other_rounds jsonb;
  after_other_rounds jsonb;
  before_existing jsonb;
  affected integer;
begin
  select id into admin_id from public.profiles where is_admin = true limit 1;
  if admin_id is null then raise exception 'Test requires an existing admin'; end if;
  insert into auth.users(id, email, raw_user_meta_data)
  values(team_a, team_a::text || '@example.test', jsonb_build_object('username', 'E2E-ROLLBACK-' || team_a)),
        (team_b, team_b::text || '@example.test', jsonb_build_object('username', 'E2E-ROLLBACK-' || team_b));
  perform set_config('request.jwt.claim.sub', team_a::text, true);
  begin
    perform public.set_round_team_secrets(1, 'unauthorized');
    raise exception 'Participant changed shared words';
  exception when insufficient_privilege then null; end;
  begin
    perform public.admin_list_submissions();
    raise exception 'Participant read admin guesses';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub', '', true);
  begin
    perform public.admin_list_submissions();
    raise exception 'Unauthenticated caller read admin guesses';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  begin
    perform public.set_round_team_secrets(4, 'invalid');
    raise exception 'Invalid round accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.set_round_team_secrets(null, 'invalid');
    raise exception 'Null round accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.set_round_team_secrets(1, '   ');
    raise exception 'Blank word accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.set_round_team_secrets(1, repeat('a', 501));
    raise exception 'Oversized word accepted';
  exception when invalid_parameter_value then null; end;

  select jsonb_agg(to_jsonb(s) order by s.id) into before_other_rounds
    from public.team_secrets s where level_id in (2, 3);
  affected := public.set_round_team_secrets(1, '  E2E-Round-One  ');
  if affected <> (select count(*) from public.profiles where is_admin = false) then
    raise exception 'Incorrect affected team count';
  end if;
  if exists(select 1 from public.profiles p where not p.is_admin and not exists
    (select 1 from public.team_secrets s where s.user_id = p.id and s.level_id = 1 and s.target_secret = 'E2E-Round-One')) then
    raise exception 'Round 1 did not update every team';
  end if;
  select jsonb_agg(to_jsonb(s) order by s.id) into after_other_rounds
    from public.team_secrets s where level_id in (2, 3);
  if before_other_rounds is distinct from after_other_rounds then raise exception 'Other rounds changed'; end if;
  for affected in 2..3 loop
    perform public.set_round_team_secrets(affected, 'E2E-Round-' || affected);
  end loop;
  if (select count(*) from public.team_secrets where user_id = team_a) <> 3
    or (select target_secret from public.team_secrets where user_id = team_b and level_id = 2) <> 'E2E-Round-2'
    or (select target_secret from public.team_secrets where user_id = team_b and level_id = 3) <> 'E2E-Round-3' then
    raise exception 'Round 2/3 assignment failed';
  end if;
  perform public.record_submission_for_user(team_a, 1, 'E2E-Round-One', 100, 123, 'E2E-Round-One');
  perform public.save_team_secret(team_a, 1, 'E2E-Changed');
  if not exists(select 1 from public.admin_list_submissions() s where s.user_id = team_a
    and s.target_secret_at_submission = 'E2E-Round-One' and s.submitted_word = 'E2E-Round-One'
    and s.awarded_points = 123 and s.created_at is not null) then
    raise exception 'Original word snapshot or admin result incorrect';
  end if;
  if (select total_score from public.profiles where id = team_a) <> 123 then raise exception 'Score changed'; end if;
  perform public.record_submission_for_user(team_b, 1, 'Legacy guess', 0, 0);
  if not exists(select 1 from public.admin_list_submissions() s where s.user_id = team_b
    and s.target_secret_at_submission is null) then raise exception 'Legacy guess has an invented original word'; end if;
  begin
    perform public.record_submission_for_user(team_a, 1, 'again', 100, 123, 'E2E-Changed');
    raise exception 'Duplicate guess accepted';
  exception when unique_violation then null; end;
  perform set_config('request.jwt.claim.sub', team_a::text, true);
  if exists(select 1 from jsonb_array_elements(to_jsonb(array(select s from public.list_submissions(1) s))) row
    where row ? 'target_secret_at_submission') then raise exception 'Participant RPC exposes original word'; end if;
  if has_table_privilege('authenticated', 'public.submissions', 'SELECT')
    or has_function_privilege('authenticated', 'public.record_submission_for_user(uuid,integer,text,integer,integer,text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.record_submission_for_user(uuid,integer,text,integer,integer)', 'EXECUTE') then
    raise exception 'Participant can bypass protected APIs';
  end if;
  insert into public.chat_messages(user_id, level_id, role, content, deleted_at)
    values(team_a, 1, 'user', 'Active test chat', null), (team_a, 1, 'assistant', 'Archived test chat', now());
  select jsonb_agg(to_jsonb(s) order by s.id) into before_existing
    from public.submissions s where user_id <> team_a;
  delete from auth.users where id = team_a;
  if exists(select 1 from public.profiles where id = team_a)
    or exists(select 1 from public.team_secrets where user_id = team_a)
    or exists(select 1 from public.submissions where user_id = team_a)
    or exists(select 1 from public.chat_messages where user_id = team_a) then
    raise exception 'Team deletion left related data';
  end if;
  if not exists(select 1 from public.profiles where id = team_b) then raise exception 'Other team deleted'; end if;
  if before_existing is distinct from (select jsonb_agg(to_jsonb(s) order by s.id) from public.submissions s where user_id <> team_a) then
    raise exception 'Other submissions changed';
  end if;
end;
$$;
rollback;
select 'PASS: authorization, validation, three-round isolation, snapshot, score, duplicate lock, participant secrecy and complete deletion cascade; all test writes rolled back' as result;
