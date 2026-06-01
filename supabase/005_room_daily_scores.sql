-- Room member daily score lookup for the room-based score sharing MVP.
-- Run this in the Supabase SQL Editor after 003_rooms.sql and the existing daily_posture_scores schema.

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
    s.average_score desc nulls last,
    s.total_duration_sec desc nulls last,
    rm.joined_at asc;
end;
$$;

revoke all on function public.get_room_daily_scores(uuid, date) from public;
grant execute on function public.get_room_daily_scores(uuid, date) to authenticated;
