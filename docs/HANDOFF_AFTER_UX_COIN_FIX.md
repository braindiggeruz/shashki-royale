# HANDOFF_AFTER_UX_COIN_FIX (2026-06-18)

## TL;DR

Прошлый агент уже исправлял мобильную вёрстку, но не построил Coin/QuickMatch UI на главной — потеря продукта. В этой итерации:

* восстановлен Coin/QuickMatch UI на главной;
* убран Google/email login wall, добавлен анонимный bootstrap + welcome 100 Coin;
* починен settlement (он не работал из-за placeholder-RPC в проде + auth bypass через NULL);
* собран Native Android WebView APK v1.4.2.

## Где исходники

* Repo: `braindiggeruz/shashki-royale`
* Branch: `main`
* Stack: React 19 + Vite 7 + TypeScript + Supabase + Capacitor (только конфиг, APK — native)
* Package manager: npm

## Что было сломано

1. **UX/продукт:** главный экран был упрощён до 3 кнопок («оффлайн/онлайн/правила»), вся экономика Coin исчезла.
2. **Анонимный flow:** при открытии сайта Coin-баланс показывал `0` навсегда, потому что в Supabase лежали ДВА overload-варианта `get_or_create_profile` → PostgREST PGRST203 → профиль не создавался → wallet не создавался.
3. **Settlement:** на проде «process_game_result» была placeholder из FINAL_MIGRATION.sql, которая для ставочных игр возвращала `note: use_process_stake_game_result` и НЕ платила приз → locked_balance виснет навсегда.
4. **Authorization bypass:** проверка `current_setting('app.current_player_id', true)` была сломана архитектурно — set_config(..., true) txn-local, не выживает между HTTP-запросами PostgREST. Stale context из пула + `NULL OR NULL = NULL` → проверки `IF NOT v_is_authorized` всегда пропускали. Smoke-тест зафиксировал кражу 0.95 Coin посторонним.
5. **Lobby playerId mismatch:** `Lobby.tsx` использовал `getOrCreatePlayerId()` (localStorage), а `OnlineGame.tsx` через `usePlayerId()` (auth\_<uuid> для залогиненных) — разные id → RLS UPDATE failures внутри матча.
6. **getWallet leak:** `.single()` без `.eq(profile_id)` — если RLS context сбился, возвращал первый wallet (потенциально чужой).
7. **finishGame() v.s. process_game_result race:** клиент сначала прямым UPDATE ставил `status='finished'`, потом вызывал RPC, который из-за идемпотентности short-circuit-ил и не делал выплату.

## Что восстановлено / починено

### Frontend (`braindiggeruz/shashki-royale@main`)

* `src/components/QuickStakeBar.tsx` — новый: блок «Быстрый матч» со ставками 1/5/10/25/50 Coin, smart find-or-create, disabled при недостаче.
* `src/pages/Index.tsx` — переписан: header (профиль + wallet + sound + trophy + locale), логотип, главный CTA «Играть онлайн», QuickStakeBar, «Все столы», локально, правила. Естественный flow без `mt-auto`.
* `src/hooks/useAnonymousBootstrap.ts` — новый: вызывает `getOrCreateProfile()` на mount, создаёт профиль+wallet+100 Coin при первом визите.
* `src/App.tsx` — убран `ProtectedRoute` с `/stake-lobby`, `/profile`, `/wallet`, `/leaderboard`. Auth routes остались, но не обязательны.
* `src/services/profiles.ts` — убраны дублирующие функции, добавлен `processGameResult(callerPlayerId)` через RPC v4.2.
* `src/services/stakes.ts` — `getWallet` теперь делает `.eq(profile_id, ...)` после profile lookup.
* `src/hooks/useGameResult.ts` — мигрирован на безопасный `process_game_result(p_caller_player_id)`.
* `src/pages/OnlineGame.tsx` — порядок финализации: сначала `updateGameState(board)`, потом `processGameResult` (он сам ставит status=finished и платит).
* `src/pages/Lobby.tsx` — использует `usePlayerId()`.
* `src/components/WalletDisplay.tsx` — показывает skeleton-loader пока wallet не загружен, не выводит «0».
* `src/hooks/use-audio.ts` — уважает `localStorage.shashki_sound_enabled`.
* `public/sw.js` — cache version `v1.4.2` (для принудительного сброса старого bundle).
* `capacitor.config.{ts,json}` — URL `?apk=142`.

### Supabase

