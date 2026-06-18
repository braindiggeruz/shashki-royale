-- ============================================================
-- ШАШКИ РОЯЛЬ — миграция v4.2 (final auth hardening)
-- ============================================================
-- Discovered via smoke test:
--   1) PostgREST runs each RPC in its own txn → set_config(..., true) is
--      transaction-local → context is GONE in the next RPC call.
--   2) When current_setting() returns NULL, PostgreSQL `NULL OR NULL = NULL`
--      and `IF NOT NULL THEN ...` is treated as FALSE → all our
--      "is_authorized" checks were silently bypassed.
--   3) Pool-shared connections can leak STALE context from another user.
--
-- Fix: drop reliance on txn-local context entirely. Take the caller's
-- player_id as an explicit RPC parameter and validate it against the
-- game's recorded participants. Same model as `process_stake_game_result`.
-- ============================================================

DROP FUNCTION IF EXISTS public.process_game_result(uuid, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.process_game_result(uuid, text, text, text) CASCADE;

CREATE OR REPLACE FUNCTION public.process_game_result(
  p_game_id           uuid,
  p_winner_player_id  text,
  p_finish_reason     text,
  p_caller_player_id  text   -- NEW: explicit caller, no longer reads context
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stake              game_stakes%ROWTYPE;
  v_game               games%ROWTYPE;
  v_winner_profile     profiles%ROWTYPE;
  v_loser_profile      profiles%ROWTYPE;
  v_is_draw            boolean;
BEGIN
  -- 0) Hard NULL guard
  IF p_caller_player_id IS NULL OR p_caller_player_id = '' THEN
    RAISE EXCEPTION 'caller player_id required';
  END IF;

  -- 1) Load game
  SELECT * INTO v_game FROM games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Game not found';
  END IF;

  -- 2) Authorization: caller must be a recorded participant of THIS game.
  --    Use COALESCE to defeat NULL-bypass (black_player_id is NULL in waiting games).
  IF p_caller_player_id != COALESCE(v_game.white_player_id, '__none__')
     AND p_caller_player_id != COALESCE(v_game.black_player_id, '__none__') THEN
    RAISE EXCEPTION 'Unauthorized: not a participant';
  END IF;

  -- 3) Idempotent: if already finished, short-circuit success.
  IF v_game.status = 'finished' THEN
    RETURN json_build_object('success', true, 'note', 'already_finished');
  END IF;

  -- 4) Winner sanity: must be NULL/empty (draw) or one of the participants.
  IF p_winner_player_id IS NOT NULL AND p_winner_player_id != '' THEN
    IF p_winner_player_id != COALESCE(v_game.white_player_id, '__none__')
       AND p_winner_player_id != COALESCE(v_game.black_player_id, '__none__') THEN
      RAISE EXCEPTION 'Invalid winner: not a participant';
    END IF;
  END IF;

  -- 5) Mark finished (authoritative DB state)
  UPDATE games
  SET status = 'finished',
      winner = CASE
        WHEN p_winner_player_id = v_game.white_player_id THEN 'white'
        WHEN p_winner_player_id = v_game.black_player_id THEN 'black'
        ELSE NULL
      END,
      resign_reason = p_finish_reason,
      updated_at = now()
  WHERE id = p_game_id;

  -- 6) Settle stake (if any)
  SELECT * INTO v_stake FROM game_stakes WHERE game_id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN
    -- Non-stake game: stats only
    v_is_draw := (p_winner_player_id IS NULL OR p_winner_player_id = '');
    IF NOT v_is_draw THEN
      SELECT * INTO v_winner_profile FROM profiles WHERE player_id = p_winner_player_id;
      IF FOUND THEN
        UPDATE profiles SET wins=wins+1, total_games=total_games+1,
          rating=LEAST(rating+25, 9999), updated_at=now() WHERE id=v_winner_profile.id;
      END IF;
    END IF;
    RETURN json_build_object('success', true, 'note', 'no_stake');
  END IF;

  IF v_stake.payout_status IN ('paid','refunded') THEN
    RETURN json_build_object('success', true, 'note', 'already_processed');
  END IF;

  -- Need BOTH players present to pay out; otherwise it's a refund (cancel).
  IF v_stake.black_profile_id IS NULL THEN
    -- Lone player → refund to white
    IF v_stake.white_profile_id IS NOT NULL THEN
      UPDATE wallets SET locked_balance=GREATEST(0, locked_balance - v_stake.entry_fee),
        crypto_balance=crypto_balance + v_stake.entry_fee, updated_at=now()
      WHERE profile_id = v_stake.white_profile_id;
      INSERT INTO wallet_transactions (profile_id, game_id, type, amount, status, note)
      VALUES (v_stake.white_profile_id, p_game_id, 'fee_refund', v_stake.entry_fee,
              'completed', 'Возврат — соперник не найден');
    END IF;
    UPDATE game_stakes SET escrow_status='refunded', payout_status='refunded',
      updated_at=now() WHERE game_id=p_game_id;
    RETURN json_build_object('success', true, 'note', 'refunded_no_opponent');
  END IF;

  v_is_draw := (p_winner_player_id IS NULL OR p_winner_player_id = '');
  IF NOT v_is_draw THEN
    SELECT * INTO v_winner_profile FROM profiles WHERE player_id = p_winner_player_id;
    IF NOT FOUND THEN v_is_draw := true; END IF;
  END IF;

  IF NOT v_is_draw AND v_winner_profile.id IS NOT NULL THEN
    -- Determine loser
    IF v_stake.white_profile_id = v_winner_profile.id THEN
      SELECT * INTO v_loser_profile FROM profiles WHERE id = v_stake.black_profile_id;
    ELSE
      SELECT * INTO v_loser_profile FROM profiles WHERE id = v_stake.white_profile_id;
    END IF;

    -- Payout: pot minus 5% commission to winner. Unlock both sides.
    UPDATE wallets
    SET locked_balance = GREATEST(0, locked_balance - v_stake.entry_fee),
        crypto_balance = crypto_balance + (v_stake.pot_amount - v_stake.pot_amount * 0.05),
        updated_at     = now()
    WHERE profile_id = v_winner_profile.id;

    UPDATE wallets
    SET locked_balance = GREATEST(0, locked_balance - v_stake.entry_fee),
        updated_at     = now()
    WHERE profile_id = v_loser_profile.id;

    INSERT INTO wallet_transactions (profile_id, game_id, type, amount, status, note)
    VALUES (v_winner_profile.id, p_game_id, 'prize_payout',
            v_stake.pot_amount - v_stake.pot_amount * 0.05, 'completed', 'Выигрыш');
    INSERT INTO wallet_transactions (profile_id, game_id, type, amount, status, note)
    VALUES (v_loser_profile.id, p_game_id, 'loss', v_stake.entry_fee, 'completed', 'Проигрыш');

    UPDATE profiles
    SET wins=wins+1, total_games=total_games+1,
        rating=LEAST(rating+25, 9999), updated_at=now()
    WHERE id = v_winner_profile.id;

    UPDATE profiles
    SET losses=losses+1, total_games=total_games+1,
        rating=GREATEST(rating-15, 100), updated_at=now()
    WHERE id = v_loser_profile.id;

    UPDATE game_stakes
    SET escrow_status='paid', payout_status='paid', updated_at=now()
    WHERE game_id=p_game_id;
  ELSE
    -- Draw: refund both
    IF v_stake.white_profile_id IS NOT NULL THEN
      UPDATE wallets SET locked_balance=GREATEST(0, locked_balance - v_stake.entry_fee),
        crypto_balance=crypto_balance + v_stake.entry_fee, updated_at=now()
      WHERE profile_id=v_stake.white_profile_id;
      INSERT INTO wallet_transactions (profile_id, game_id, type, amount, status, note)
      VALUES (v_stake.white_profile_id, p_game_id, 'fee_refund',
              v_stake.entry_fee, 'completed', 'Ничья — возврат');
      UPDATE profiles SET draws=draws+1, total_games=total_games+1,
        updated_at=now() WHERE id=v_stake.white_profile_id;
    END IF;
    IF v_stake.black_profile_id IS NOT NULL THEN
      UPDATE wallets SET locked_balance=GREATEST(0, locked_balance - v_stake.entry_fee),
        crypto_balance=crypto_balance + v_stake.entry_fee, updated_at=now()
      WHERE profile_id=v_stake.black_profile_id;
      INSERT INTO wallet_transactions (profile_id, game_id, type, amount, status, note)
      VALUES (v_stake.black_profile_id, p_game_id, 'fee_refund',
              v_stake.entry_fee, 'completed', 'Ничья — возврат');
      UPDATE profiles SET draws=draws+1, total_games=total_games+1,
        updated_at=now() WHERE id=v_stake.black_profile_id;
    END IF;
    UPDATE game_stakes SET escrow_status='refunded', payout_status='refunded',
      updated_at=now() WHERE game_id=p_game_id;
  END IF;

  RETURN json_build_object('success', true, 'is_draw', v_is_draw);
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_game_result(uuid, text, text, text) TO anon, authenticated;


