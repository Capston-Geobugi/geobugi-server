-- Own room list lookup for the room-based score sharing MVP.
-- Run this in the Supabase SQL Editor after 003_rooms.sql and 001_profiles_daily_scores.sql.

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
