-- Fase 2 upgrade: harvesting, server-checked placement, inventory, and market.
-- Run after migration.sql in the Supabase SQL Editor.

create table if not exists public.player_inventories (
  user_id uuid primary key references public.characters(user_id) on delete cascade,
  wood bigint not null default 0 check (wood >= 0),
  stone bigint not null default 0 check (stone >= 0),
  coins bigint not null default 100 check (coins >= 0),
  updated_at timestamptz not null default now()
);

create or replace function public.initialize_player_inventory()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.player_inventories(user_id) values (new.user_id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists initialize_player_inventory on public.characters;
create trigger initialize_player_inventory
  after insert on public.characters
  for each row execute function public.initialize_player_inventory();

insert into public.player_inventories(user_id)
select user_id from public.characters
on conflict (user_id) do nothing;

alter table public.player_inventories enable row level security;
drop policy if exists "players can read their own inventory" on public.player_inventories;
create policy "players can read their own inventory" on public.player_inventories
  for select to authenticated using (user_id = (select auth.uid()));
revoke insert, update, delete on public.player_inventories from anon, authenticated;
grant select on public.player_inventories to authenticated;

create table if not exists public.player_positions (
  user_id uuid primary key references public.characters(user_id) on delete cascade,
  tile_x double precision not null check (tile_x between 0 and 37),
  tile_y double precision not null check (tile_y between 0 and 37),
  updated_at timestamptz not null default now()
);

alter table public.player_positions enable row level security;
drop policy if exists "players can read their own position" on public.player_positions;
create policy "players can read their own position" on public.player_positions
  for select to authenticated using (user_id = (select auth.uid()));
revoke insert, update, delete on public.player_positions from anon, authenticated;
grant select on public.player_positions to authenticated;

create table if not exists public.resource_nodes (
  id text primary key,
  resource_type text not null check (resource_type in ('wood', 'stone')),
  tile_x integer not null check (tile_x between 0 and 37),
  tile_y integer not null check (tile_y between 0 and 37),
  remaining integer not null check (remaining >= 0),
  yield_amount integer not null check (yield_amount > 0),
  unique (tile_x, tile_y)
);

alter table public.resource_nodes enable row level security;
drop policy if exists "signed-in players can read resource nodes" on public.resource_nodes;
create policy "signed-in players can read resource nodes" on public.resource_nodes
  for select to authenticated using (true);
revoke insert, update, delete on public.resource_nodes from anon, authenticated;
grant select on public.resource_nodes to authenticated;

insert into public.resource_nodes(id, resource_type, tile_x, tile_y, remaining, yield_amount)
values
  ('wood-1', 'wood', 5, 12, 80, 2),
  ('wood-2', 'wood', 8, 22, 80, 2),
  ('wood-3', 'wood', 25, 18, 80, 2),
  ('stone-1', 'stone', 9, 27, 60, 2),
  ('stone-2', 'stone', 24, 25, 60, 2)
on conflict (id) do nothing;

create table if not exists public.player_harvest_cooldowns (
  user_id uuid primary key references public.characters(user_id) on delete cascade,
  last_harvest_at timestamptz not null default '-infinity'::timestamptz
);
alter table public.player_harvest_cooldowns enable row level security;
revoke all on public.player_harvest_cooldowns from public, anon, authenticated;

create or replace function public.is_water_tile(p_x double precision, p_y double precision)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_x > 28 and p_y > 20 + sin(p_x * 0.53) * 2;
$$;
revoke all on function public.is_water_tile(double precision, double precision) from public, anon, authenticated;

create or replace function public.is_walkable_tile(p_x double precision, p_y double precision)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_x between 0 and 37
    and p_y between 0 and 37
    and not public.is_water_tile(p_x, p_y);
$$;
revoke all on function public.is_walkable_tile(double precision, double precision) from public, anon, authenticated;

create or replace function public.is_generated_tree_tile(p_x integer, p_y integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_x > 1 and p_y > 1
    and not (p_x between 12 and 21 and p_y between 11 and 19)
    and public.is_walkable_tile(p_x, p_y)
    and not public.is_water_tile(p_x + 1, p_y)
    and not public.is_water_tile(p_x - 1, p_y)
    and not public.is_water_tile(p_x, p_y + 1)
    and not public.is_water_tile(p_x, p_y - 1)
    and mod(p_x * 37 + p_y * 73, 17) = 0;
$$;
revoke all on function public.is_generated_tree_tile(integer, integer) from public, anon, authenticated;

create or replace function public.sync_player_position(p_tile_x double precision, p_tile_y double precision)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_position public.player_positions%rowtype;
  v_now timestamptz := clock_timestamp();
  v_elapsed double precision;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.characters where user_id = v_user_id) then
    raise exception 'A citizen character is required';
  end if;
  if p_tile_x is null or p_tile_y is null
    or not public.is_walkable_tile(p_tile_x, p_tile_y) then
    raise exception 'Position is outside walkable land';
  end if;

  select * into v_position
  from public.player_positions
  where user_id = v_user_id
  for update;

  if not found then
    if power(p_tile_x - 16, 2) + power(p_tile_y - 18, 2) > 4 then
      raise exception 'A new character must start in Central';
    end if;
    insert into public.player_positions(user_id, tile_x, tile_y, updated_at)
    values (v_user_id, 16, 18, v_now);
    return;
  end if;

  v_elapsed := greatest(extract(epoch from (v_now - v_position.updated_at)), 0);
  if power(p_tile_x - v_position.tile_x, 2) + power(p_tile_y - v_position.tile_y, 2)
    > power(8 * least(v_elapsed, 3) + 1.5, 2) then
    raise exception 'Movement exceeds the allowed speed';
  end if;

  update public.player_positions
  set tile_x = p_tile_x, tile_y = p_tile_y, updated_at = v_now
  where user_id = v_user_id;
end;
$$;
revoke all on function public.sync_player_position(double precision, double precision) from public, anon;
grant execute on function public.sync_player_position(double precision, double precision) to authenticated;

create or replace function public.gather_resource()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_position public.player_positions%rowtype;
  v_node public.resource_nodes%rowtype;
  v_last_harvest timestamptz;
  v_amount integer;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  select * into v_position from public.player_positions where user_id = v_user_id;
  if not found then raise exception 'Position is not synchronized yet'; end if;

  select * into v_node
  from public.resource_nodes n
  where n.remaining > 0
    and power(n.tile_x - v_position.tile_x, 2) + power(n.tile_y - v_position.tile_y, 2) <= 5
  order by power(n.tile_x - v_position.tile_x, 2) + power(n.tile_y - v_position.tile_y, 2)
  limit 1
  for update skip locked;
  if not found then raise exception 'No resource node nearby'; end if;

  insert into public.player_harvest_cooldowns(user_id) values (v_user_id)
  on conflict (user_id) do nothing;
  select last_harvest_at into v_last_harvest
  from public.player_harvest_cooldowns where user_id = v_user_id for update;
  if clock_timestamp() - v_last_harvest < interval '3 seconds' then
    raise exception 'Please wait before harvesting again';
  end if;

  select least(v_node.yield_amount, v_node.remaining) into v_amount;
  update public.resource_nodes set remaining = remaining - v_amount where id = v_node.id;
  update public.player_inventories
  set wood = wood + case when v_node.resource_type = 'wood' then v_amount else 0 end,
      stone = stone + case when v_node.resource_type = 'stone' then v_amount else 0 end,
      updated_at = now()
  where user_id = v_user_id;
  update public.player_harvest_cooldowns
  set last_harvest_at = clock_timestamp()
  where user_id = v_user_id;

  return jsonb_build_object(
    'resource', v_node.resource_type,
    'amount', v_amount,
    'remaining', v_node.remaining - v_amount
  );
end;
$$;
revoke all on function public.gather_resource() from public, anon;
grant execute on function public.gather_resource() to authenticated;

create table if not exists public.player_buildings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.characters(user_id) on delete cascade,
  building_type text not null check (building_type in ('hut', 'garden')),
  tile_x integer not null check (tile_x between 0 and 37),
  tile_y integer not null check (tile_y between 0 and 37),
  created_at timestamptz not null default now(),
  unique (tile_x, tile_y)
);

