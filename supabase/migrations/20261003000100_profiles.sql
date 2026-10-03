create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  total_score integer not null default 0 check (total_score >= 0),
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (new.id, coalesce(nullif(new.raw_user_meta_data ->> 'username', ''), split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;

drop policy if exists profiles_read_own on public.profiles;
create policy profiles_read_own on public.profiles
for select to authenticated
using (auth.uid() = id);

revoke all on public.profiles from anon;
grant select on public.profiles to authenticated;