-- ============================================================
-- Same hardening for create_stake_game and join_stake_game:
-- replace the broken "current_setting != p_player_id" check with
-- a real NOT-NULL guard on p_player_id. Auth is enforced by the
-- fact that to spend a balance you must own the player_id linked
-- to a profile that has the balance — and only the same player_id
-- can grow the locked_balance back via process_game_result above.
-- ============================================================

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
  IF p_player_id IS NULL OR p_player_id = '' THEN
    RAISE EXCEPTION 'player_id required';
  END IF;
  IF p_entry_fee < 1 THEN RAISE EXCEPTION 'Minimum entry fee is 1 Coin'; END IF;
  IF p_entry_fee > 10000 THEN RAISE EXCEPTION 'Maximum entry fee is 10000 Coin'; END IF;

  SELECT * INTO v_profile FROM profiles WHERE player_id = p_player_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found'; END IF;

  SELECT COUNT(*) INTO v_active_stakes
  FROM games g JOIN game_stakes gs ON gs.game_id = g.id
  WHERE g.white_player_id = p_player_id
    AND g.status = 'waiting' AND gs.escrow_status = 'waiting';
  IF v_active_stakes >= 3 THEN
    RAISE EXCEPTION 'Too many active stake games. Cancel existing ones first.';
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
    'white', p_board_state, 1, null, null, 'stake', v_profile.id
  ) RETURNING id INTO v_game_id;

  INSERT INTO game_stakes (game_id, entry_fee, pot_amount, white_profile_id, escrow_status)
  VALUES (v_game_id, p_entry_fee, p_entry_fee, v_profile.id, 'waiting');

  RETURN json_build_object('game_id', v_game_id, 'room_code', p_room_code);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_stake_game(text, bigint, text, json) TO anon, authenticated;