alter table public.player_buildings enable row level security;
drop policy if exists "signed-in players can read buildings" on public.player_buildings;
create policy "signed-in players can read buildings" on public.player_buildings
  for select to authenticated using (true);
revoke insert, update, delete on public.player_buildings from anon, authenticated;
grant select on public.player_buildings to authenticated;

create or replace function public.place_building(
  p_building_type text, p_tile_x integer, p_tile_y integer
)
returns public.player_buildings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_position public.player_positions%rowtype;
  v_result public.player_buildings%rowtype;
  v_wood bigint;
  v_stone bigint;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_building_type is null or p_building_type not in ('hut', 'garden') then
    raise exception 'Unknown building type';
  end if;
  if p_tile_x is null or p_tile_y is null
    or not public.is_walkable_tile(p_tile_x, p_tile_y)
    or p_tile_x between 12 and 21 and p_tile_y between 11 and 19
    or public.is_generated_tree_tile(p_tile_x, p_tile_y) then
    raise exception 'That location cannot be built on';
  end if;

  select * into v_position from public.player_positions where user_id = v_user_id;
  if not found then raise exception 'Position is not synchronized yet'; end if;
  if power(p_tile_x - v_position.tile_x, 2) + power(p_tile_y - v_position.tile_y, 2) > 12.25 then
    raise exception 'Move closer to the selected location';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('rimba:player-building-placement', 0));
  if exists (
    select 1 from public.resource_nodes
    where abs(tile_x - p_tile_x) <= 1 and abs(tile_y - p_tile_y) <= 1
  ) or exists (
    select 1 from public.player_buildings
    where abs(tile_x - p_tile_x) <= 1 and abs(tile_y - p_tile_y) <= 1
  ) then
    raise exception 'The selected location is occupied';
  end if;

  select wood, stone into v_wood, v_stone
  from public.player_inventories where user_id = v_user_id for update;
  if p_building_type = 'hut' then
    if v_wood < 30 or v_stone < 5 then raise exception 'A hut costs 30 wood and 5 stone'; end if;
    update public.player_inventories set wood = wood - 30, stone = stone - 5, updated_at = now()
    where user_id = v_user_id;
  else
    if v_wood < 10 or v_stone < 3 then raise exception 'A garden costs 10 wood and 3 stone'; end if;
    update public.player_inventories set wood = wood - 10, stone = stone - 3, updated_at = now()
    where user_id = v_user_id;
  end if;

  insert into public.player_buildings(owner_id, building_type, tile_x, tile_y)
  values (v_user_id, p_building_type, p_tile_x, p_tile_y)
  returning * into v_result;
  return v_result;
