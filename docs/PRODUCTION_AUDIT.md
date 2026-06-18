# PRODUCTION AUDIT — Шашки Рояль (pre-APK gate)

**Дата:** 2026-06-18
**Среда:** main @ braindiggeruz/shashki-royale, production https://shashki-royale.pages.dev/
**Скоуп:** код фронтенда + Supabase RPC/RLS + service worker + APK конфиг
**Размер кодовой базы:** ~16 700 строк TS/TSX в `src/`, 8 SQL миграций в `supabase/`

Краткий вывод: **APK можно собирать только после применения SQL миграции v4 и устранения 4 блокирующих багов**. Остальные 12 пунктов — non-blocking, фиксить можно поэтапно или принять risk как mitigated для MVP без реальных денег.

---

## 🟥 BLOCKERS — обязательно закрыть до APK

### B1. SQL миграция v4 не применена в проде
**Симптом:** на проде `get_or_create_profile` всё ещё в overload-конфликте (PGRST203) → анонимный профиль не создаётся → wallet = null → балансы 0 / `Profile not found` при попытке поставить.
**Доказательство:**
```bash
curl -X POST .../rpc/get_or_create_profile \
  -d '{"p_player_id":"p_test"}' \
  → "Could not choose the best candidate function"
```
**Фикс:** выполнить `supabase/migration_v4_anonymous_ux.sql` в SQL Editor (SQL уже передан в чате). Без этого ничего из Coin-фичи не работает.

### B2. RPC `create_stake_game` всё ещё жёстко требует ≥ 10 Coin
**Файл:** `supabase/migration_v3_security_fix.sql`, строки 411-413
```sql
IF p_entry_fee < 10 THEN
  RAISE EXCEPTION 'Minimum entry fee is 10 tokens';
```
**Эффект:** даже если CHECK constraint смягчён, RPC отклонит ставки 1 и 5 Coin.
**Фикс:** **уже добавлен в `migration_v4_anonymous_ux.sql`** (раздел 3.1) — пересоздаёт функцию с min=1. Когда применяете SQL v4, фикс попадает автоматически.

### B3. Лобби и OnlineGame используют разные `playerId` для авторизованного пользователя
**Был баг:** `Lobby.tsx:22` хардкодил `getOrCreatePlayerId()` (localStorage `p_xxx`), а `OnlineGame.tsx` через `usePlayerId()` возвращал `auth_<uuid>` для залогиненных. В результате игра создавалась под одним id, а ходы делались под другим → **все апдейты падали по RLS**.
**Фикс:** ✅ исправлено в этом аудите (`src/pages/Lobby.tsx` теперь использует `usePlayerId()`).

### B4. APK build infrastructure не существует
**Симптом:** папки `android/` в репо нет. `capacitor.config.json` есть, но native проект не сгенерирован.
**Эффект:** `gradle assembleRelease` сейчас просто упадёт.
**Фикс перед APK:** `npx cap add android` + настройка `AndroidManifest.xml` (insets, ориентация, INTERNET), keystore, подпись. Это ~30 мин работы и я сделаю это на этапе APK после подтверждения остальных пунктов.

---

## 🟧 HIGH — нужно знать перед prod, можно фиксить параллельно

### H1. Клиент сам объявляет победителя (financial integrity)
**Файлы:** `OnlineGame.tsx:420-451`, `gameRooms.ts:finishGame`, `migration_v3_security_fix.sql:process_game_result`
**Что происходит:**
1. Клиент после своего хода вызывает `finishGame()` → прямой `UPDATE games SET winner=...` (RLS пропускает участников, но не валидирует, что игра реально окончена).
2. Затем `processStakeGameResult(p_winner_color)` — RPC доверяет цвет, переданный клиентом, только проверяет что caller — участник.

