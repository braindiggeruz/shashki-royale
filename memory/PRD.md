# PRD — Шашки Рояль (Russian Checkers)

## Original Problem Statement
Mobile-first Russian-checkers game with online multiplayer (русские шашки + онлайн).
Repo: https://github.com/altynkanafina1-ship-it/shashki-royale  
Stack: Vite + React 19 + TypeScript + Supabase + Capacitor (Android).

The user requested:
1. UI/UX fixes for the in-game board (overlapping elements, "Ход 6" label, duplicate "Вы: чёрные" badge, oversized "Взятие обязательно" warning, captured counters overlapping the board).
2. Full code audit of `OnlineGame.tsx`, `gameRooms.ts`, `Board.tsx`, `rules.ts` (selectedPiece cleanup, isMyTurn guard, realtime deps, room cleanup, mandatory capture, multi-capture chain, promotion).
3. Usability (Back-button confirmation that returns to lobby, loading states, error notifications).
4. Build a working Android APK via Capacitor.

## Architecture
- **Frontend**: Vite/React/TS at `/app/frontend`, served by `vite` on port 3000.
- **Online backend**: Supabase (Postgres + Realtime). RLS via `set_player_context` RPC.
- **Local game**: pure client-side, no network.
- **Mobile**: Capacitor 8 → Android (debug APK built locally with Gradle 8.14 + JDK 21 + Android SDK 34).

## What was implemented (29-Apr-2026)

### UI/UX (DONE)
- `OnlineGame.tsx`:
  - Removed `Ход N` from header.
  - Removed duplicated "Вы: чёрные" badge (color shown in PlayerCard now).
  - Removed `max-h-[60vh]` board cap → board fills remaining space.
  - Compact turn indicator merged with mandatory-capture warning (single inline banner).
  - Captured counters relocated **inside** PlayerCard (per-player chip, no separate bottom bar).
  - Back button now opens an exit-confirm modal (resigns then navigates to /lobby).
- `LocalGame.tsx`: same compact layout treatment for consistency.
- `PlayerCard.tsx`: added `capturedCount` and `isMe` props; tighter padding/avatar.
- `Board.tsx`: switched sizing to `width:100% + maxHeight:100% + aspect-ratio:1` so the board grows to the smaller container dimension and can no longer be overlapped by chrome.

### Code Audit (verified)
- `selectedPiece` is cleared after every move (success or invalid) in `handleCellClick`.
- `isMyTurn`/`gameOver`/`sending` guard at the very top of `handleCellClick`.
- Realtime subscription `useEffect` deps include `[gameId, myColor, applyGameRow, subscribeToChannel]` with auto-resubscribe on `CLOSED|CHANNEL_ERROR`.
- `findAndJoinRandomRoom` calls `cleanupOldRooms(playerId)` first, filters `.neq("white_player_id", playerId)` (no self-joining), uses FIFO `created_at ASC`, and a race-safe `eq("status","waiting")` on the join update.
- `rules.ts`: `generateLegalMovesForPiece` already enforces mandatory captures (`hasMandatoryCapture`) and `generateCapturesForPiece` recursively builds multi-capture chains with `visitedCaptures` set.
- `applyMove.ts` promotes pieces to king on the back rank.

### Usability (DONE)
- Exit confirmation modal ("Выйти из игры? Текущая партия будет засчитана как поражение." → resigns + navigates to `/lobby`).
- Inline `Отправка хода…` loading state already present.
- `syncError` red banner on network failure with state rollback already present.
- Connection-lost / reconnect / "Соперник походил" indicators kept and made compact.

### APK
- Java 21 (Temurin) + Android SDK 34 + Gradle 8.14.3 installed in `/opt/jdk21` & `/opt/android-sdk`.
- `npx cap add android` + `cap sync android` succeeded.
- `./gradlew assembleDebug` succeeded → **`/app/shashki-royale-debug.apk` (8.1 MB)**.
- Verified via `aapt`: package `com.shashki.royal`, label "Шашки Рояль", min SDK 24, target 36.

### Tests
- `npx tsc -b` passes (no TS errors).
- `vitest run`: 47/51 unit tests pass; 4 pre-existing failures in `auth.integration.test.ts` (not related to current changes — error message text expectations against `null`).

## Backlog / P0 / P1 / P2
- **P0**: Configure `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` in `frontend/.env` for online play (currently empty — online mode shows "Онлайн-режим не настроен").
- **P0**: Re-test online flow end-to-end with two browser sessions once Supabase keys are added.
- **P1**: Sign release APK with a keystore (`./gradlew assembleRelease` after configuring `keystorePath` in `capacitor.config.ts`).
- **P1**: Fix the 4 failing auth integration tests (likely need updated mock so `result.error` is a string, not null).
- **P2**: Add memo'd `Cell`/`Piece` to reduce Board re-renders on each move.

## Next Action Items for User
1. Pull the changes locally (the project at `/app/frontend` is the patched copy — copy back into your repo or `git diff` to merge).
2. Add Supabase env vars to `frontend/.env` and re-test online play.
3. For a Play-Store-ready release APK, generate a keystore and run `./gradlew assembleRelease`.
4. Push to GitHub via the chat input's **Save to GitHub** action.
