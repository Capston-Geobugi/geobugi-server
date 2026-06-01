-- Invite-code room join backend for the room-based score sharing MVP.
-- Run this in the Supabase SQL Editor after 003_rooms.sql.

create or replace function public.join_room(room_invite_code text)
returns table (
  id uuid,
  name text,
  invite_code text,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  joined_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_invite_code text := upper(trim(room_invite_code));
  target_room public.rooms%rowtype;
  membership_joined_at timestamptz;
begin
  if current_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  if normalized_invite_code is null or normalized_invite_code = '' then
    raise exception 'Invite code is required.';
  end if;

  select r.*
  into target_room
  from public.rooms r
  where r.invite_code = normalized_invite_code;

  if target_room.id is null then
    raise exception 'Room invite code was not found.';
  end if;

  insert into public.room_members (room_id, user_id)
  values (target_room.id, current_user_id)
  on conflict (room_id, user_id) do update
    set joined_at = public.room_members.joined_at
  returning room_members.joined_at into membership_joined_at;

  return query
  select
    target_room.id,
    target_room.name,
    target_room.invite_code,
    target_room.created_by,
    target_room.created_at,
    target_room.updated_at,
    membership_joined_at;
end;
$$;

revoke all on function public.join_room(text) from public;
grant execute on function public.join_room(text) to authenticated;
