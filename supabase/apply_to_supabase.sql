-- ============================================================
-- ♟ ШАШКИ РОЯЛЬ — APPLY TO SUPABASE (v6 + v6.1)
--
-- Этот файл = miграция v6 engagement + hotfix v6.1 welcome bonus.
-- Полностью идемпотентен, безопасно повторять.
--
-- Применить ОДНИМ кликом:
--   1) Открыть https://supabase.com/dashboard/project/jsykbnkbrwwsxcdurzcw/sql/new
--   2) Скопировать ВСЁ содержимое этого файла, вставить в редактор
--   3) Нажать Run
--
-- Что делает:
--   • Добавляет engagement-колонки в profiles
--     (win_streak, best_win_streak, daily_challenge_*, referrer_id,
--      referral_paid, referred_games_played)
--   • Обновляет view public_profiles чтобы отдавать win_streak/best_win_streak
--   • Создаёт таблицу engagement_log (идемпотентность)
--   • Создаёт RPC update_engagement_after_game / register_referral / claim_referral_payout
--   • ⚠ HOTFIX: чинит claim_welcome_bonus (использовал неверные имена колонок
--     transaction_type/description/coin_balance вместо type/note/crypto_balance,
--     и недопустимый CHECK constraint 'welcome_bonus' — заменён на 'starting_bonus').
--
-- После применения никакой re-deploy не нужен — клиент уже задеплоен.
-- ============================================================

BEGIN;

-- ============================================================
-- PART 1: v6 ENGAGEMENT
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

-- Обновлённый view public_profiles
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

-- engagement_log таблица для идемпотентности
CREATE TABLE IF NOT EXISTS engagement_log (
  game_id    uuid    NOT NULL,
  player_id  text    NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (game_id, player_id)
);

-- ============================================================
-- update_engagement_after_game
-- ============================================================
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
  BEGIN
    INSERT INTO engagement_log (game_id, player_id) VALUES (p_game_id, p_player_id);
    v_inserted := true;
  EXCEPTION WHEN unique_violation THEN
    v_inserted := false;
  END;

  IF NOT v_inserted THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true);
  END IF;

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

REVOKE ALL ON FUNCTION public.update_engagement_after_game(text, uuid, boolean, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.update_engagement_after_game(text, uuid, boolean, boolean) TO anon, authenticated;

-- ============================================================
-- register_referral
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

  SELECT EXISTS (SELECT 1 FROM profiles WHERE player_id = p_referrer_id)
    INTO v_ref_exists;
  IF NOT v_ref_exists THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'referrer_not_found');
  END IF;

  UPDATE profiles SET referrer_id = p_referrer_id WHERE player_id = p_player_id;
  RETURN jsonb_build_object('ok', true);
END $$;

REVOKE ALL ON FUNCTION public.register_referral(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.register_referral(text, text) TO anon, authenticated;

-- ============================================================
-- claim_referral_payout — 1 Coin пригласившему после 3 игр
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
  v_bonus            integer := 1;
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

REVOKE ALL ON FUNCTION public.claim_referral_payout(text) FROM public;
GRANT EXECUTE ON FUNCTION public.claim_referral_payout(text) TO anon, authenticated;

-- ============================================================
-- PART 2: v6.1 HOTFIX — claim_welcome_bonus (latent bug v1.4.7)
-- ============================================================
-- Старая функция в migration_v5 пыталась писать в колонки
-- coin_balance / transaction_type / description, которых в схеме нет.
-- Так же тип 'welcome_bonus' не входит в CHECK constraint
-- wallet_transactions.type.
-- Эта версия использует фактическую схему:
--   wallets.crypto_balance
--   wallet_transactions.type / amount / status / note
--   type='starting_bonus' (разрешён CHECK), note='Welcome bonus' (метка).
-- ============================================================
CREATE OR REPLACE FUNCTION public.claim_welcome_bonus(
  p_player_id      text,
  p_device_fp_hash text,
  p_bonus_amount   numeric DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p_id uuid;
  already_claimed boolean;
  fp_profiles_count int;
  fp_already_bonused int;
BEGIN
  SELECT id INTO p_id FROM profiles WHERE player_id = p_player_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;

  -- Welcome bonus метим как type='starting_bonus' + note ILIKE '%welcome%'
  SELECT EXISTS(
    SELECT 1 FROM wallet_transactions
     WHERE profile_id = p_id
       AND type = 'starting_bonus'
       AND COALESCE(note, '') ILIKE '%welcome%'
  ) INTO already_claimed;
  IF already_claimed THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_claimed');
  END IF;

  UPDATE profiles
     SET device_fp_hash = COALESCE(device_fp_hash, p_device_fp_hash)
   WHERE id = p_id;

  IF p_device_fp_hash IS NOT NULL THEN
    SELECT COUNT(*) INTO fp_profiles_count
      FROM profiles
     WHERE device_fp_hash = p_device_fp_hash;
    IF fp_profiles_count > 3 THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'too_many_devices');
    END IF;

    SELECT COUNT(*) INTO fp_already_bonused
      FROM wallet_transactions wt
      JOIN profiles p ON p.id = wt.profile_id
     WHERE p.device_fp_hash = p_device_fp_hash
       AND wt.type = 'starting_bonus'
       AND COALESCE(wt.note, '') ILIKE '%welcome%';
    IF fp_already_bonused > 0 THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'device_already_bonused');
    END IF;
  END IF;

  UPDATE wallets
     SET crypto_balance = crypto_balance + p_bonus_amount,
         updated_at     = now()
   WHERE profile_id = p_id;

  INSERT INTO wallet_transactions (profile_id, type, amount, status, note)
  VALUES (p_id, 'starting_bonus', p_bonus_amount, 'completed', 'Welcome bonus');

  RETURN jsonb_build_object('ok', true, 'amount', p_bonus_amount);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_welcome_bonus(text, text, numeric) FROM public;
GRANT EXECUTE ON FUNCTION public.claim_welcome_bonus(text, text, numeric) TO anon, authenticated;

COMMIT;

DO $$ BEGIN
  RAISE NOTICE
    '[OK] migration v6 engagement + v6.1 welcome bonus hotfix applied.';
END $$;

-- ============================================================
-- Smoke checks (можно прогнать сразу после Run):
-- ============================================================
-- SELECT column_name FROM information_schema.columns
--  WHERE table_schema='public' AND table_name='profiles'
--    AND column_name IN ('win_streak','best_win_streak','daily_challenge_date',
--                        'daily_challenge_wins','referrer_id','referral_paid','referred_games_played');
-- -- ожидается 7 строк
--
-- SELECT routine_name FROM information_schema.routines
--  WHERE routine_schema='public'
--    AND routine_name IN ('update_engagement_after_game',
--                         'register_referral',
--                         'claim_referral_payout',
--                         'claim_welcome_bonus');
-- -- ожидается 4 строки
--
-- SELECT to_regclass('public.engagement_log');     -- engagement_log
-- SELECT to_regclass('public.public_profiles');    -- public_profiles
