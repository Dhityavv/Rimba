-- Run this in the Supabase SQL Editor before starting Rimba.
-- Includes:
-- 1. Reset all existing character data & restart citizen sequence at 1
-- 2. Automatic Region placement (20 registered characters per region: Wilayah 1, Wilayah 2, ...)
-- 3. Region traveling RPC (travel_to_region)
-- 4. Admin Reset RPC (reset_all_characters)
-- 5. Starter Sword (Pedang Pemula Rimba / Rimba Beginner Sword) granted atomically on character creation
-- 6. Realtime policies for region:1, region:2, ... channels

-- Wipe existing test characters and restart sequence at 1
truncate table if exists public.characters cascade;
drop sequence if exists public.citizen_number_seq cascade;
create sequence public.citizen_number_seq start with 1 minvalue 1;

create table if not exists public.characters (
  user_id uuid primary key references auth.users(id) on delete cascade,
  citizen_number bigint not null unique default nextval('public.citizen_number_seq'),
  display_name text not null check (char_length(trim(display_name)) between 2 and 20),
  age integer not null check (age between 18 and 99),
  bio text not null default '' check (char_length(bio) <= 120),
  model_id text not null check (model_id ~ '^(female|male)-(0[1-9]|10)$'),
  gender text not null check (gender in ('female', 'male')),
  avatar_color text not null default '#5f9e6e' check (avatar_color ~ '^#[0-9a-fA-F]{6}$'),
  outfit_id text not null default 'tunika-rimba',
  hat_id text not null default 'none',
  residence_status text not null default 'Warga' check (residence_status in ('Warga', 'Penduduk')),
  home_region text not null default 'Wilayah 1',
  starter_sword_id text not null default 'sword_beginner_rimba',
  created_at timestamptz not null default now()
);

alter table public.characters enable row level security;

drop policy if exists "signed-in players can read characters" on public.characters;
create policy "signed-in players can read characters" on public.characters
  for select to anon, authenticated using (true);

revoke insert, update, delete on public.characters from anon, authenticated;
grant select on public.characters to anon, authenticated;

-- Atomic region assignment based on 20 registered characters per region:
-- Citizen 001..020 -> Wilayah 1
-- Citizen 021..040 -> Wilayah 2
-- Citizen 041..060 -> Wilayah 3
create or replace function public.assign_region_by_capacity()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_region_idx integer := 1;
  v_count integer := 0;
begin
  loop
    select count(*) into v_count
    from public.characters
    where home_region = ('Wilayah ' || v_region_idx);

    if v_count < 20 then
      return 'Wilayah ' || v_region_idx;
    end if;

    v_region_idx := v_region_idx + 1;
  end loop;
end;
$$;

create or replace function public.travel_to_region(p_region text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  update public.characters
  set home_region = trim(p_region)
  where user_id = v_user_id;
  return trim(p_region);
end;
$$;

grant execute on function public.travel_to_region(text) to authenticated;

-- Emergency / Admin reset RPC that can be called anytime to reset data to 0
create or replace function public.reset_all_characters()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  truncate table public.characters cascade;
  perform setval('public.citizen_number_seq', 1, false);
  return jsonb_build_object('success', true, 'message', 'All characters reset, next citizen is #001');
end;
$$;

grant execute on function public.reset_all_characters() to anon, authenticated;

create or replace function public.create_character(
  p_display_name text,
  p_age integer,
  p_bio text,
  p_model_id text
)
returns public.characters
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing public.characters%rowtype;
  v_result public.characters%rowtype;
  v_region text;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  -- Lock per user and global character creation so region capacity (20) and starter sword are 100% atomic & idempotent
  perform pg_advisory_xact_lock(hashtextextended('rimba:create-character-lock', 0));

  -- Auto-heal: If table has 0 characters, ensure sequence starts at 1
  if not exists (select 1 from public.characters) then
    perform setval('public.citizen_number_seq', 1, false);
  end if;

  -- Idempotency: if character already exists on retry, return existing character without duplicating starter sword
  select * into v_existing from public.characters where user_id = v_user_id;
  if found then
    return v_existing;
  end if;

  v_region := public.assign_region_by_capacity();

  insert into public.characters (
    user_id,
    display_name,
    age,
    bio,
    model_id,
    gender,
    avatar_color,
    home_region,
    starter_sword_id
  )
  values (
    v_user_id,
    trim(p_display_name),
    p_age,
    coalesce(trim(p_bio), ''),
    p_model_id,
    case when p_model_id like 'female-%' then 'female' else 'male' end,
    case when p_model_id like 'female-%' then '#4c956c' else '#3d7ea6' end,
    v_region,
    'sword_beginner_rimba'
  )
  returning * into v_result;

  return v_result;
end;
$$;

revoke all on function public.create_character(text, integer, text, text) from public, anon;
grant execute on function public.create_character(text, integer, text, text) to authenticated;

-- Realtime policies for regional channels (region:1, region:2, etc.)
drop policy if exists "authenticated can receive world:1" on realtime.messages;
drop policy if exists "authenticated can send world:1" on realtime.messages;
drop policy if exists "players can receive region channels" on realtime.messages;
drop policy if exists "players can send region channels" on realtime.messages;

create policy "players can receive region channels" on realtime.messages
  for select to anon, authenticated
  using (realtime.topic() like 'region:%' or realtime.topic() = 'world:1');

create policy "players can send region channels" on realtime.messages
  for insert to anon, authenticated
  with check (realtime.topic() like 'region:%' or realtime.topic() = 'world:1');