* `migration_v4_anonymous_ux.sql` — пересоздан `get_or_create_profile` (welcome 100 Coin, idempotent, прописывает в `wallet_transactions` тип `starting_bonus`); CHECK constraint `entry_fee >= 1`.
* `migration_v4_1_settlement_fix.sql` — (deprecated by v4.2) первая попытка починить settlement через session-context, обнаружила баг.
* `migration_v4_2_explicit_caller_auth.sql` — финальная: `process_game_result(p_game_id, p_winner_player_id, p_finish_reason, p_caller_player_id)`. Авторизация через explicit param + COALESCE NULL guards. Plus авто-возврат застрявших locked у уже-завершённых игр.

### Android APK (native)

* `android/build.gradle` (AGP 8.1.4) + `android/app/build.gradle` (compileSdk 34, minSdk 21, packageId `com.shashkiroyale.webviewfinal`, versionCode 142, versionName 1.4.2).
* `android/app/src/main/java/com/shashkiroyale/webviewfinal/MainActivity.java` — чистый Android WebView wrapper. JavaScript / DOM storage / cookies / back-button-as-goBack / portrait / edge-to-edge / status+nav bar `#1A0800`.
* Vector adaptive launcher icon (корона).
* Подписан ephemeral keystore (CN=Shashki Royale).

### CI

* `.github/workflows/android-apk.yml` — ubuntu-latest, JDK 17 Temurin, Android SDK 34, Gradle 8.4 (pinned), builds release+debug APK, verifies via apksigner, creates GitHub Release.

## Проверки прошли (smoke test 2026-06-18)

| Сценарий | Результат |
|---|---|
| Анонимный новый игрок → получает 100 Coin | ✅ `is_new: True` `balance: 100.0` |
| P1 ставит 5 Coin, P2 join, P1 wins | ✅ P1=104.5, P2=95, 5% комиссия = 0.5 |
| Ничья 3 Coin | ✅ оба возвращают 100 |
| Hacker пытается забрать приз | ✅ `Unauthorized: not a participant` |
| P5 объявляет hacker победителем | ✅ `Invalid winner: not a participant` |
| Двойной finalize (replay) | ✅ `already_finished` |
| TypeScript typecheck | ✅ |
| Vite build | ✅ |
| APK build (GitHub Actions) | ✅ SUCCESSFUL |
| APK signature verify (v1+v2) | ✅ Verifies |

## Принятые риски (post-MVP roadmap, не блокеры)

* **H1: Подделка победителя.** Defense-in-depth есть (caller=participant, winner=participant, no double-finalize), но полная проверка корректности игры требует сервер-сайд replay всех moves. Coin не имеет денежной стоимости, риск — только репутация. **TODO:** plpgsql-функция `validate_game_moves(moves[], expected_winner)` или Edge Function.
* **H5: `cleanupOldRooms` доступен любому.** Защищён RLS UPDATE policy, но хрупко. **TODO:** перенести в `SECURITY DEFINER` RPC `cleanup_my_old_rooms()`.
* **M7: Не все строки в `OnlineGame.tsx` через i18n.** UZ-локаль увидит несколько русских фраз в game-over modal и resign confirm. Не критично для геймплея.

## Production URLs

* Сайт: https://shashki-royale.pages.dev/
* GitHub: https://github.com/braindiggeruz/shashki-royale
* APK release: https://github.com/braindiggeruz/shashki-royale/releases/tag/v1.4.2
* Cloudflare project: `shashki-royale`
* Supabase ref: `jsykbnkbrwwsxcdurzcw`

## Как пересобрать (next time)

Frontend:
```bash
cd shashki-royale
npm install
npm run build
npx wrangler pages deploy dist --project-name=shashki-royale --branch=main
```

APK:
```bash
# Push to main — GitHub Actions builds automatically.
# OR manually:
gh workflow run android-apk.yml
```

## Что мне (вам, следующему агенту/разработчику) проверить

1. Установите debug APK на свой Android.
2. Откройте — должно сразу показать главную с балансом 100 Coin.
3. Нажмите ставку 1 Coin — баланс должен стать 99, открыться экран ожидания соперника.
4. На втором устройстве (или открыв https://shashki-royale.pages.dev/?apk=142 в другом браузере) — нажмите тоже ставку 1 Coin. Должны соединиться.
5. Доиграйте партию. Победитель получает 99 → ~100.95 (1.9 − 5% комиссии). Проигравший: 99 → 99.
6. Откройте `/wallet` — должны быть проводки: `starting_bonus`, `fee_lock`, `prize_payout` (или `loss`).
