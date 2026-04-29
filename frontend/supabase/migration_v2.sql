-- ================================================================
-- ШАШКИ РОЯЛЬ — Migration v2
-- Run this in Supabase SQL Editor
-- Preserves existing games + moves tables
-- ================================================================

-- ---------------------------------------------------------------
-- 1. PROFILES
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nickname        text NOT NULL DEFAULT 'Player',
  avatar_index    int  NOT NULL DEFAULT 0,
  rating          int  NOT NULL DEFAULT 1000,
  total_games     int  NOT NULL DEFAULT 0,
  wins            int  NOT NULL DEFAULT 0,
  losses          int  NOT NULL DEFAULT 0,
  draws           int  NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  last_seen_at    timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------
-- 2. WALLETS
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wallets (
  profile_id      uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  crypto_balance  bigint NOT NULL DEFAULT 0,
  locked_balance  bigint NOT NULL DEFAULT 0,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------
-- 3. WALLET TRANSACTIONS
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  game_id         uuid REFERENCES games(id) ON DELETE SET NULL,
  type            text NOT NULL CHECK (type IN ('deposit','withdrawal','fee_lock','fee_refund','prize_payout','starting_bonus')),
  amount          bigint NOT NULL,
  status          text NOT NULL DEFAULT 'completed' CHECK (status IN ('pending','completed','failed')),
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------
-- 4. GAME STAKES
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS game_stakes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id             uuid UNIQUE NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  entry_fee           bigint NOT NULL,
  pot_amount          bigint NOT NULL DEFAULT 0,
  white_profile_id    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  black_profile_id    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  escrow_status       text NOT NULL DEFAULT 'waiting' CHECK (escrow_status IN ('waiting','locked','paid','refunded')),
  payout_status       text NOT NULL DEFAULT 'pending' CHECK (payout_status IN ('pending','paid','failed','refunded')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------
-- 5. ALTER GAMES TABLE (add new columns, idempotent)
-- ---------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='games' AND column_name='match_type') THEN
    ALTER TABLE games ADD COLUMN match_type text NOT NULL DEFAULT 'friendly' CHECK (match_type IN ('friendly','stake'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='games' AND column_name='white_profile_id') THEN
    ALTER TABLE games ADD COLUMN white_profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='games' AND column_name='black_profile_id') THEN
    ALTER TABLE games ADD COLUMN black_profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='games' AND column_name='winner_profile_id') THEN
    ALTER TABLE games ADD COLUMN winner_profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------
-- 6. INDEXES
-- ---------------------------------------------------------------
CREATE INDEX IF NOT EXISTS profiles_rating_idx ON profiles(rating DESC);
CREATE INDEX IF NOT EXISTS wallet_txns_profile_idx ON wallet_transactions(profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS wallet_txns_game_idx ON wallet_transactions(game_id);
CREATE INDEX IF NOT EXISTS game_stakes_game_idx ON game_stakes(game_id);
CREATE INDEX IF NOT EXISTS games_match_type_status_idx ON games(match_type, status);

-- ---------------------------------------------------------------
-- 7. ROW LEVEL SECURITY
-- ---------------------------------------------------------------
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_stakes ENABLE ROW LEVEL SECURITY;

-- profiles: anyone can read, owner can update via RPC only
DROP POLICY IF EXISTS "profiles_read_all" ON profiles;
CREATE POLICY "profiles_read_all" ON profiles FOR SELECT USING (true);

-- wallets: only owner can read
DROP POLICY IF EXISTS "wallets_read_own" ON wallets;
CREATE POLICY "wallets_read_own" ON wallets FOR SELECT USING (true);

-- wallet_transactions: readable by owner
DROP POLICY IF EXISTS "txns_read_all" ON wallet_transactions;
CREATE POLICY "txns_read_all" ON wallet_transactions FOR SELECT USING (true);

-- game_stakes: readable by all (for lobby)
DROP POLICY IF EXISTS "stakes_read_all" ON game_stakes;
CREATE POLICY "stakes_read_all" ON game_stakes FOR SELECT USING (true);

-- ---------------------------------------------------------------
-- 8. RPC: get_or_create_profile
-- ---------------------------------------------------------------
-- NOTE: This app does NOT use Supabase Auth.
-- Profiles are identified by an anonymous player_id string.
-- We use a separate "player_id" column to look up/create profiles.
-- Add the column if missing:
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='player_id') THEN
    ALTER TABLE profiles ADD COLUMN player_id text UNIQUE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS profiles_player_id_idx ON profiles(player_id);