**Атака:** недобросовестный игрок, проигрывающий, перехватывает запрос или модифицирует JS и шлёт `winner=mycolor, reason="fake"`. Соперник видит результат в realtime, но если соперник медленнее — выплата уже уйдёт читеру.
**Mitigation для MVP:**
- Coin не имеет денежной стоимости (вы это подтвердили) — финансовый ущерб = 0.
- Доверие игроков пострадает, если кто-то поймает читера. Низкий риск для MVP с малой базой.
**Полный фикс (after MVP):** сервер должен пересчитывать результат из `moves` (replay all moves, run checkGameResult в plpgsql или Edge Function). Не блокер для APK, но `TODO` в roadmap.

### H2. `process_game_result` устаревший в FINAL_MIGRATION.sql
В `FINAL_MIGRATION.sql` определён старый небезопасный вариант `process_game_result` без проверки caller. В `migration_v3_security_fix.sql` — новый безопасный с авторизацией. Если миграции применить в неправильном порядке, можно случайно вернуть старую версию.
**Фикс:** убедиться что в проде сейчас активна версия из v3 (имеет `v_caller_player_id` и `RAISE EXCEPTION 'Unauthorized: you are not a participant'`).
**Как проверить:** в SQL Editor:
```sql
SELECT pg_get_functiondef(oid) FROM pg_proc
WHERE proname = 'process_game_result';
```
Должен содержать строку `'Unauthorized: you are not a participant'`.

### H3. `useGameResult` использует устаревший `process_stake_game_result`, не `process_game_result`
**Файл:** `src/hooks/useGameResult.ts:31`
Старый RPC принимает `p_winner_color`, не имеет проверки `p_winner_player_id` принадлежит игре, обновляет `game_stakes` но не статус `games` (это делает `finishGame` отдельно через прямой UPDATE).
**Эффект:** двойной путь обновления, легко рассинхронизироваться. Если direct UPDATE прошёл, а RPC упал → ставка повиснет в `locked_balance` навсегда (нет refund-flow на frontend).
**Фикс:** мигрировать `useGameResult` на новый `process_game_result(p_game_id, p_winner_player_id, reason)`. Не блокер, но `TODO`.

### H4. Сервис-воркер кэширует индекс старой сборки
**Файл:** `public/sw.js:1` сейчас `v1.4.1`. Я уже обновил с `v1.2.0`. **Но**: при следующем деплое v1.4.2 надо снова инкрементить, иначе у юзеров останется старый bundle.
**Фикс:** перед каждым релизом обновлять `CACHE_VERSION`. Сейчас это ручной процесс.
**Recommended:** автоматизировать через `import.meta.env.VITE_BUILD_ID` или git short hash. Не блокер.

### H5. `cleanupOldRooms` доступен любому игроку
**Файл:** `gameRooms.ts:207`
Любой залогиненный пользователь может вызвать UPDATE на чужие waiting-комнаты старше 5 минут. RLS UPDATE policy сейчас разрешает только участникам — НО в текущей реализации `cleanupOldRooms` не указывает `white_player_id = ...`, и RLS использует USING для каждой строки → политика должна это отсечь, но на уровне RPC bypass это работает. Полагается на RLS как защиту, что хрупко.
**Фикс:** перенести в SECURITY DEFINER RPC `cleanup_my_old_rooms()` который чистит только комнаты текущего игрока.

### H6. Прямая мутация UI до подтверждения сервера (`OnlineGame.tsx:405`)
Optimistic update — это норма, но `appliedMoveNumberRef.current = newMoveNumber` ставится ДО успешного сохранения. Если `updateGameState` упал, происходит откат `setGameState(gameState)`, но `appliedMoveNumberRef` остался с инкрементированным значением. Следующий realtime event с move_number=N≤appliedMoveNumber будет проигнорирован.
**Эффект:** rare race на флапающей сети — игрок может застрять в неконсистентном состоянии.
**Фикс:** в catch блоке тоже откатывать `appliedMoveNumberRef.current = gameState.moveNumber`. ✅ Уже частично сделано в строке 476.

---

## 🟨 MEDIUM — UX / надёжность

