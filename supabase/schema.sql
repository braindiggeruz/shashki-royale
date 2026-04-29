-- ============================================================
-- Damka Royale — Supabase Schema
-- Run this in the Supabase SQL Editor
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- TABLES
-- ============================================================

create table if not exists games (
  id              uuid primary key default uuid_generate_v4(),
  room_code       text unique not null,
  status          text not null default 'waiting'
                    check (status in ('waiting', 'playing', 'finished')),
  white_player_id text not null,
  black_player_id text,
  current_turn    text not null default 'white'
                    check (current_turn in ('white', 'black')),
  board_state     jsonb not null,
  move_number     integer not null default 1,
  winner          text check (winner in ('white', 'black', null)),
  resign_reason   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists moves (
  id           uuid primary key default uuid_generate_v4(),
  game_id      uuid not null references games(id) on delete cascade,
  move_number  integer not null,
  player_color text not null check (player_color in ('white', 'black')),
  move_data    jsonb not null,
  board_state  jsonb not null,
  created_at   timestamptz not null default now()
);

-- ============================================================
-- INDEXES
-- ============================================================

create index if not exists games_room_code_idx on games (room_code);
create index if not exists games_status_idx on games (status);
create index if not exists games_white_player_idx on games (white_player_id);
create index if not exists games_black_player_idx on games (black_player_id);
create index if not exists moves_game_id_idx on moves (game_id);
create index if not exists moves_game_move_number_idx on moves (game_id, move_number);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================

create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists games_updated_at on games;
create trigger games_updated_at
  before update on games
  for each row execute function update_updated_at_column();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table games enable row level security;
alter table moves enable row level security;

-- Games: anyone can read; only players in the game can update/insert
create policy "Anyone can read games"
  on games for select using (true);

create policy "Anyone can insert games"
  on games for insert with check (true);

create policy "Players can update their game"
  on games for update using (true);

-- Moves: anyone can read; anyone can insert
create policy "Anyone can read moves"
  on moves for select using (true);

create policy "Anyone can insert moves"
  on moves for insert with check (true);

-- ============================================================
-- REALTIME PUBLICATION
-- ============================================================

-- Enable Realtime for the games table
-- (Run in Supabase Dashboard: Database > Replication > games table)
-- Or use the SQL below:

alter publication supabase_realtime add table games;
alter publication supabase_realtime add table moves;