exception when unique_violation then
  raise exception 'The selected location is occupied';
end;
$$;
revoke all on function public.place_building(text, integer, integer) from public, anon;
grant execute on function public.place_building(text, integer, integer) to authenticated;

create table if not exists public.market_listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.characters(user_id) on delete cascade,
  buyer_id uuid references public.characters(user_id) on delete set null,
  resource_type text not null check (resource_type in ('wood', 'stone')),
  quantity integer not null check (quantity between 1 and 1000),
  unit_price bigint not null check (unit_price between 1 and 100000),
  status text not null default 'open' check (status in ('open', 'sold', 'cancelled')),
  created_at timestamptz not null default now()
);

create index if not exists market_listings_open_created_idx
  on public.market_listings(created_at desc) where status = 'open';
alter table public.market_listings enable row level security;
drop policy if exists "players can read open and related listings" on public.market_listings;
create policy "players can read open and related listings" on public.market_listings
  for select to authenticated
  using (status = 'open' or seller_id = (select auth.uid()) or buyer_id = (select auth.uid()));
revoke insert, update, delete on public.market_listings from anon, authenticated;
grant select on public.market_listings to authenticated;

create or replace function public.create_market_listing(
  p_resource_type text, p_quantity integer, p_unit_price bigint
)
returns public.market_listings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_available bigint;
  v_result public.market_listings%rowtype;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_resource_type is null or p_resource_type not in ('wood', 'stone') then
    raise exception 'Choose wood or stone';
  end if;
  if p_quantity not between 1 and 1000 or p_unit_price not between 1 and 100000 then
    raise exception 'Quantity or price is outside the allowed range';
  end if;
  if p_resource_type = 'wood' then
    select wood into v_available from public.player_inventories where user_id = v_user_id for update;
  else
    select stone into v_available from public.player_inventories where user_id = v_user_id for update;
  end if;
  if v_available is null or v_available < p_quantity then raise exception 'Not enough resources'; end if;

  if p_resource_type = 'wood' then
    update public.player_inventories set wood = wood - p_quantity, updated_at = now() where user_id = v_user_id;
  else
    update public.player_inventories set stone = stone - p_quantity, updated_at = now() where user_id = v_user_id;
  end if;
  insert into public.market_listings(seller_id, resource_type, quantity, unit_price)
  values (v_user_id, p_resource_type, p_quantity, p_unit_price)
  returning * into v_result;
  return v_result;