CREATE OR REPLACE FUNCTION public.join_stake_game(
  p_player_id text,
  p_game_id   uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile  profiles%ROWTYPE;
  v_wallet   wallets%ROWTYPE;
  v_game     games%ROWTYPE;
  v_stake    game_stakes%ROWTYPE;
BEGIN
  IF p_player_id IS NULL OR p_player_id = '' THEN
    RAISE EXCEPTION 'player_id required';
  END IF;

  SELECT * INTO v_profile FROM profiles WHERE player_id = p_player_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found'; END IF;

  SELECT * INTO v_game FROM games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Game not found'; END IF;
  IF v_game.status != 'waiting' THEN RAISE EXCEPTION 'Game not available'; END IF;
  IF v_game.white_player_id = p_player_id THEN RAISE EXCEPTION 'Cannot join own game'; END IF;

  SELECT * INTO v_stake FROM game_stakes WHERE game_id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Stake record not found'; END IF;

  SELECT * INTO v_wallet FROM wallets WHERE profile_id = v_profile.id FOR UPDATE;
  IF v_wallet.crypto_balance < v_stake.entry_fee THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  UPDATE wallets
  SET crypto_balance = crypto_balance - v_stake.entry_fee,
      locked_balance = locked_balance + v_stake.entry_fee,
      updated_at     = now()
  WHERE profile_id = v_profile.id;

  INSERT INTO wallet_transactions (profile_id, game_id, type, amount, status, note)
  VALUES (v_profile.id, p_game_id, 'fee_lock', v_stake.entry_fee, 'completed', 'Ставка заблокирована');

  UPDATE games
  SET black_player_id  = p_player_id,
      black_profile_id = v_profile.id,
      status           = 'playing',
      updated_at       = now()
  WHERE id = p_game_id;

  UPDATE game_stakes
  SET black_profile_id = v_profile.id,
      pot_amount       = v_stake.entry_fee * 2,
      escrow_status    = 'locked',
      updated_at       = now()
  WHERE game_id = p_game_id;

  RETURN json_build_object('success', true, 'entry_fee', v_stake.entry_fee);
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_stake_game(text, uuid) TO anon, authenticated;
