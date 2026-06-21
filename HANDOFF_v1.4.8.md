# 🤝 HANDOFF — Шашки Рояль v1.4.8 (engagement)

Дата: 2026-06-21
Final commit: `559f40feb52dcbf0e7c3ca5b1bf112c90e156e69`

---

## Текущее состояние

| Слой                      | Статус                                                     |
|---------------------------|------------------------------------------------------------|
| GitHub repo / branch      | `braindiggeruz/shashki-royale` / `main`                    |
| Final commit              | `559f40f` (v1.4.8 engagement)                              |
| GitHub Actions APK build  | ✅ success ([run 27877502007](https://github.com/braindiggeruz/shashki-royale/actions/runs/27877502007)) |
| GitHub Actions Pages deploy| ✅ success ([run 27877502012](https://github.com/braindiggeruz/shashki-royale/actions/runs/27877502012)) |
| GitHub Release            | ✅ [v1.4.8](https://github.com/braindiggeruz/shashki-royale/releases/tag/v1.4.8) |
| Production (Cloudflare)   | ✅ https://shashki-royale.pages.dev/ — HTTP 200, SW v1.4.8 |
| Local typecheck           | ✅ clean                                                    |
| Local build               | ✅ 528 KB / 161 KB gzip                                     |
| Local vitest              | ✅ 68/72 (4 pre-existing auth.integration failures, не изменились) |
| APK release               | ✅ 4.79 MB, signed v1+v2, package `com.shashkiroyale.app`, version 1.4.8 / 148, persistent keystore (тот же SHA-256 `9a546cf3…`, что и v1.4.7) |
| Supabase migration v5     | ✅ applied (security hardening из v1.4.7)                   |
| **Supabase migration v6** | ⚠️ **НЕ применена** — требуется ручной запуск SQL (см. ниже) |
| **Welcome bonus в проде** | ⚠️ **СЛОМАН с момента v1.4.7** — latent bug в SQL функции (см. ниже) |

## Production URL

https://shashki-royale.pages.dev/

---

## Что было готово до этой сессии (выполнено предыдущим агентом)

1. Commit `559f40f` создан и pushed в `main`.
2. GitHub Actions `Build Android APK` и `Deploy to Cloudflare Pages`
   запустились и **успешно завершились** для этого commit.
3. GitHub Release v1.4.8 опубликован со всеми ожидаемыми артефактами:
   - `shashki-royale-v1.4.8-release.apk` (4.79 MB)
   - `shashki-royale-v1.4.8-debug.apk` (5.56 MB)
   - `shashki-royale-v1.4.8-final-release.zip` (8.34 MB)
   - `APK_VERIFICATION.txt`, `APK_CONTENTS.txt`, `ANDROID_INSTALL_REPORT.md`, `build-info.json`
4. Frontend задеплоен в Cloudflare Pages с service worker `v1.4.8`.
5. Engagement-код добавлен:
   - `supabase/migration_v6_engagement.sql` (только в репо, **в БД не применён**)
   - `src/services/engagement.ts` (daily login + 3 RPC обёртки)
   - `src/components/EngagementStrip.tsx` (кейс-bар на главной)
   - `src/components/PlayerCard.tsx` (win-streak бейдж 🔥)
   - `src/components/GameOverModal.tsx` (rematch + share с clipboard fallback)
   - `src/hooks/useGameResult.ts` (engagement update best-effort после game over)
   - `src/hooks/useAnonymousBootstrap.ts` (referral pickup из `?ref=` + daily login)
   - `src/pages/Index.tsx` (вставка EngagementStrip между CTA и QuickStake)
   - `src/pages/OnlineGame.tsx` (proxy rematch, передача playerId в GameOverModal)
   - `public/sw.js` cache version → `v1.4.8`
   - `android/app/build.gradle` versionCode 148 / versionName 1.4.8
   - `MainActivity` apk=148
   - `.github/workflows/build-android-apk.yml` releases v1.4.8

## Что добавил/проверил этот спринт (продолжение)

1. ✅ Проверил commit `559f40f` присутствует, оба workflow завершились success,
   tag и Release v1.4.8 существуют.
2. ✅ Скачал и верифицировал release APK:
   - `apksigner verify` — v1+v2 OK
   - certificate SHA-256 `9a546cf31f0ee44357fc101f9984d096ea882e4ebbb75ef61a0ab4163f8c05c6`
     — **точно совпадает с v1.4.7** (persistent keystore работает)
   - `aapt dump badging`: package `com.shashkiroyale.app`, versionCode `148`,
     versionName `1.4.8`, minSdk 21, targetSdk 34
   - INTERNET / ACCESS_NETWORK_STATE / VIBRATE permissions
   - AndroidManifest, classes.dex, resources.arsc на месте (876 файлов, нормальный размер)
3. ✅ Запустил локально `pnpm install && tsc -b && vite build && vitest run`:
   - typecheck clean
   - build 528.26 KB / 161 KB gzip
   - vitest 68/72 (4 pre-existing auth.integration failures, как baseline)
4. ✅ Production smoke-тест на `https://shashki-royale.pages.dev/`:
   - HTTP 200, title «Шашки Рояль»
   - `sw.js` CACHE_VERSION = `v1.4.8`
   - Главная рендерится, профиль/wallet/CTA на месте
   - Anonymous bootstrap создаёт player_id, profile, daily login streak
5. ⚠️ **Обнаружено**: migration v6 НЕ применена в production:
   - `update_engagement_after_game` / `register_referral` / `claim_referral_payout` — функций нет
   - `engagement_log` — таблицы нет
   - `public_profiles.win_streak` / `best_win_streak` — колонок нет в view
6. ⚠️ **Обнаружено**: latent bug в `claim_welcome_bonus` (v5, v1.4.7):
   - console: `[useAnonymousBootstrap] welcome bonus claim failed:
     column "transaction_type" does not exist`
   - Функция использует `coin_balance / transaction_type / description`,
     а в схеме `crypto_balance / type / note`.
   - Welcome bonus сломан с момента деплоя v1.4.7 — у нового игрока всегда баланс 0.
7. ✅ Подготовлен hotfix:
   - `supabase/migration_v6_1_welcome_bonus_fix.sql` — отдельный фикс claim_welcome_bonus
   - `supabase/apply_to_supabase.sql` — комбинированный (v6 + v6.1), one-click apply
   - `APPLY_MIGRATION.md` — детальная инструкция (см. ниже)

## ❗ Что осталось — ОБЯЗАТЕЛЬНОЕ ручное действие

**Применить SQL в Supabase Dashboard (1 минута)**:

1. Открыть https://supabase.com/dashboard/project/jsykbnkbrwwsxcdurzcw/sql/new
2. Вставить содержимое файла `supabase/apply_to_supabase.sql`
3. Нажать **Run**
4. Проверить вывод `NOTICE: [OK] migration v6 engagement + v6.1 welcome bonus hotfix applied.`

После этого:
* welcome bonus заработает (новый игрок получит 100 ₡);
* engagement-функции (win_streak, daily_challenge, referrals) начнут писать данные;
* EngagementStrip начнёт показываться когда у игрока win_streak > 0 или login streak >= 2;
* re-deploy не нужен — фронтенд уже задеплоен правильный.

Полная инструкция и smoke-чек: `APPLY_MIGRATION.md`.

---

## Engagement-экономика (после применения миграции)

* **Daily login streak** — pure localStorage, **0 Coin**, только prestige.
* **Win streak** — server-side в `profiles.win_streak`, **0 Coin** (только бейдж 🔥
  и видимость сопернику).
* **Daily challenge** (Win 3 today) — server-side, **0 Coin** (только титул «Чемпион 👑»).
* **Referral payout** — **1 Coin** пригласившему, **только** после того как
  приглашённый сыграл ≥3 партий и **только один раз** (`profiles.referral_paid`).
  Условия и anti-farm:
  * не self-referral;
  * referrer должен существовать;
  * `referred_games_played` считается из реальных матчей через
    `update_engagement_after_game` (привязан к `engagement_log` по game_id+player_id —
    нельзя накрутить через refresh);
  * `claim_referral_payout` идемпотентна (`referral_paid=TRUE` после успешной выплаты).
* **Welcome bonus** — 100 ₡, **один раз на профиль** + **один раз на device fingerprint**,
  максимум 3 профиля на fingerprint.

Если в будущем 1 Coin ≈ 1 USD, эта схема консервативна: максимум 1 Coin за реферала,
никаких daily-логин-бонусов, никаких win-streak-выплат.

---

## Все ссылки

| Что | URL |
|-----|-----|
| Production | https://shashki-royale.pages.dev/ |
| Repo | https://github.com/braindiggeruz/shashki-royale |
| Final commit | https://github.com/braindiggeruz/shashki-royale/commit/559f40feb52dcbf0e7c3ca5b1bf112c90e156e69 |
| Release v1.4.8 | https://github.com/braindiggeruz/shashki-royale/releases/tag/v1.4.8 |
| Release APK | https://github.com/braindiggeruz/shashki-royale/releases/download/v1.4.8/shashki-royale-v1.4.8-release.apk |
| Debug APK | https://github.com/braindiggeruz/shashki-royale/releases/download/v1.4.8/shashki-royale-v1.4.8-debug.apk |
| Final ZIP | https://github.com/braindiggeruz/shashki-royale/releases/download/v1.4.8/shashki-royale-v1.4.8-final-release.zip |
| Supabase project | https://supabase.com/dashboard/project/jsykbnkbrwwsxcdurzcw |
| SQL Editor (apply) | https://supabase.com/dashboard/project/jsykbnkbrwwsxcdurzcw/sql/new |
| Cloudflare Pages | https://dash.cloudflare.com/?to=/:account/pages/view/shashki-royale |

---

## Что нужно проверить владельцу на телефоне

1. Установить `shashki-royale-v1.4.8-release.apk` (нужно «разрешить установку из неизвестных источников»).
2. Открыть приложение — должен загрузиться экран «ШАШКИ РОЯЛЬ» с короной.
3. До применения миграции:
   * Welcome bonus НЕ начислится (баланс 0).
   * EngagementStrip не показывается.
   * Quick match по 1/5/10/25/50 ₡ доступен только если есть баланс.
4. **После того как владелец применит SQL** (1 минута):
   * Welcome bonus 100 ₡ начислится новому профилю при следующем запуске.
   * После 2 побед подряд в PlayerCard появится бейдж 🔥.
   * После Win 3 today появится бейдж «Чемпион 👑» на главной.
   * Кнопка «Поделиться» в GameOverModal копирует ссылку с `?ref=<твой_player_id>`.
   * Кнопка «Сыграть снова» создаёт новую матчмейкинг-сессию (rematch wiring).
5. Проверить разрешения экрана:
   * 360×640, 360×740, 390×844, 412×915 — safe-area и WindowInsets ок.
   * Game-over modal не обрезается, прокручивается.
6. RU интерфейс на месте; UZ-локаль читается через переключение в профиле.

---

## Безопасность v1.4.7 — что не трогалось

* `submit_move` / `submit_resign` / `claim_timeout_win` / `cancel_waiting_room` — не меняли.
* RLS lockdown на `games` / `moves` / `wallets` / `wallet_transactions` — не меняли.
* `process_game_result` / `process_stake_game_result` — не трогали.
* Прямой UPDATE/INSERT в `games` и `moves` из браузера по-прежнему блокируется RLS
  (anon key не может писать туда, всё идёт через SECURITY DEFINER функции).
* Persistent keystore тот же (certificate SHA-256 совпадает с v1.4.7).

## Известный технический долг (pre-existing, не от v1.4.8)

* 4 failing tests в `src/game/__tests__/auth.integration.test.ts`
  (поведение `expect(null).toContain("8")` — проверка валидации возвращает `null`
  вместо строки ошибки). Не связаны с v1.4.8.
* ESLint конфиг (`eslint.config.mjs`) импортирует `@convex-dev/eslint-plugin`,
  который не в `package.json` → `pnpm lint` падает. Не блокирует CI (lint не в pipeline).

## Post-MVP backlog

1. **Double-entry ledger** для wallets (уже в HANDOFF_v1.4.7 как P0 #3).
2. **CSP / SRI headers** через `_headers` файл.
3. **pg_cron** для auto-timeout finalizer (сейчас только client-side polling).
4. **Replace device fingerprint** на FingerprintJS-pro / server challenge.
5. **Sentry/PostHog** для observability.
6. **Daily challenge variations** — Win 5 in row, K-winning streak, etc.
7. **Leaderboard panel** для best_win_streak (уже есть в `public_profiles`).
8. **Удалить `transaction_type` остатки** в комментах HANDOFF_v1.4.7 и других местах
   во избежание путаницы.

---

## Точные rewards и anti-farm правила

| Действие                       | Награда       | Idempotency / anti-farm                                                 |
|--------------------------------|---------------|--------------------------------------------------------------------------|
| Welcome bonus                  | **100 ₡**     | 1× / профиль (по wallet_transactions starting_bonus + Welcome note); 1× / device fp; max 3 профиля / fp |
| Daily login streak             | 0 ₡           | pure localStorage; refresh не даёт повторно                              |
| Win streak (+1 за победу)      | 0 ₡           | server-side; обновляется в `update_engagement_after_game`; engagement_log gate по game_id+player_id (один update на партию на игрока) |
| Daily challenge (Win 3 today)  | 0 ₡           | server-side counter; сбрасывается на следующий день                      |
| Referral payout                | **1 ₡** referrer-у | требуется ≥3 партий приглашённого; `referral_paid=TRUE` после выплаты; не self-referral |
| Игровые ставки (1/5/10/25/50 ₡)| pot − 5% fee  | escrow + atomic settlement через `process_stake_game_result` (не трогали) |

---

## Что владельцу делать после применения SQL

1. Открыть в incognito https://shashki-royale.pages.dev/ — увидеть **баланс 100 ₡** у нового анонимного игрока.
2. Сыграть локальную партию → выиграть → ничего не должно сломаться (welcome bonus не сгорает).
3. Сыграть онлайн-партию (быстрый матч на 1 ₡) → после победы должна сработать
   `update_engagement_after_game` → перезагрузка главной должна показать
   EngagementStrip с win_streak=1 (если первый день — strip скрыт by design до win_streak≥1).

Готово.
