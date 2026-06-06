-- Shared posture score migration.
-- Run this in the Supabase SQL Editor after 001, 005, 006, and 007 have been applied.
-- Formula: shared_score = average_score * 0.7 + duration_score * 0.3
-- duration_score reaches 100 at 6 hours of measured time per day.

alter table public.daily_posture_scores
add column if not exists duration_score numeric(5, 2) check (
  duration_score is null or (duration_score >= 0 and duration_score <= 100)
);

alter table public.daily_posture_scores
add column if not exists shared_score numeric(5, 2) check (
  shared_score is null or (shared_score >= 0 and shared_score <= 100)
);

create index if not exists idx_daily_posture_scores_score_date_shared_score
  on public.daily_posture_scores (score_date, shared_score desc);

update public.daily_posture_scores
set
  duration_score = round((least(total_duration_sec::numeric / 21600, 1) * 100), 2),
  shared_score = round(
    (
      average_score * 0.7
      + round((least(total_duration_sec::numeric / 21600, 1) * 100), 2) * 0.3
    ),
    2
  )
where average_score is not null;

drop function if exists public.upsert_my_daily_posture_score(date, numeric, integer, integer);

create or replace function public.upsert_my_daily_posture_score(
  target_score_date date default current_date,
  target_average_score numeric default null,
  target_sample_count integer default 0,
  target_total_duration_sec integer default 0
)
returns table (
  id uuid,
  user_id uuid,
  score_date date,
  average_score numeric,
  duration_score numeric,
  shared_score numeric,
  sample_count integer,
  total_duration_sec integer,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  saved_score public.daily_posture_scores%rowtype;
  normalized_duration_score numeric(5, 2);
  normalized_shared_score numeric(5, 2);
begin
  if current_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  if target_score_date is null then
    raise exception 'Score date is required.';
  end if;

  if target_average_score is null then
    raise exception 'Average score is required.';
  end if;

  if target_average_score < 0 or target_average_score > 100 then
    raise exception 'Average score must be between 0 and 100.';
  end if;

  if target_sample_count is null or target_sample_count < 0 then
    raise exception 'Sample count must be 0 or greater.';
  end if;

  if target_total_duration_sec is null or target_total_duration_sec < 0 then
    raise exception 'Total duration must be 0 or greater.';
  end if;

  normalized_duration_score :=
    round((least(target_total_duration_sec::numeric / 21600, 1) * 100), 2);
  normalized_shared_score :=
    round(((target_average_score * 0.7) + (normalized_duration_score * 0.3)), 2);

  insert into public.daily_posture_scores as dps (
    user_id,
    score_date,
    average_score,
    duration_score,
    shared_score,
    sample_count,
    total_duration_sec
  )
  values (
    current_user_id,
    target_score_date,
    round(target_average_score, 2),
    normalized_duration_score,
    normalized_shared_score,
    target_sample_count,
    target_total_duration_sec
  )
  on conflict on constraint daily_posture_scores_user_id_score_date_key do update
    set average_score = excluded.average_score,
        duration_score = excluded.duration_score,
        shared_score = excluded.shared_score,
        sample_count = excluded.sample_count,
        total_duration_sec = excluded.total_duration_sec
  returning dps.* into saved_score;

  return query
  select
    saved_score.id,
    saved_score.user_id,
    saved_score.score_date,
    saved_score.average_score,
    saved_score.duration_score,
    saved_score.shared_score,
    saved_score.sample_count,
    saved_score.total_duration_sec,
    saved_score.created_at,
    saved_score.updated_at;
end;
$$;

revoke all on function public.upsert_my_daily_posture_score(date, numeric, integer, integer) from public;
grant execute on function public.upsert_my_daily_posture_score(date, numeric, integer, integer) to authenticated;

drop function if exists public.get_room_daily_scores(uuid, date);

create or replace function public.get_room_daily_scores(
  target_room_id uuid,
  target_score_date date default current_date
)
returns table (
  room_id uuid,
  user_id uuid,
  display_name text,
  score_date date,
  average_score numeric,
  duration_score numeric,
  shared_score numeric,
  sample_count integer,
  total_duration_sec integer,
  score_updated_at timestamptz,
  joined_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  is_room_member boolean;
begin
  if current_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  if target_room_id is null then
    raise exception 'Room id is required.';
  end if;

  select exists (
    select 1
    from public.room_members
    where room_members.room_id = target_room_id
      and room_members.user_id = current_user_id
  )
  into is_room_member;

  if not is_room_member then
    raise exception 'Only room members can read room scores.';
  end if;

  return query
  select
    rm.room_id,
    rm.user_id,
    p.display_name,
    target_score_date as score_date,
    s.average_score,
    s.duration_score,
    s.shared_score,
    coalesce(s.sample_count, 0) as sample_count,
    coalesce(s.total_duration_sec, 0) as total_duration_sec,
    s.updated_at as score_updated_at,
    rm.joined_at
  from public.room_members rm
  join public.profiles p
    on p.id = rm.user_id
  left join public.daily_posture_scores s
    on s.user_id = rm.user_id
   and s.score_date = target_score_date
  where rm.room_id = target_room_id
  order by
    coalesce(s.shared_score, s.average_score) desc nulls last,
    s.total_duration_sec desc nulls last,
    rm.joined_at asc;
end;
$$;

revoke all on function public.get_room_daily_scores(uuid, date) from public;
grant execute on function public.get_room_daily_scores(uuid, date) to authenticated;

drop function if exists public.get_my_rooms(date);

create or replace function public.get_my_rooms(
  target_score_date date default current_date
)
returns table (
  id uuid,
  name text,
  invite_code text,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  joined_at timestamptz,
  member_count integer,
  my_score_date date,
  my_average_score numeric,
  my_duration_score numeric,
  my_shared_score numeric,
  my_sample_count integer,
  my_total_duration_sec integer,
  my_score_updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  if target_score_date is null then
    raise exception 'Score date is required.';
  end if;

  return query
  select
    r.id,
    r.name,
    r.invite_code,
    r.created_by,
    r.created_at,
    r.updated_at,
    my_rm.joined_at,
    room_counts.member_count,
    target_score_date as my_score_date,
    my_score.average_score as my_average_score,
    my_score.duration_score as my_duration_score,
    my_score.shared_score as my_shared_score,
    coalesce(my_score.sample_count, 0) as my_sample_count,
    coalesce(my_score.total_duration_sec, 0) as my_total_duration_sec,
    my_score.updated_at as my_score_updated_at
  from public.room_members my_rm
  join public.rooms r
    on r.id = my_rm.room_id
  join lateral (
    select count(*)::integer as member_count
    from public.room_members count_rm
    where count_rm.room_id = my_rm.room_id
  ) room_counts on true
  left join public.daily_posture_scores my_score
    on my_score.user_id = current_user_id
   and my_score.score_date = target_score_date
  where my_rm.user_id = current_user_id
  order by my_rm.joined_at desc, r.created_at desc;
end;
$$;

revoke all on function public.get_my_rooms(date) from public;
grant execute on function public.get_my_rooms(date) to authenticated;

drop view if exists public.daily_posture_rankings;

create or replace view public.daily_posture_rankings as
select
  s.score_date,
  s.user_id,
  p.display_name,
  s.average_score,
  s.duration_score,
  s.shared_score,
  s.sample_count,
  s.total_duration_sec,
  rank() over (
    partition by s.score_date
    order by coalesce(s.shared_score, s.average_score) desc, s.total_duration_sec desc, s.updated_at asc
  ) as rank,
  s.updated_at
from public.daily_posture_scores s
join public.profiles p on p.id = s.user_id;
