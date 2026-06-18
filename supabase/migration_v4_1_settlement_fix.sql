-- ============================================================
-- ШАШКИ РОЯЛЬ — миграция v4.1 (FIX settlement / payout)
-- Безопасно запускать. Идемпотентно. RLS не трогает.
-- ============================================================
-- Проблема: на проде сейчас активна placeholder-версия
--   process_game_result из FINAL_MIGRATION.sql, которая для ставочных игр
--   возвращает {"note":"use_process_stake_game_result"} и НЕ платит приз.
-- Результат: locked_balance виснет у победителя и проигравшего навсегда.
--
-- Этот патч заменяет process_game_result на полноценную безопасную версию
-- (из migration_v3_security_fix.sql) с авторизацией caller, валидацией
-- winner и атомарной выплатой/возвратом ставки.
-- ============================================================

DROP FUNCTION IF EXISTS public.process_game_result(uuid, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.process_game_result(uuid, text, text, text) CASCADE;

CREATE OR REPLACE FUNCTION public.process_game_result(
  p_game_id           uuid,
  p_winner_player_id  text,
  p_finish_reason     text
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
  v_caller_player_id   text;
  v_is_authorized      boolean;
BEGIN
  -- 1) AUTH: caller must be a participant
  v_caller_player_id := current_setting('app.current_player_id', true);

  SELECT * INTO v_game FROM games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Game not found';
  END IF;

  v_is_authorized := (
    v_game.white_player_id = v_caller_player_id OR
    v_game.black_player_id = v_caller_player_id
  );
  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'Unauthorized: you are not a participant of this game';
  END IF;

  -- 2) IDEMPOTENCY: if already finished, return early
  IF v_game.status = 'finished' THEN
    RETURN json_build_object('success', true, 'note', 'already_finished');
  END IF;

  -- 3) winner validation (must be a participant or null/empty for draw)
  IF p_winner_player_id IS NOT NULL AND p_winner_player_id != '' THEN
    IF p_winner_player_id != v_game.white_player_id AND
       p_winner_player_id != v_game.black_player_id THEN
      RAISE EXCEPTION 'Invalid winner: player is not a participant of this game';
    END IF;
  END IF;

  -- 4) Mark game finished (authoritative)
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

  -- 5) Stake settlement (if any)
  SELECT * INTO v_stake FROM game_stakes WHERE game_id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN
    -- non-stake game: just stats
    v_is_draw := (p_winner_player_id IS NULL OR p_winner_player_id = '');
    IF NOT v_is_draw THEN
      SELECT * INTO v_winner_profile FROM profiles WHERE player_id = p_winner_player_id;
      IF FOUND THEN
        UPDATE profiles
        SET wins = wins + 1, total_games = total_games + 1,
            rating = LEAST(rating + 25, 9999), updated_at = now()
        WHERE id = v_winner_profile.id;
      END IF;
    END IF;
    RETURN json_build_object('success', true, 'note', 'no_stake');
  END IF;

  IF v_stake.payout_status IN ('paid', 'refunded') THEN
    RETURN json_build_object('success', true, 'note', 'already_processed');
  END IF;

  v_is_draw := (p_winner_player_id IS NULL OR p_winner_player_id = '');
  IF NOT v_is_draw THEN
    SELECT * INTO v_winner_profile FROM profiles WHERE player_id = p_winner_player_id;
    IF NOT FOUND THEN v_is_draw := true; END IF;
  END IF;

  IF NOT v_is_draw AND v_winner_profile.id IS NOT NULL THEN
    -- Loser
    IF v_stake.white_profile_id = v_winner_profile.id THEN
      SELECT * INTO v_loser_profile FROM profiles WHERE id = v_stake.black_profile_id;
    ELSE
      SELECT * INTO v_loser_profile FROM profiles WHERE id = v_stake.white_profile_id;
    END IF;

    -- Payout (commission 5%)
    UPDATE wallets
    SET locked_balance = GREATEST(0, locked_balance - v_stake.entry_fee),
        crypto_balance = crypto_balance + (v_stake.pot_amount - (v_stake.pot_amount * 0.05)),
        updated_at     = now()
    WHERE profile_id = v_winner_profile.id;

    IF v_loser_profile.id IS NOT NULL THEN
      UPDATE wallets
      SET locked_balance = GREATEST(0, locked_balance - v_stake.entry_fee),
          updated_at     = now()
      WHERE profile_id = v_loser_profile.id;
    END IF;

    INSERT INTO wallet_transactions (profile_id, game_id, type, amount, status, note)
    VALUES (v_winner_profile.id, p_game_id, 'prize_payout',
            v_stake.pot_amount - (v_stake.pot_amount * 0.05), 'completed', 'Выигрыш');

    IF v_loser_profile.id IS NOT NULL THEN
      INSERT INTO wallet_transactions (profile_id, game_id, type, amount, status, note)
      VALUES (v_loser_profile.id, p_game_id, 'loss', v_stake.entry_fee, 'completed', 'Проигрыш');
    END IF;

    UPDATE profiles
    SET wins = wins + 1, total_games = total_games + 1,
        rating = LEAST(rating + 25, 9999), updated_at = now()
    WHERE id = v_winner_profile.id;

    IF v_loser_profile.id IS NOT NULL THEN
      UPDATE profiles
      SET losses = losses + 1, total_games = total_games + 1,
          rating = GREATEST(rating - 15, 100), updated_at = now()
      WHERE id = v_loser_profile.id;
    END IF;

    UPDATE game_stakes
    SET escrow_status = 'paid', payout_status = 'paid', updated_at = now()
    WHERE game_id = p_game_id;
  ELSE
    -- Draw: full refund both sides
    IF v_stake.white_profile_id IS NOT NULL THEN
      UPDATE wallets
      SET locked_balance = GREATEST(0, locked_balance - v_stake.entry_fee),
          crypto_balance = crypto_balance + v_stake.entry_fee,
          updated_at     = now()
      WHERE profile_id = v_stake.white_profile_id;
      INSERT INTO wallet_transactions (profile_id, game_id, type, amount, status, note)
      VALUES (v_stake.white_profile_id, p_game_id, 'fee_refund',
              v_stake.entry_fee, 'completed', 'Ничья — возврат');
      UPDATE profiles
      SET draws = draws + 1, total_games = total_games + 1, updated_at = now()
      WHERE id = v_stake.white_profile_id;
    END IF;

    IF v_stake.black_profile_id IS NOT NULL THEN
      UPDATE wallets
      SET locked_balance = GREATEST(0, locked_balance - v_stake.entry_fee),
          crypto_balance = crypto_balance + v_stake.entry_fee,
          updated_at     = now()
      WHERE profile_id = v_stake.black_profile_id;
      INSERT INTO wallet_transactions (profile_id, game_id, type, amount, status, note)
      VALUES (v_stake.black_profile_id, p_game_id, 'fee_refund',
              v_stake.entry_fee, 'completed', 'Ничья — возврат');
      UPDATE profiles
      SET draws = draws + 1, total_games = total_games + 1, updated_at = now()
      WHERE id = v_stake.black_profile_id;
    END IF;

    UPDATE game_stakes
    SET escrow_status = 'refunded', payout_status = 'refunded', updated_at = now()
    WHERE game_id = p_game_id;
  END IF;

  RETURN json_build_object('success', true, 'is_draw', v_is_draw);
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_game_result(uuid, text, text) TO anon, authenticated;