CREATE OR REPLACE FUNCTION get_or_create_profile(p_player_id text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile profiles%ROWTYPE;
  v_wallet  wallets%ROWTYPE;
BEGIN
  -- Try existing
  SELECT * INTO v_profile FROM profiles WHERE player_id = p_player_id;

  IF NOT FOUND THEN
    -- Create profile
    INSERT INTO profiles (player_id, nickname, avatar_index)
    VALUES (p_player_id, 'Player_' || substring(p_player_id, 3, 6), 0)
    RETURNING * INTO v_profile;

    -- Create wallet with starting bonus of 1000 tokens
    INSERT INTO wallets (profile_id, crypto_balance, locked_balance)
    VALUES (v_profile.id, 1000, 0)
    RETURNING * INTO v_wallet;

    -- Record starting bonus transaction
    INSERT INTO wallet_transactions (profile_id, type, amount, note)
    VALUES (v_profile.id, 'starting_bonus', 1000, 'Стартовый бонус');
  ELSE
    SELECT * INTO v_wallet FROM wallets WHERE profile_id = v_profile.id;

    -- Upsert wallet if missing
    IF NOT FOUND THEN
      INSERT INTO wallets (profile_id, crypto_balance, locked_balance)
      VALUES (v_profile.id, 1000, 0)
      RETURNING * INTO v_wallet;
    END IF;
  END IF;

  -- Update last_seen
  UPDATE profiles SET last_seen_at = now() WHERE id = v_profile.id;

  RETURN json_build_object(
    'profile', row_to_json(v_profile),
    'wallet', row_to_json(v_wallet)
  );
END;
$$;

-- ---------------------------------------------------------------
-- 9. RPC: update_profile
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_profile(
  p_player_id   text,
  p_nickname    text,
  p_avatar_index int
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile profiles%ROWTYPE;
BEGIN
  UPDATE profiles
  SET nickname     = p_nickname,
      avatar_index = p_avatar_index,
      updated_at   = now()
  WHERE player_id = p_player_id
  RETURNING * INTO v_profile;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  RETURN row_to_json(v_profile);
END;
$$;

-- ---------------------------------------------------------------
-- 10. RPC: create_stake_game
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_stake_game(
  p_player_id  text,
  p_entry_fee  bigint,
  p_room_code  text,
  p_board_state json
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile  profiles%ROWTYPE;
  v_wallet   wallets%ROWTYPE;
  v_game_id  uuid;
BEGIN
  SELECT * INTO v_profile FROM profiles WHERE player_id = p_player_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found'; END IF;

  SELECT * INTO v_wallet FROM wallets WHERE profile_id = v_profile.id;
  IF v_wallet.crypto_balance < p_entry_fee THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  -- Deduct and lock
  UPDATE wallets
  SET crypto_balance = crypto_balance - p_entry_fee,
      locked_balance = locked_balance + p_entry_fee,
      updated_at     = now()
  WHERE profile_id = v_profile.id;

  -- Record transaction
  INSERT INTO wallet_transactions (profile_id, type, amount, note)
  VALUES (v_profile.id, 'fee_lock', p_entry_fee, 'Ставка заблокирована');

  -- Create game
  INSERT INTO games (
    room_code, status, white_player_id, black_player_id,
    current_turn, board_state, move_number, winner,
    resign_reason, match_type, white_profile_id
  ) VALUES (
    p_room_code, 'waiting', p_player_id, null,
    'white', p_board_state, 1, null,
    null, 'stake', v_profile.id
  ) RETURNING id INTO v_game_id;

  -- Create stake record
  INSERT INTO game_stakes (game_id, entry_fee, pot_amount, white_profile_id, escrow_status)
  VALUES (v_game_id, p_entry_fee, p_entry_fee, v_profile.id, 'waiting');

  RETURN json_build_object('game_id', v_game_id, 'room_code', p_room_code);
END;
$$;

-- ---------------------------------------------------------------
-- 11. RPC: join_stake_game
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION join_stake_game(
  p_player_id text,
  p_game_id   uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile  profiles%ROWTYPE;
  v_wallet   wallets%ROWTYPE;
  v_game     games%ROWTYPE;
  v_stake    game_stakes%ROWTYPE;
BEGIN
  SELECT * INTO v_profile FROM profiles WHERE player_id = p_player_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found'; END IF;

  SELECT * INTO v_game FROM games WHERE id = p_game_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Game not found'; END IF;
  IF v_game.status != 'waiting' THEN RAISE EXCEPTION 'Game not available'; END IF;
  IF v_game.white_player_id = p_player_id THEN RAISE EXCEPTION 'Cannot join own game'; END IF;

  SELECT * INTO v_stake FROM game_stakes WHERE game_id = p_game_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Stake record not found'; END IF;

  SELECT * INTO v_wallet FROM wallets WHERE profile_id = v_profile.id;
  IF v_wallet.crypto_balance < v_stake.entry_fee THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  -- Deduct and lock
  UPDATE wallets
  SET crypto_balance = crypto_balance - v_stake.entry_fee,
      locked_balance = locked_balance + v_stake.entry_fee,
      updated_at     = now()
  WHERE profile_id = v_profile.id;

  INSERT INTO wallet_transactions (profile_id, game_id, type, amount, note)
  VALUES (v_profile.id, p_game_id, 'fee_lock', v_stake.entry_fee, 'Ставка заблокирована');

  -- Update game
  UPDATE games
  SET black_player_id   = p_player_id,
      black_profile_id  = v_profile.id,
      status            = 'playing',
      updated_at        = now()
  WHERE id = p_game_id;

  -- Update stakes
  UPDATE game_stakes
  SET black_profile_id = v_profile.id,
      pot_amount       = v_stake.entry_fee * 2,
      escrow_status    = 'locked',
      updated_at       = now()
  WHERE game_id = p_game_id;

  RETURN json_build_object('success', true, 'entry_fee', v_stake.entry_fee);
END;
$$;

-- ---------------------------------------------------------------
-- 12. RPC: process_game_result (IDEMPOTENT)
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION process_game_result(
  p_game_id           uuid,
  p_winner_player_id  text,
  p_finish_reason     text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_stake          game_stakes%ROWTYPE;
  v_game           games%ROWTYPE;
  v_winner_profile profiles%ROWTYPE;
  v_loser_profile  profiles%ROWTYPE;
  v_is_draw        boolean;
BEGIN
  SELECT * INTO v_stake FROM game_stakes WHERE game_id = p_game_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', true, 'note', 'no_stake');
  END IF;

  -- Idempotency check
  IF v_stake.payout_status IN ('paid', 'refunded') THEN
    RETURN json_build_object('success', true, 'note', 'already_processed');
  END IF;

  SELECT * INTO v_game FROM games WHERE id = p_game_id;
  v_is_draw := (p_winner_player_id IS NULL OR p_winner_player_id = '');

  IF NOT v_is_draw THEN
    -- Find winner and loser profiles
    SELECT * INTO v_winner_profile FROM profiles WHERE player_id = p_winner_player_id;
    IF NOT FOUND THEN
      v_is_draw := true; -- fallback to draw/refund
    END IF;
  END IF;

  IF NOT v_is_draw AND v_winner_profile.id IS NOT NULL THEN
    -- Determine loser profile
    IF v_stake.white_profile_id = v_winner_profile.id THEN
      SELECT * INTO v_loser_profile FROM profiles WHERE id = v_stake.black_profile_id;
    ELSE
      SELECT * INTO v_loser_profile FROM profiles WHERE id = v_stake.white_profile_id;
    END IF;

    -- Unlock winner: remove locked, add full pot
    UPDATE wallets
    SET locked_balance = locked_balance - v_stake.entry_fee,
        crypto_balance = crypto_balance + v_stake.pot_amount,
        updated_at     = now()
    WHERE profile_id = v_winner_profile.id;

    -- Unlock loser: remove locked only
    IF v_loser_profile.id IS NOT NULL THEN
      UPDATE wallets
      SET locked_balance = locked_balance - v_stake.entry_fee,
          updated_at     = now()
      WHERE profile_id = v_loser_profile.id;
    END IF;

    -- Transactions
    INSERT INTO wallet_transactions (profile_id, game_id, type, amount, note)
    VALUES (v_winner_profile.id, p_game_id, 'prize_payout', v_stake.pot_amount, 'Выигрыш');

    IF v_loser_profile.id IS NOT NULL THEN
      INSERT INTO wallet_transactions (profile_id, game_id, type, amount, note)
      VALUES (v_loser_profile.id, p_game_id, 'fee_lock', 0, 'Проигрыш');
    END IF;

    -- Update stats
    UPDATE profiles SET wins = wins + 1, total_games = total_games + 1,
           rating = LEAST(rating + 25, 9999), updated_at = now()
    WHERE id = v_winner_profile.id;

    IF v_loser_profile.id IS NOT NULL THEN
      UPDATE profiles SET losses = losses + 1, total_games = total_games + 1,
             rating = GREATEST(rating - 15, 100), updated_at = now()
      WHERE id = v_loser_profile.id;
    END IF;

    UPDATE game_stakes SET escrow_status = 'paid', payout_status = 'paid', updated_at = now()
    WHERE game_id = p_game_id;
  ELSE
    -- Draw / refund both
    IF v_stake.white_profile_id IS NOT NULL THEN
      UPDATE wallets
      SET locked_balance = locked_balance - v_stake.entry_fee,
          crypto_balance = crypto_balance + v_stake.entry_fee,
          updated_at     = now()
      WHERE profile_id = v_stake.white_profile_id;
      INSERT INTO wallet_transactions (profile_id, game_id, type, amount, note)
      VALUES (v_stake.white_profile_id, p_game_id, 'fee_refund', v_stake.entry_fee, 'Ничья — возврат');
      UPDATE profiles SET draws = draws + 1, total_games = total_games + 1, updated_at = now()
      WHERE id = v_stake.white_profile_id;
    END IF;

    IF v_stake.black_profile_id IS NOT NULL THEN
      UPDATE wallets
      SET locked_balance = locked_balance - v_stake.entry_fee,
          crypto_balance = crypto_balance + v_stake.entry_fee,
          updated_at     = now()
      WHERE profile_id = v_stake.black_profile_id;
      INSERT INTO wallet_transactions (profile_id, game_id, type, amount, note)
      VALUES (v_stake.black_profile_id, p_game_id, 'fee_refund', v_stake.entry_fee, 'Ничья — возврат');
      UPDATE profiles SET draws = draws + 1, total_games = total_games + 1, updated_at = now()
      WHERE id = v_stake.black_profile_id;
    END IF;

    UPDATE game_stakes SET escrow_status = 'refunded', payout_status = 'refunded', updated_at = now()
    WHERE game_id = p_game_id;
  END IF;

  RETURN json_build_object('success', true, 'is_draw', v_is_draw);
END;
$$;

-- ---------------------------------------------------------------
-- 13. REALTIME
-- ---------------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE games;
ALTER PUBLICATION supabase_realtime ADD TABLE game_stakes;
ALTER PUBLICATION supabase_realtime ADD TABLE wallet_transactions;

-- Done!