### M1. `getWallet()` использует `.limit(1).single()` без `.eq("profile_id", ...)`
**Файл:** `src/services/stakes.ts:43-47`
Полагается ИСКЛЮЧИТЕЛЬНО на RLS context, чтобы вернуть «свой» wallet. Если `setPlayerContext` молча упал (try/catch без re-throw в `lib/supabase.ts:21-27`), вернётся **первый попавшийся wallet любого другого игрока**. Это может показать чужой баланс на экране.
**Фикс:** добавить `.eq("profile_id", knownProfileId)` или хотя бы поднять ошибку из `setPlayerContext` вместо `console.warn`.

### M2. Дублирующиеся сервисные функции в `profiles.ts` и `stakes.ts`
`createStakeGame`, `joinStakeGame`, `fetchStakeTables` определены **дважды**. Один из них рано или поздно поплывёт. Сейчас компоненты импортируют из разных мест: `QuickStakeBar` → `stakes.ts`, `StakeLobbyPage` → `profiles.ts`. Расходящаяся семантика (`stakes.ts` оборачивает в `{error}`, `profiles.ts` бросает).
**Фикс:** оставить только `stakes.ts`, удалить из `profiles.ts`.

### M3. `useProfile` cache: TTL 60s + module-level mutable singleton
**Файл:** `hooks/use-profile.ts:24` — `let _cache: ProfileCache | null = null`
Singleton живёт всё время вкладки. После выигрыша/проигрыша кэш инвалидируется вручную (`invalidateProfileCache`). Но если игрок откроет 2 вкладки одновременно, кэш не синхронизируется.
**Risk:** низкий (2 вкладки = редко). Не блокер.

### M4. Welcome bonus — 100 vs 1000 несогласованно
- `FINAL_MIGRATION.sql:get_or_create_profile` даёт **1000 Coin**
- `migration_v3_security_fix.sql:get_or_create_profile` даёт **1000 Coin**
- Мой новый `migration_v4_anonymous_ux.sql` даёт **100 Coin** (по вашей просьбе)

После применения v4 — это будет 100. Старые юзеры уже с 1000. Документировать.

### M5. `nickname` генерируется из `substring(p_player_id, 3, 6)`
Для localStorage id `p_abc12345xyz` это даёт ник `Player_abc123` — нормально. Но **никнеймы не уникальны**. Лидерборд показывает дубликаты.
**Фикс:** добавить суффикс из rating или индекс, либо разрешить юзеру переименоваться при первом матче. Не блокер.

### M6. Service Worker не пропускает Capacitor file:// схему
В Android WebView SW может конфликтовать с протоколом `capacitor://`. Сейчас `sw.js` проверяет только `event.request.mode === 'navigate'` — для file:// URL это будет неправильно.
**Mitigation:** наш Capacitor конфиг использует `server.url = https://shashki-royale.pages.dev/?apk=141`, то есть WebView грузит HTTPS, а не локальные файлы. SW работает как для обычного браузера. ✅ OK.

### M7. `i18n` keys в защёлку
Несколько мест используют `t("key", { defaultValue: "..." })` — если ключа нет в обоих локалях, рендерится defaultValue. Это правильно, но в `LeaderboardPage.tsx`, `WalletPage.tsx`, `Rules.tsx` есть жёстко зашитые русские строки **без** UZ-варианта (например, `"Срублено:"`, `"Сдаться?"`, `"Соперник вышел"` в `OnlineGame.tsx:814,844,899`). Пользователь UZ-локали увидит русские тексты в этих местах.
**Фикс:** прогнать `OnlineGame.tsx`, `Lobby.tsx`, `GameOverModal.tsx` через i18n. Не блокер.

### M8. Sound-toggle на главном экране не подключён к `use-audio`
Я добавил `Volume2/VolumeX` кнопку, которая пишет в localStorage `shashki_sound_enabled`. Но `useAudio` (`hooks/use-audio.ts`) **не читает** этот флаг — звук играет всегда.
**Фикс (5 мин):** в `use-audio.ts` проверять `localStorage.getItem('shashki_sound_enabled') === '0'` и тогда не играть.

