# 🔐 Handoff — Security Hardening v1.4.7 (incomplete)

## Что готово в этом коммите

### 1. SQL миграция (`supabase/migration_v5_secure_moves.sql`)
**Полный server-authoritative move engine + RLS lockdown + anti-farm.**
Локально протестирован на Postgres 15. Все ключевые тесты прошли:
- ✅ MUST_CAPTURE блокирует не-захват когда capture доступен
- ✅ Captured square должна содержать opponent piece
- ✅ Captured own piece — отвергнуто
- ✅ Multi-capture chain `CHAIN_MUST_CONTINUE` enforcing
- ✅ King promotion at last rank
- ✅ King capture across distance
- ✅ Game-over detection (no pieces / no moves)
- ✅ Stale move number → reject
- ✅ Backward man move → reject
- ✅ Not-a-participant → reject
- ✅ Direct UPDATE games as anon → blocked by RLS (no policy)
- ✅ Direct INSERT moves as anon → blocked by RLS
- ✅ INSERT game as другой player_id → blocked by RLS WITH CHECK
- ✅ Cross-player wallet read → blocked by RLS

**Что внутри:**
- `submit_move(p_game_id, p_player_id, p_expected_move_number, p_jumps jsonb)` — атомарный RPC, валидирует ход полностью, применяет, при game-over вызывает `process_game_result` (settlement) в той же транзакции.
- `submit_resign(p_game_id, p_player_id, p_reason)`
- `claim_timeout_win(p_game_id, p_player_id, p_timeout_s default 90)` — если соперник не ходил >90s.
- `cancel_waiting_room(p_game_id, p_player_id)` — отменить свою комнату.
- `claim_welcome_bonus(p_player_id, p_device_fp_hash, p_bonus_amount default 100)` — атомарный claim с anti-farm (max 1 bonus на fp, max 3 профиля на fp).
- RLS lockdown:
  - `games` UPDATE/DELETE — ЗАПРЕЩЕНО (нет policy → блокируется RLS); INSERT — только status='waiting' и white_player_id = current_setting('app.current_player_id').
  - `moves` INSERT/UPDATE/DELETE — ЗАПРЕЩЕНО (только через `submit_move` RPC SECURITY DEFINER).
  - `wallets` SELECT/UPDATE — только владельцем; запись только через SECURITY DEFINER RPC.
  - `wallet_transactions` SELECT — только своё.
  - `profiles` UPDATE — только своё (по `app.current_player_id`).
- Rate limit на создание игр: max 10 inserts/60s (триггер + action_log).
- Колонки `last_move_at`, `last_from_*`, `last_to_*` для UI и timeout finalizer.
- Колонка `profiles.device_fp_hash`.

### 2. Клиентский сервис `src/services/secureMoves.ts`
- `submitMove(gameId, playerId, expectedMoveNumber, move)`
- `submitResign(gameId, playerId, reason)`
- `claimTimeoutWin(gameId, playerId, timeoutSeconds)`
- `cancelWaitingRoom(gameId, playerId)`
- `claimWelcomeBonus(playerId, deviceFpHash, amount)`
- `computeDeviceFingerprint()` — SHA-256 от (UA + screen + timezone + canvas hash)

### 3. Клиентский рефактор с **zero-downtime fallback**
- `src/pages/OnlineGame.tsx` `handleCellClick`: сначала пробует `submit_move` RPC, при отсутствии (`does not exist`) — откатывается на legacy `updateGameState`+`insertMove`. То же для `submitResign`. Это значит:
  - Если миграция НЕ применена → клиент v1.4.7 работает ровно как v1.4.6 (legacy path, cheat возможен).
  - Если миграция применена → клиент автоматически использует secure path. Cheat невозможен.
- `src/hooks/useAnonymousBootstrap.ts`: claim welcome bonus теперь идёт через защищённый `claim_welcome_bonus` RPC с device fingerprint.

### 4. Build/typecheck/tests
- ✅ `npx tsc --noEmit` — clean
- ✅ `npm run build` — clean (525 KB / 160 KB gzip)
- ✅ `npx vitest --run` — 68 passed (только 4 pre-existing auth.integration failures, не связаны)

