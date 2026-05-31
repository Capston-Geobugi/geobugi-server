-- Existing social score baseline schema.
-- This file documents the Supabase schema that must exist before room MVP migrations.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 1 and 30),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.daily_posture_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  score_date date not null,
  average_score numeric(5, 2) not null check (average_score >= 0 and average_score <= 100),
  sample_count integer not null default 0 check (sample_count >= 0),
  total_duration_sec integer not null default 0 check (total_duration_sec >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, score_date)
);

create index if not exists idx_daily_posture_scores_score_date_average_score
  on public.daily_posture_scores (score_date, average_score desc);

create index if not exists idx_daily_posture_scores_user_id_score_date
  on public.daily_posture_scores (user_id, score_date);

alter table public.profiles enable row level security;
alter table public.daily_posture_scores enable row level security;

drop policy if exists "Profiles are readable by authenticated users" on public.profiles;
drop policy if exists "Users can insert own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;

create policy "Profiles are readable by authenticated users"
  on public.profiles
  for select
  to authenticated
  using (true);

create policy "Users can insert own profile"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "Daily scores are readable by authenticated users" on public.daily_posture_scores;
drop policy if exists "Users can insert own daily scores" on public.daily_posture_scores;
drop policy if exists "Users can update own daily scores" on public.daily_posture_scores;

create policy "Daily scores are readable by authenticated users"
  on public.daily_posture_scores
  for select
  to authenticated
  using (true);

create policy "Users can insert own daily scores"
  on public.daily_posture_scores
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update own daily scores"
  on public.daily_posture_scores
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

drop trigger if exists set_daily_posture_scores_updated_at on public.daily_posture_scores;
create trigger set_daily_posture_scores_updated_at
before update on public.daily_posture_scores
for each row
execute function public.set_updated_at();

create or replace view public.daily_posture_rankings as
select
  s.score_date,
  s.user_id,
  p.display_name,
  s.average_score,
  s.sample_count,
  s.total_duration_sec,
  rank() over (
    partition by s.score_date
    order by s.average_score desc, s.total_duration_sec desc, s.updated_at asc
  ) as rank,
  s.updated_at
from public.daily_posture_scores s
join public.profiles p on p.id = s.user_id;