end;
$$;
revoke all on function public.create_market_listing(text, integer, bigint) from public, anon;
grant execute on function public.create_market_listing(text, integer, bigint) to authenticated;

create or replace function public.buy_market_listing(p_listing_id uuid)
returns public.market_listings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_listing public.market_listings%rowtype;
  v_buyer_coins bigint;
  v_total bigint;
  v_result public.market_listings%rowtype;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  select * into v_listing from public.market_listings where id = p_listing_id for update;
  if not found or v_listing.status <> 'open' then raise exception 'Listing is no longer available'; end if;
  if v_listing.seller_id = v_user_id then raise exception 'You cannot buy your own listing'; end if;
  v_total := v_listing.quantity::bigint * v_listing.unit_price;

  perform user_id from public.player_inventories
  where user_id in (v_user_id, v_listing.seller_id)
  order by user_id
  for update;
  select coins into v_buyer_coins from public.player_inventories where user_id = v_user_id;
  if v_buyer_coins < v_total then raise exception 'Not enough coins'; end if;

  update public.player_inventories
  set coins = coins - v_total,
      wood = wood + case when v_listing.resource_type = 'wood' then v_listing.quantity else 0 end,
      stone = stone + case when v_listing.resource_type = 'stone' then v_listing.quantity else 0 end,
      updated_at = now()
  where user_id = v_user_id;
  update public.player_inventories
  set coins = coins + v_total, updated_at = now()
  where user_id = v_listing.seller_id;
  update public.market_listings
  set status = 'sold', buyer_id = v_user_id
  where id = v_listing.id
  returning * into v_result;
  return v_result;
end;
$$;
revoke all on function public.buy_market_listing(uuid) from public, anon;
grant execute on function public.buy_market_listing(uuid) to authenticated;

create or replace function public.cancel_market_listing(p_listing_id uuid)
returns public.market_listings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_listing public.market_listings%rowtype;
  v_result public.market_listings%rowtype;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  select * into v_listing
  from public.market_listings
  where id = p_listing_id and seller_id = v_user_id
  for update;
  if not found or v_listing.status <> 'open' then raise exception 'Listing cannot be cancelled'; end if;

  update public.player_inventories
  set wood = wood + case when v_listing.resource_type = 'wood' then v_listing.quantity else 0 end,
      stone = stone + case when v_listing.resource_type = 'stone' then v_listing.quantity else 0 end,
      updated_at = now()
  where user_id = v_user_id;
  update public.market_listings set status = 'cancelled'
  where id = v_listing.id returning * into v_result;
  return v_result;
end;
$$;
revoke all on function public.cancel_market_listing(uuid) from public, anon;
grant execute on function public.cancel_market_listing(uuid) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.player_buildings;
exception when duplicate_object then
  null;
end;
$$;