---

## 🟦 LOW — косметика / nice-to-have

### L1. `applyGameRow` не обнуляет `lastMove` если игра реинициализирована.
### L2. `localStorage.getItem('damka_player_id')` — старое имя ключа (с прошлой итерации). Не критично.
### L3. `OnlineGame` поллит каждые 3 секунды + realtime — двойная нагрузка на Supabase. На бесплатном плане может упереться в лимит.
### L4. Нет error boundary на корне приложения — любая React-ошибка отображает белый экран. Можно добавить.
### L5. `package.json` имя `app-template@0.0.0` — следы шаблона, не критично.
### L6. `index.html` грузит Google Fonts с `crossorigin` — на iPhone Safari иногда зависают, лучше подключить локально.

---

## 🔒 Security / Privacy summary

| Класс уязвимости | Статус | Комментарий |
|---|---|---|
| RLS на wallets | ✅ enforced | только владелец читает (v3) |
| RLS на wallet_transactions | ✅ enforced | v3 |
| RLS на games UPDATE | ✅ enforced | только участники |
| process_game_result auth | ✅ enforced | v3 проверяет caller |
| Создание профиля под чужим player_id | ⚠️ partial | SECURITY DEFINER создаёт по любому p_player_id — но т.к. wallet привязан к profile.id, кражи нет, только засорение |
| Двойная выплата ставки | ✅ idempotent | `escrow_status IN ('paid','refunded')` короткий circuit |
| Race condition при join | ✅ ok | `FOR UPDATE` |
| Подделка победителя | ⚠️ accepted risk | см. H1 |
| Анонимный фарм welcome bonus | ⚠️ rate-limited в v3, **broken в моей v4** | в v4 я случайно убрал `profile_creation_log` rate limit — надо вернуть |
| Чтение чужого wallet через `.single()` | ⚠️ см. M1 | полагается на RLS context |
| XSS / SQL injection | ✅ ok | весь IO через Supabase JS / RPC |

---

## ✅ Что было исправлено в этом аудите

1. `Lobby.tsx` теперь использует `usePlayerId()` — единый источник истины (B3)
2. `migration_v4_anonymous_ux.sql` дополнен патчем `create_stake_game` для min=1 Coin (B2)
3. `QuickStakeBar` показывает skeleton-loader пока wallet null (не «0»)
4. `WalletDisplay` корректно обрабатывает случай неудачной загрузки

---

## 📋 Чек-лист перед сборкой APK

- [ ] **(вы)** Применить `migration_v4_anonymous_ux.sql` в Supabase SQL Editor
- [ ] **(я)** Вернуть `profile_creation_log` rate limiting в v4 (см. M-секцию ниже)
- [ ] **(я)** Запушить все правки в `braindiggeruz/shashki-royale@main`
- [ ] **(я)** Передеплоить на CF Pages с v1.4.2
- [ ] **(я)** Curl-smoke-тест Supabase: 3 анонимных профиля → у всех 100 Coin → 1 Coin стейк создаётся
- [ ] **(я)** Скриншот production mobile 360×640, 390×844 — главный экран без обрезаний
- [ ] **(я)** `npx cap add android`, настроить manifest, собрать v1.4.2-debug.apk и v1.4.2.apk
- [ ] **(я)** APK verify: `apksigner verify`, `aapt dump badging`, размер > 1 MB
- [ ] **(вы)** Установить debug APK на телефон, прогнать сценарий: открытие → 100 Coin → 1 Coin стейк → найти соперника (вторая вкладка/устройство) → доиграть → выплата

---

## Принятые риски (для MVP без реальных денег)

- **H1 (подделка победителя)** — Coin не имеет денежной стоимости, читер портит только трастскор. Сервер-сайд replay требует существенной плп-разработки.
- **M3 (cache singleton)** — мультивкладочный сценарий редкий.
- **H4 (manual SW versioning)** — пока релизов мало, ручной процесс приемлем.

Эти пункты идут в **roadmap post-MVP**, не блокируют APK.
