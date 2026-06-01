-- Own daily posture score upsert for the room-based score sharing MVP.
-- Run this in the Supabase SQL Editor after the existing daily_posture_scores schema.

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

  insert into public.daily_posture_scores as dps (
    user_id,
    score_date,
    average_score,
    sample_count,
    total_duration_sec
  )
  values (
    current_user_id,
    target_score_date,
    round(target_average_score, 2),
    target_sample_count,
    target_total_duration_sec
  )
  on conflict on constraint daily_posture_scores_user_id_score_date_key do update
    set average_score = excluded.average_score,
        sample_count = excluded.sample_count,
        total_duration_sec = excluded.total_duration_sec
  returning dps.* into saved_score;

  return query
  select
    saved_score.id,
    saved_score.user_id,
    saved_score.score_date,
    saved_score.average_score,
    saved_score.sample_count,
    saved_score.total_duration_sec,
    saved_score.created_at,
    saved_score.updated_at;
end;
$$;

revoke all on function public.upsert_my_daily_posture_score(date, numeric, integer, integer) from public;
grant execute on function public.upsert_my_daily_posture_score(date, numeric, integer, integer) to authenticated;
