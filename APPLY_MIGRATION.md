# Применение Supabase migration v6 — 1 минута

## Зачем

В production Supabase (project `jsykbnkbrwwsxcdurzcw`) на 2026-06-21
**НЕ применена** migration v6 (engagement). Также обнаружен **latent bug** в
migration v5 `claim_welcome_bonus`: функция пытается писать в несуществующие
колонки `coin_balance / transaction_type / description`, из-за чего welcome
bonus в production silent-fails — новый игрок видит баланс 0 вместо 100.

Оба исправления собраны в одном файле и применяются за один Run.

## Шаги

1. Открыть Supabase Dashboard SQL Editor:

   https://supabase.com/dashboard/project/jsykbnkbrwwsxcdurzcw/sql/new

2. Скопировать **полное** содержимое файла

   `supabase/apply_to_supabase.sql`

   (он лежит в репозитории и также приложен к GitHub Release v1.4.8).

3. Вставить в SQL Editor и нажать **Run**.

4. В результатах внизу должно появиться:

   `NOTICE: [OK] migration v6 engagement + v6.1 welcome bonus hotfix applied.`

## Проверка

В том же SQL Editor выполнить smoke-чек:

```sql
SELECT column_name FROM information_schema.columns
 WHERE table_schema='public' AND table_name='profiles'
   AND column_name IN ('win_streak','best_win_streak','daily_challenge_date',
                       'daily_challenge_wins','referrer_id','referral_paid',
                       'referred_games_played')
 ORDER BY column_name;
-- 7 строк

SELECT routine_name FROM information_schema.routines
 WHERE routine_schema='public'
   AND routine_name IN ('update_engagement_after_game','register_referral',
                        'claim_referral_payout','claim_welcome_bonus')
 ORDER BY routine_name;
-- 4 строки

SELECT to_regclass('public.engagement_log'), to_regclass('public.public_profiles');
-- engagement_log, public_profiles (не null)
```

## Что увидит игрок после применения

* В первые 5–30 секунд кэш PostgREST подхватит новые функции.
* На странице production https://shashki-royale.pages.dev/
  при следующем визите нового анонимного игрока:
  - баланс будет **100 ₡** (welcome bonus реально начислится);
  - после первой победы в PlayerCard появится бейдж 🔥 серии побед;
  - на главной появится EngagementStrip (когда есть данные).
* Для уже существующих игроков с балансом 0 welcome bonus
  **не пере-начислится** (idempotent — если у профиля нет
  предыдущей `starting_bonus` записи, может быть начислен один раз).

## Откат (на крайний случай)

```sql
BEGIN;
DROP FUNCTION IF EXISTS public.claim_referral_payout(text);
DROP FUNCTION IF EXISTS public.register_referral(text, text);
DROP FUNCTION IF EXISTS public.update_engagement_after_game(text, uuid, boolean, boolean);
DROP TABLE IF EXISTS engagement_log;
DROP VIEW IF EXISTS public_profiles CASCADE;
CREATE VIEW public_profiles AS
SELECT id, nickname, avatar_index, avatar_url, display_name,
       rating, total_games, wins, losses, draws,
       created_at, last_seen_at
  FROM profiles;
GRANT SELECT ON public_profiles TO anon, authenticated;
ALTER TABLE profiles
  DROP COLUMN IF EXISTS win_streak,
  DROP COLUMN IF EXISTS best_win_streak,
  DROP COLUMN IF EXISTS daily_challenge_date,
  DROP COLUMN IF EXISTS daily_challenge_wins,
  DROP COLUMN IF EXISTS referrer_id,
  DROP COLUMN IF EXISTS referral_paid,
  DROP COLUMN IF EXISTS referred_games_played;
COMMIT;
```

Welcome bonus hotfix (v6.1) откатывать **не нужно** — он чинит сломанную
функцию. Возврат к старой версии вернёт production-баг.