---

## ⚠️ Что нужно сделать новому агенту / владельцу

### Шаг 1 — ОБЯЗАТЕЛЬНО: применить миграцию SQL
1. Открой: https://supabase.com/dashboard/project/jsykbnkbrwwsxcdurzcw/sql/new
2. Скопируй файл `supabase/migration_v5_secure_moves.sql` целиком и вставь в редактор.
3. Нажми **Run**.
4. Должно появиться `NOTICE: v5 migration applied.` без ошибок.
5. Опционально: проверь что появились функции:
   ```sql
   SELECT proname FROM pg_proc WHERE proname IN
     ('submit_move','submit_resign','claim_timeout_win','cancel_waiting_room','claim_welcome_bonus');
   ```
   Должно вернуть 5 строк.

### Шаг 2 — Push клиент в production
Уже сделано в этом коммите. После применения миграции — production автоматически
переключится на secure path (fallback срабатывает только если RPC не существует).

### Шаг 3 — Bump APK
Чтобы сборка вышла как v1.4.7:
- `android/app/build.gradle`: `versionCode 146 → 147`, `versionName 1.4.6 → 1.4.7`.
- `MainActivity.java`: `apk=146` → `apk=147`.
- `.github/workflows/build-android-apk.yml`: `s/v1\.4\.6/v1.4.7/g; s/146/147/g`.

(В этом коммите я НЕ забампал, так как ты сказал «токены критически на исходе» — оставь это новому агенту, чтобы не задеплоить APK до того, как миграция применена.)

### Шаг 4 — Удалить legacy fallback после успешного применения миграции
После того как ты убедился, что миграция работает и игра играется как обычно:
- В `src/pages/OnlineGame.tsx` удалить блок `if (serverResult) { ... } else { ... LEGACY PATH ... }` — оставить только secure path (без `updateGameState`/`insertMove` вызовов).
- Удалить из `src/services/gameRooms.ts` функции `updateGameState`, `updateGameStatus`, `finishGame`, `insertMove` (они больше не нужны).
- Удалить `import { updateGameState, insertMove }` из `OnlineGame.tsx`.

Это запечатает security model — никто кроме SECURITY DEFINER функций не сможет писать в games/moves.

---

## Что я НЕ сделал (back-burner для следующего спринта)

1. **Double-entry ledger** (P0 #3 из аудита). Сейчас `wallets.coin_balance` — единственный источник правды. Для LTC обязательно нужно `ledger_entries` с `balance = SUM(entries)`. Это 1 день работы.
2. **APK signing v3 scheme** — добавить `--v3-signing-enabled true` в Gradle config.
3. **CSP / SRI headers** через `_headers` файл в репо.
4. **Sentry/PostHog** для observability.
5. **pg_cron timeout finalizer** — сейчас timeout-win работает только при manual claim через UI. Для авто-завершения зависших игр нужен pg_cron. Альтернатива: client-side polling уже есть в `OnlineGame.tsx` (90s detection).

---

## Архитектурные выводы для нового агента

- Все денежные операции после v5 идут только через `SECURITY DEFINER` RPC (`submit_move`, `submit_resign`, `claim_*`, `process_game_result`, `process_stake_game_result`). Это hard boundary.
- RLS на games/moves строго ограничивает прямой UPDATE — даже если кто-то получит anon key из бандла, он не сможет переписать состояние игры.
- Device fingerprint не криптоустойчив — это anti-farm, не AML. Для LTC заменить на FingerprintJS-pro или серверный challenge-response.
- Welcome bonus теперь atomic: один claim на профиль (по `wallet_transactions.transaction_type='welcome_bonus'`) + один на fp.
- Старая функция `processGameResult` оставлена и работает — она вызывается как идемпотентный finalizer и из `submit_move`, и из `useGameResult.handleFinishGame` (последний только для получения payout info, не платит дважды).

---

## Ссылки

- Repo: https://github.com/braindiggeruz/shashki-royale
- Migration file: `supabase/migration_v5_secure_moves.sql`
- Supabase project: `jsykbnkbrwwsxcdurzcw`
- Cloudflare project: `shashki-royale`