-- ============================================================
-- One-time cleanup: разморозить locked_balance у уже-завершённых
-- игр, где placeholder process_game_result не отработал.
-- Безопасно: только для status='finished' и escrow_status='locked'.
-- ============================================================
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT gs.*, g.winner, g.white_player_id, g.black_player_id
    FROM game_stakes gs
    JOIN games g ON g.id = gs.game_id
    WHERE g.status = 'finished'
      AND gs.escrow_status = 'locked'
      AND gs.payout_status = 'pending'
  LOOP
    -- Возвращаем ставки обоим (безопасный default — refund, не payout)
    IF rec.white_profile_id IS NOT NULL THEN
      UPDATE wallets
      SET locked_balance = GREATEST(0, locked_balance - rec.entry_fee),
          crypto_balance = crypto_balance + rec.entry_fee
      WHERE profile_id = rec.white_profile_id;
      INSERT INTO wallet_transactions (profile_id, game_id, type, amount, status, note)
      VALUES (rec.white_profile_id, rec.game_id, 'fee_refund',
              rec.entry_fee, 'completed', 'Авто-возврат после миграции v4.1');
    END IF;
    IF rec.black_profile_id IS NOT NULL THEN
      UPDATE wallets
      SET locked_balance = GREATEST(0, locked_balance - rec.entry_fee),
          crypto_balance = crypto_balance + rec.entry_fee
      WHERE profile_id = rec.black_profile_id;
      INSERT INTO wallet_transactions (profile_id, game_id, type, amount, status, note)
      VALUES (rec.black_profile_id, rec.game_id, 'fee_refund',
              rec.entry_fee, 'completed', 'Авто-возврат после миграции v4.1');
    END IF;
    UPDATE game_stakes
    SET escrow_status = 'refunded', payout_status = 'refunded', updated_at = now()
    WHERE id = rec.id;
  END LOOP;
END $$;

-- ============================================================
-- ГОТОВО. Smoke test:
--   1. P1 get_or_create_profile  → balance 100
--   2. P1 create_stake_game 5    → balance 95, locked 5
--   3. P2 get_or_create_profile  → balance 100
--   4. P2 join_stake_game        → balance 95, locked 5 ; pot=10
--   5. caller=P1 process_game_result(winner=P1)
--      → P1 balance 95 + 9.5 = 104.5, locked 0
--      → P2 balance 95,        locked 0
-- ============================================================
