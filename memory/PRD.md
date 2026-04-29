# PRD — Шашки Рояль (Russian Checkers)

## Original Problem Statement
Mobile-first Russian-checkers game with online multiplayer.  
Repo: https://github.com/altynkanafina1-ship-it/shashki-royale  
Stack: Vite + React 19 + TypeScript + Supabase + Capacitor (Android).

## Architecture
- **Frontend**: Vite/React/TS at `/app/frontend`, served by `vite` on port 3000.
- **Backend**: Supabase (Postgres + Realtime). URL: `https://jsykbnkbrwwsxcdurzcw.supabase.co`. RLS via `set_player_context` RPC.
- **Mobile**: Capacitor 8 → Android (debug APK at `/app/shashki-royale-debug.apk`, 8.2 MB).

## What was implemented (29-Apr-2026)

### Session 1 — UI/UX, audit, APK
- `OnlineGame.tsx` + `LocalGame.tsx`: removed «Ход N», dup «Вы: чёрные», `max-h-[60vh]`; mandatory-capture warning merged with turn indicator; captured counters baked into `PlayerCard`; board now sized via `aspect-ratio:1 + maxHeight:100%` and fills max space; Back button → exit-confirm modal → resign + redirect to `/lobby`.
- `PlayerCard.tsx`: added `capturedCount` and `isMe` props.
- Code-audit verified all flagged points were already correctly implemented (selectedPiece cleanup, isMyTurn guard, realtime auto-reconnect, FIFO room search, no self-join, mandatory-capture in `rules.ts`, multi-capture chains, promotion).
- Built first debug APK with Java 21 + Android SDK 34 + Gradle 8.14.

### Session 2 — Quickplay matchmaking refactor (current)
- **Bug fix**: `findAndJoinRandomRoom` previously could grab a friend-room (created by code) and «steal» it for a quickplay user. Now filters by `play_mode='quickplay'` (column name `play_mode` chosen because PostgreSQL `mode` is a reserved aggregate function and PostgREST refuses to filter by it).
- **DB migration** at `frontend/supabase/migrations/20260429_add_mode_to_games.sql` adds `play_mode` column (CHECK quickplay|friend), partial index for fast waiting-room search, plus optional denormalized `*_player_name`, `started_at`, `finished_at`. **User must run this once** in Supabase Dashboard → SQL Editor.
- **Backwards-compat**: code transparently falls back to non-mode-filtered behavior if the column doesn't exist yet (handles error codes `42703`, `PGRST204`). After migration, the filter activates.
- **Lobby UX**: new `quickplay_waiting` state with elapsed-second timer, animated search ring, helpful tip («Подскажите другу: пусть тоже нажмёт «Быстрая игра»…»). Friend-mode flow unchanged (room code + share UI).
- **Cancel cleanup**: `goBack()` now marks the user's own waiting-room as `finished` immediately so it doesn't sit in the matchmaking queue.
- Re-built APK at `/app/shashki-royale-debug.apk` (8.2 MB) with all changes.

### End-to-end tests (passed in two browser contexts)
- Friend-mode (session 1): P1 created room `2FUH8S` → P2 entered code via keypad → matched as black → P1 (white) moved → P2 received realtime update with «Соперник походил ✓» banner and legal-move dots.
- Quickplay (session 2): P1 clicked «Быстрая игра» → entered waiting screen with timer/tip → P2 clicked «Быстрая игра» → both navigated to same gameId, P1=white, P2=black, toast «Соперник найден!» shown on both.

## Backlog / P0 / P1 / P2
- **P0 (user action)**: Run `frontend/supabase/migrations/20260429_add_mode_to_games.sql` in Supabase Dashboard. Until then, friend-rooms are still grabbable by quickplay (the fallback path).
- **P1**: Sign release APK with a keystore (`./gradlew assembleRelease` after configuring `keystorePath` in `capacitor.config.ts`).
- **P1**: Fix 4 pre-existing failures in `auth.integration.test.ts` (assertion expects string, gets null).
- **P2**: Memo `Cell`/`Piece` to reduce Board re-renders.
- **P2**: Wire denormalized `white_player_name`/`black_player_name` for instant opponent display in waiting screen.

## Next Action Items for User
1. Apply the SQL migration in Supabase Dashboard.
2. Pull `/app/frontend` changes back into your repo (or use «Save to GitHub» from the chat input).
3. Install `shashki-royale-debug.apk` on a physical device for on-hardware verification.
4. Generate keystore + run `./gradlew assembleRelease` for Google Play.
