-- ============================================================
-- Migration v4: Fix anonymous player UX
-- ============================================================
-- Issues addressed:
--   1. Overloaded get_or_create_profile (PGRST203) blocks anonymous
--      profile creation entirely (balance stays 0 forever).
--   2. game_stakes.entry_fee CHECK (>= 10) blocks 1/5 Coin quick stakes.
--   3. Welcome bonus needs to be idempotent (no duplicate grants).
--
-- This migration is SAFE TO RE-RUN. It uses IF EXISTS / OR REPLACE.
-- It does NOT change RLS policies. It does NOT change settlement logic.
-- ============================================================

-- 1) Drop ALL overloaded variants of get_or_create_profile so only one
--    canonical function remains.
DO $$
DECLARE
  fn_signature TEXT;
BEGIN
  FOR fn_signature IN
    SELECT format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid))
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'get_or_create_profile'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || fn_signature || ' CASCADE';
  END LOOP;
END $$;

-- 2) Re-create canonical get_or_create_profile.
--    - SECURITY DEFINER so anon users can create their own row.
--    - Idempotent: subsequent calls return existing profile+wallet.
--    - Grants welcome_bonus exactly once per profile.
CREATE OR REPLACE FUNCTION public.get_or_create_profile(p_player_id text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile  profiles%ROWTYPE;
  v_wallet   wallets%ROWTYPE;
  v_is_new   boolean := false;
BEGIN
  -- Sanity input
  IF p_player_id IS NULL OR length(p_player_id) < 3 THEN
    RAISE EXCEPTION 'Invalid player_id';
  END IF;

  -- Set RLS context (so subsequent SELECTs from this connection can read
  -- the new wallet rows via the existing policies).
  PERFORM set_config('app.current_player_id', p_player_id, true);

  SELECT * INTO v_profile FROM profiles WHERE player_id = p_player_id;

  IF NOT FOUND THEN
    INSERT INTO profiles (player_id, nickname, avatar_index)
    VALUES (
      p_player_id,
      'Player_' || substring(p_player_id from 3 for 6),
      (floor(random() * 8))::int
    )
    RETURNING * INTO v_profile;
    v_is_new := true;
  END IF;

  SELECT * INTO v_wallet FROM wallets WHERE profile_id = v_profile.id;

  IF NOT FOUND THEN
    -- 100 Coin welcome bonus for brand-new players.
    INSERT INTO wallets (profile_id, crypto_balance, locked_balance)
    VALUES (v_profile.id, 100, 0)
    RETURNING * INTO v_wallet;

    -- Ledger entry (idempotent: only inserted when wallet didn't exist).
    INSERT INTO wallet_transactions (profile_id, type, amount, status, note)
    VALUES (v_profile.id, 'starting_bonus', 100, 'completed',
            'Welcome bonus: 100 Coin');
  END IF;

  UPDATE profiles SET last_seen_at = now() WHERE id = v_profile.id;

  -- Refresh from DB so we return the updated last_seen_at.
  SELECT * INTO v_profile FROM profiles WHERE id = v_profile.id;

  RETURN json_build_object(
    'profile', row_to_json(v_profile),
    'wallet',  row_to_json(v_wallet),
    'is_new',  v_is_new
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_or_create_profile(text) TO anon, authenticated;

-- 3) Relax stake minimum from 10 -> 1 Coin so 1/5/10/25/50 quick stakes work.
ALTER TABLE game_stakes
  DROP CONSTRAINT IF EXISTS game_stakes_entry_fee_check;

ALTER TABLE game_stakes
  ADD CONSTRAINT game_stakes_entry_fee_check
  CHECK (entry_fee >= 1 AND entry_fee <= 10000);

-- 3.1) Update create_stake_game RPC: the v3 version hard-rejects fees < 10.
--      Without this patch, 1 and 5 Coin quick-stakes still fail.
CREATE OR REPLACE FUNCTION public.create_stake_game(
  p_player_id  text,
  p_entry_fee  bigint,
  p_room_code  text,
  p_board_state json
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile        profiles%ROWTYPE;
  v_wallet         wallets%ROWTYPE;
  v_game_id        uuid;
  v_active_stakes  int;
BEGIN
  -- Caller auth (RLS context must match)
  IF current_setting('app.current_player_id', true) != p_player_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_profile FROM profiles WHERE player_id = p_player_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found'; END IF;

  -- Anti-spam: max 3 active waiting stake games per player.
  SELECT COUNT(*) INTO v_active_stakes
  FROM games g
  JOIN game_stakes gs ON gs.game_id = g.id
  WHERE g.white_player_id = p_player_id
    AND g.status = 'waiting'
    AND gs.escrow_status = 'waiting';

  IF v_active_stakes >= 3 THEN
    RAISE EXCEPTION 'Too many active stake games. Cancel existing ones first.';
  END IF;

  -- Stake size bounds — now starts at 1 Coin (matches table CHECK above).
  IF p_entry_fee < 1 THEN
    RAISE EXCEPTION 'Minimum entry fee is 1 Coin';
  END IF;
  IF p_entry_fee > 10000 THEN
    RAISE EXCEPTION 'Maximum entry fee is 10000 Coin';
  END IF;

  SELECT * INTO v_wallet FROM wallets WHERE profile_id = v_profile.id FOR UPDATE;
  IF v_wallet.crypto_balance < p_entry_fee THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  UPDATE wallets
  SET crypto_balance = crypto_balance - p_entry_fee,
      locked_balance = locked_balance + p_entry_fee,
      updated_at     = now()
  WHERE profile_id = v_profile.id;

  INSERT INTO wallet_transactions (profile_id, type, amount, status, note)
  VALUES (v_profile.id, 'fee_lock', p_entry_fee, 'completed', 'Ставка заблокирована');

  INSERT INTO games (
    room_code, status, white_player_id, black_player_id,
    current_turn, board_state, move_number, winner,
    resign_reason, match_type, white_profile_id
  ) VALUES (
    p_room_code, 'waiting', p_player_id, null,
    'white', p_board_state, 1, null,
    null, 'stake', v_profile.id
  ) RETURNING id INTO v_game_id;

  INSERT INTO game_stakes (game_id, entry_fee, pot_amount, white_profile_id, escrow_status)
  VALUES (v_game_id, p_entry_fee, p_entry_fee, v_profile.id, 'waiting');

  RETURN json_build_object('game_id', v_game_id, 'room_code', p_room_code);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_stake_game(text, bigint, text, json) TO anon, authenticated;

-- 4) Make sure set_player_context exists and is callable by anon.
CREATE OR REPLACE FUNCTION public.set_player_context(p_player_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.current_player_id', COALESCE(p_player_id, ''), true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_player_context(text) TO anon, authenticated;

-- ============================================================
-- DONE. Verify with:
--   SELECT public.get_or_create_profile('p_smoke_' || extract(epoch from now())::text);
-- The returned JSON should contain wallet.crypto_balance = 100 and is_new = true.
-- ============================================================
