-- ============================================================
-- ♟ ШАШКИ РОЯЛЬ v6 — ENGAGEMENT FEATURES
--   • Win streak + best win streak (server-side, visible to opponent)
--   • Daily challenge (wins today)
--   • Referral program (1 Coin to referrer after referred plays 3 games)
--
-- Применить через Supabase Dashboard SQL Editor:
--   https://supabase.com/dashboard/project/jsykbnkbrwwsxcdurzcw/sql/new
-- Миграция идемпотентна — можно перезапускать.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. Новые колонки на profiles
-- ============================================================
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS win_streak             integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS best_win_streak        integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_challenge_date   date,
  ADD COLUMN IF NOT EXISTS daily_challenge_wins   integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS referrer_id            text,
  ADD COLUMN IF NOT EXISTS referral_paid          boolean NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS referred_games_played  integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS profiles_win_streak_idx ON profiles (win_streak DESC);
CREATE INDEX IF NOT EXISTS profiles_referrer_idx ON profiles (referrer_id);

-- ============================================================
-- 2. Обновлённый get_or_create_profile должен отдавать новые колонки
--    автоматически (он делает SELECT * — ничего не меняем).
--    public_profiles view может потребоваться обновить.
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_views WHERE viewname = 'public_profiles') THEN
    DROP VIEW public_profiles CASCADE;
  END IF;
END $$;

CREATE VIEW public_profiles AS
SELECT
  id, nickname, avatar_index, avatar_url, display_name,
  rating, total_games, wins, losses, draws,
  win_streak, best_win_streak,
  created_at, last_seen_at
FROM profiles;

GRANT SELECT ON public_profiles TO anon, authenticated;

-- ============================================================
-- 3. update_engagement_after_game — вызывается клиентом после game over
--    Обновляет:
--      • win_streak (++ при победе, =0 при поражении/ничьей)
--      • best_win_streak
--      • daily_challenge_wins (если победа сегодня)
--      • referred_games_played (++ за каждую сыгранную партию)
--    Идемпотентно по game_id через таблицу engagement_log.
-- ============================================================
CREATE TABLE IF NOT EXISTS engagement_log (
  game_id    uuid    NOT NULL,
  player_id  text    NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (game_id, player_id)
);

CREATE OR REPLACE FUNCTION public.update_engagement_after_game(
  p_player_id text,
  p_game_id   uuid,
  p_won       boolean,
  p_is_draw   boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_streak       integer;
  v_inserted         boolean := false;
  v_daily_wins       integer := 0;
BEGIN
  -- Идемпотентность: каждый игрок учитывается за партию только один раз.
  BEGIN
    INSERT INTO engagement_log (game_id, player_id) VALUES (p_game_id, p_player_id);
    v_inserted := true;
  EXCEPTION WHEN unique_violation THEN
    v_inserted := false;
  END;

  IF NOT v_inserted THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true);
  END IF;

  -- Win streak + daily challenge update
  IF p_won AND NOT p_is_draw THEN
    UPDATE profiles
       SET win_streak           = win_streak + 1,
           best_win_streak      = GREATEST(best_win_streak, win_streak + 1),
           daily_challenge_wins = CASE
             WHEN daily_challenge_date = CURRENT_DATE THEN daily_challenge_wins + 1
             ELSE 1
           END,
           daily_challenge_date = CURRENT_DATE,
           referred_games_played = referred_games_played + 1
     WHERE player_id = p_player_id
     RETURNING win_streak, daily_challenge_wins INTO v_new_streak, v_daily_wins;
  ELSE
    UPDATE profiles
       SET win_streak = 0,
           referred_games_played = referred_games_played + 1
     WHERE player_id = p_player_id
     RETURNING win_streak, daily_challenge_wins INTO v_new_streak, v_daily_wins;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'win_streak', COALESCE(v_new_streak, 0),
    'daily_challenge_wins', COALESCE(v_daily_wins, 0)
  );
END $$;

GRANT EXECUTE ON FUNCTION public.update_engagement_after_game(text, uuid, boolean, boolean) TO anon, authenticated;

-- ============================================================
-- 4. register_referral — связь "приглашённый → пригласивший"
--    Вызывается ОДИН раз при первом визите по ?ref=<player_id>.
--    Защита: не self, не если уже задан.
-- ============================================================
CREATE OR REPLACE FUNCTION public.register_referral(
  p_player_id   text,
  p_referrer_id text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing  text;
  v_ref_exists boolean;
BEGIN
  IF p_player_id IS NULL OR p_referrer_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'null_input');
  END IF;
  IF p_player_id = p_referrer_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'self_referral');
  END IF;

  SELECT referrer_id INTO v_existing FROM profiles WHERE player_id = p_player_id;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_set');
  END IF;

  -- Проверяем что пригласивший существует
  SELECT EXISTS (SELECT 1 FROM profiles WHERE player_id = p_referrer_id)
    INTO v_ref_exists;
  IF NOT v_ref_exists THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'referrer_not_found');
  END IF;

  UPDATE profiles SET referrer_id = p_referrer_id WHERE player_id = p_player_id;
  RETURN jsonb_build_object('ok', true);
END $$;

GRANT EXECUTE ON FUNCTION public.register_referral(text, text) TO anon, authenticated;

-- ============================================================
-- 5. claim_referral_payout — пригласивший получает 1 Coin
--    ТОЛЬКО когда приглашённый сыграл ≥3 партии.
--    Идемпотентно через referral_paid флаг на профиле приглашённого.
--    Бонус: 1 Coin (=$1 в будущей экономике). Минимально, но не разорительно.
-- ============================================================
CREATE OR REPLACE FUNCTION public.claim_referral_payout(
  p_player_id text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referrer_id      text;
  v_already_paid     boolean;
  v_games_played     integer;
  v_referrer_profile profiles%ROWTYPE;
  v_bonus            integer := 1; -- 1 Coin = $1 в будущей экономике
BEGIN
  IF p_player_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'null_input');
  END IF;

  SELECT referrer_id, referral_paid, referred_games_played
    INTO v_referrer_id, v_already_paid, v_games_played
    FROM profiles WHERE player_id = p_player_id;

  IF v_referrer_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_referrer');
  END IF;
  IF v_already_paid THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_paid');
  END IF;
  IF v_games_played < 3 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_enough_games', 'games', v_games_played);
  END IF;

  SELECT * INTO v_referrer_profile FROM profiles WHERE player_id = v_referrer_id;
  IF v_referrer_profile.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'referrer_gone');
  END IF;

  -- Атомарно: пометить выплачено + начислить Coin + транзакция в журнале
  UPDATE profiles SET referral_paid = TRUE WHERE player_id = p_player_id;

  UPDATE wallets
     SET crypto_balance = crypto_balance + v_bonus,
         updated_at = now()
   WHERE profile_id = v_referrer_profile.id;

  INSERT INTO wallet_transactions (profile_id, type, amount, status, note)
  VALUES (v_referrer_profile.id, 'starting_bonus', v_bonus, 'completed',
          'Реферальный бонус за приглашённого игрока');

  RETURN jsonb_build_object('ok', true, 'bonus', v_bonus);
END $$;

GRANT EXECUTE ON FUNCTION public.claim_referral_payout(text) TO anon, authenticated;

-- ============================================================
-- DONE
-- ============================================================
DO $$ BEGIN
  RAISE NOTICE 'v6 engagement migration applied (win_streak, daily_challenge, referrals).';
END $$;

COMMIT;
