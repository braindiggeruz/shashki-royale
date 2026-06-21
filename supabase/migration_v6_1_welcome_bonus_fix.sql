-- ============================================================
-- ♟ ШАШКИ РОЯЛЬ v6.1 — HOTFIX claim_welcome_bonus
--
-- Проблема (обнаружена в production 2026-06-21):
--   функция claim_welcome_bonus из migration_v5 использует
--   неправильные имена колонок:
--     • coin_balance       — на самом деле crypto_balance
--     • transaction_type   — на самом деле type
--     • description        — на самом деле note
--     • status             — обязательное поле (NOT NULL), пропускалось
--     • 'welcome_bonus'    — не входит в CHECK constraint типа.
--   В результате welcome bonus в production silent-fails:
--     console: "[useAnonymousBootstrap] welcome bonus claim failed:
--               column 'transaction_type' does not exist"
--   и у нового игрока всегда баланс 0 вместо 100.
--
-- Этот фикс ПЕРЕЗАПИСЫВАЕТ функцию claim_welcome_bonus с правильной
-- схемой. RLS, security definer и anti-farm не меняются.
-- Применить ПОСЛЕ migration_v6_engagement.sql (или одновременно).
-- ============================================================

BEGIN;

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

  -- Уже забирал? (старые записи могут иметь type='starting_bonus' с note='Welcome bonus')
  SELECT EXISTS(
    SELECT 1 FROM wallet_transactions
     WHERE profile_id = p_id
       AND type = 'starting_bonus'
       AND COALESCE(note, '') ILIKE '%welcome%'
  ) INTO already_claimed;
  IF already_claimed THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_claimed');
  END IF;

  -- Записываем device_fp_hash в profile если ещё пусто
  UPDATE profiles
     SET device_fp_hash = COALESCE(device_fp_hash, p_device_fp_hash)
   WHERE id = p_id;

  -- Анти-фарм: с одного device_fp_hash максимум 3 профиля
  --             и максимум 1 welcome bonus на устройство
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

  -- Начисляем bonus. Правильные имена колонок:
  --   wallets.crypto_balance, wallet_transactions.type, .note, .status
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
  RAISE NOTICE 'v6.1 hotfix applied: claim_welcome_bonus now uses crypto_balance/type/note/status correctly.';
END $$;
