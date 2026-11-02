-- Fase 1: identity and character ownership. Run once in Supabase SQL Editor.
create extension if not exists pgcrypto;

create sequence if not exists public.citizen_number_seq start with 1 increment by 1 no cycle;

create table if not exists public.characters (
  user_id uuid primary key references auth.users(id) on delete cascade,
  citizen_number bigint not null unique default nextval('public.citizen_number_seq'),
  display_name text not null check (char_length(display_name) between 2 and 24),
  age smallint not null check (age between 18 and 99),
  bio text not null default '' check (char_length(bio) <= 120),
  model_id text not null check (model_id ~ '^(female|male)-(0[1-9]|1[0-9]|2[0-5])$'),
  gender text generated always as (split_part(model_id, '-', 1)) stored,
  avatar_color text not null,
  home_region text not null default 'Wilayah 1',
  created_at timestamptz not null default now()
);

alter table public.characters enable row level security;
drop policy if exists "characters visible to signed-in players" on public.characters;
create policy "characters visible to signed-in players" on public.characters
  for select to authenticated using (true);
-- Creation is only through the RPC. No direct client writes are granted.
revoke insert, update, delete on public.characters from anon, authenticated;
grant select on public.characters to authenticated;

create or replace function public.create_character(
  p_display_name text, p_age smallint, p_bio text, p_model_id text
) returns public.characters
language plpgsql security definer set search_path = '' as $$
declare result public.characters;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if char_length(trim(p_display_name)) not between 2 and 24 then raise exception 'Name must be 2 to 24 characters'; end if;
  if p_age not between 18 and 99 then raise exception 'Age must be between 18 and 99'; end if;
  if char_length(coalesce(p_bio, '')) > 120 then raise exception 'Bio is too long'; end if;
  if p_model_id !~ '^(female|male)-(0[1-9]|1[0-9]|2[0-5])$' then raise exception 'Choose one of the 50 available models'; end if;

  insert into public.characters(user_id, display_name, age, bio, model_id, avatar_color)
  values (
    auth.uid(), trim(p_display_name), p_age, coalesce(trim(p_bio), ''), p_model_id,
    case when split_part(p_model_id, '-', 1) = 'female' then '#d98b71' else '#7d9b70' end
  ) returning * into result;
  return result;
exception when unique_violation then
  raise exception 'This account already has a character';
end;
$$;
revoke all on function public.create_character(text, smallint, text, text) from public, anon;
grant execute on function public.create_character(text, smallint, text, text) to authenticated;

-- Private channel authorization for world presence and position broadcasts.
drop policy if exists "signed-in players can read world channel" on realtime.messages;
create policy "signed-in players can read world channel" on realtime.messages
  for select to authenticated using (realtime.topic() = 'world:1');
drop policy if exists "signed-in players can write world channel" on realtime.messages;
create policy "signed-in players can write world channel" on realtime.messages
  for insert to authenticated with check (realtime.topic() = 'world:1');
