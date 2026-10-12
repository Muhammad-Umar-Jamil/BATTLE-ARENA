-- Explicitly secure both recording signatures, including upgraded databases.
revoke all on function public.record_submission_for_user(uuid, integer, text, integer, integer) from public, anon, authenticated;
grant execute on function public.record_submission_for_user(uuid, integer, text, integer, integer) to service_role;
