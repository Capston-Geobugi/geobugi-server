-- Room creation backend for the room-based score sharing MVP.
-- Run this in the Supabase SQL Editor after the existing profiles schema exists.

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 40),
  invite_code text not null unique check (invite_code ~ '^[A-Z0-9]{8}$'),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.room_members (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create index if not exists idx_rooms_created_by
  on public.rooms (created_by);

create index if not exists idx_rooms_invite_code
  on public.rooms (invite_code);

create index if not exists idx_room_members_user_id
  on public.room_members (user_id);

alter table public.rooms enable row level security;
alter table public.room_members enable row level security;

drop policy if exists "Rooms are readable by authenticated users" on public.rooms;
drop policy if exists "Users can create rooms" on public.rooms;

create policy "Rooms are readable by authenticated users"
  on public.rooms
  for select
  to authenticated
  using (true);

create policy "Users can create rooms"
  on public.rooms
  for insert
  to authenticated
  with check (auth.uid() = created_by);

drop policy if exists "Room members are readable by authenticated users" on public.room_members;
drop policy if exists "Users can join rooms as themselves" on public.room_members;

create policy "Room members are readable by authenticated users"
  on public.room_members
  for select
  to authenticated
  using (true);

create policy "Users can join rooms as themselves"
  on public.room_members
  for insert
  to authenticated
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

drop trigger if exists set_rooms_updated_at on public.rooms;
create trigger set_rooms_updated_at
before update on public.rooms
for each row
execute function public.set_updated_at();

create or replace function public.create_room(room_name text)
returns table (
  id uuid,
  name text,
  invite_code text,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_room_name text := trim(room_name);
  generated_invite_code text;
  created_room public.rooms%rowtype;
begin
  if current_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  if normalized_room_name is null or normalized_room_name = '' then
    raise exception 'Room name is required.';
  end if;

  if char_length(normalized_room_name) > 40 then
    raise exception 'Room name must be 40 characters or fewer.';
  end if;

  loop
    generated_invite_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

    begin
      insert into public.rooms (name, invite_code, created_by)
      values (normalized_room_name, generated_invite_code, current_user_id)
      returning * into created_room;

      exit;
    exception
      when unique_violation then
        -- Extremely unlikely, but retry if the generated invite code already exists.
    end;
  end loop;

  insert into public.room_members (room_id, user_id)
  values (created_room.id, current_user_id)
  on conflict (room_id, user_id) do nothing;

  return query
  select
    created_room.id,
    created_room.name,
    created_room.invite_code,
    created_room.created_by,
    created_room.created_at,
    created_room.updated_at;
end;
$$;

revoke all on function public.create_room(text) from public;
grant execute on function public.create_room(text) to authenticated;
