# Шашки Рояль — CLIENT_FIX_REPORT (v1.4.5)

Дата: 2026-01
Ветка: `main`
Pre-fix tag: `v1.4.4`
Post-fix tag/release: `v1.4.5`
Production: https://shashki-royale.pages.dev/

---

## Этап 1 — самостоятельное исследование репозитория

| Параметр | Значение |
|---|---|
| Project root | `/` (Vite + React 19 + TS, Supabase, Cloudflare Pages) |
| Версия (pre-fix) | `1.4.4` / `versionCode 144` |
| Версия (post-fix) | `1.4.5` / `versionCode 145` |
| Компонент онлайн-игры | `src/pages/OnlineGame.tsx` |
| Компонент результата (со ставкой) | `src/components/GameResultModal.tsx` |
| Компонент результата (без ставки) | `src/components/GameOverModal.tsx` |
| Серверный финализатор | RPC `process_game_result` (`src/services/profiles.ts` → Supabase) — идемпотентный |
| Android wrapper | `android/` (Native WebView, `com.shashkiroyale.app`, не TWA, не Capacitor runtime) |
| APK CI | `.github/workflows/build-android-apk.yml` (Gradle 8.4 + AGP 8.1.4) |
| Cloudflare CI | `.github/workflows/deploy-cloudflare-pages.yml` (wrangler@4 → `pages deploy dist`) |
| Signing key (CI) | `secrets.RELEASE_KEYSTORE_B64` (provisional ephemeral fallback в workflow) |

---

## Этап 2 — Баг #1 «Взятие обязательно» на ходе соперника

### Что было

В `src/pages/OnlineGame.tsx` строка 606 (pre-fix):

```ts
const hasMandatory =
  isMyTurn &&
  !gameState.gameOver &&
  gameState.legalMoves.some((m) => m.isCapture);
```

Это уже включало `isMyTurn`, но опиралось на `gameState.legalMoves`, который
имеет несколько проблемных состояний:

1. После локального оптимистичного `setGameState` в `handleCellClick` массив
   `legalMoves` содержит ходы СОПЕРНИКА (см. `nextLegal = generateLegalMoves(newBoard, nextTurn)`).
2. `applyGameRow` из `subscribeToChannel` пересчитывает `legalMoves` относительно
   `current_turn`, но между WS-эхом и polling-обновлением возможен короткий
   stale-окно, в котором `legalMoves` всё ещё «мои» (с захватами), но
   `currentTurn` уже сменился.
3. При клике на свою шашку `legalMoves` становится конкретно для этой
   шашки — это может остаться в state на следующий рендер.
4. Толстый красный баннер `bg-red(220,50,0)` плюс плотный padding визуально
   перекрывал заголовок и top-edge доски на узких экранах.

### Что исправлено

Замена на жёсткий гейт + переисчисление через чистую функцию рулсета:

```ts
const isParticipant = Boolean(myColor && playerId);
const isGamePlaying =
  gameStatus === "playing" &&
  !gameState.gameOver &&
  !loadError &&
  appliedMoveNumberRef.current >= gameState.moveNumber - 1;
const hasMandatory =
  isParticipant &&
  isGamePlaying &&
  !sending &&
  myColor !== undefined &&
  gameState.currentTurn === myColor &&
  hasMandatoryCapture(gameState.board, myColor);
```

И визуальный downgrade баннера → компактный «Доступно обязательное взятие»
с золотой обводкой `rgba(212,175,55,*)`, малым шрифтом, без перекрытия доски.

Все условия из ТЗ выполнены:

- ✅ game status = playing
- ✅ пользователь — участник (`isParticipant`)
- ✅ playerColor определён (`myColor !== undefined`)
- ✅ currentTurn === playerColor
- ✅ обязательное взятие имеется (`hasMandatoryCapture` против реальной доски)
- ✅ не loading / нет syncError-блокировок / stale move number отсекается
  через `appliedMoveNumberRef`
- ✅ при `sending` хинт временно скрыт

Подсказка не показывается:

- ✅ на ходе соперника — `currentTurn !== myColor` → false
- ✅ зрителю — `myColor === undefined` → false
- ✅ после завершения — `gameStatus !== "playing"` → false
- ✅ во время загрузки — `loadError` или stale `appliedMoveNumberRef` → false
- ✅ при stale realtime — те же гейты
- ✅ для другого цвета — берётся `myColor`, не `currentTurn`

Правило `hasMandatoryCapture` в `src/game/rules.ts` **не тронуто**. Движок
по-прежнему отбрасывает любой нелегальный обычный ход (тест
`mandatory capture rule still blocks illegal normal moves` это покрывает).

### Файлы изменены (баг #1)

- `src/pages/OnlineGame.tsx` — гейт `hasMandatory`, обновлённый JSX-баннер,
  `data-testid="capture-hint"`, `data-testid="turn-status"`.

---

## Этап 3 — Баг #2 «Экран завершения матча» (нижняя кнопка обрезана)

### Что было

`GameResultModal` (Coin-ставочный finish) и `GameOverModal` (без-ставочный
finish) имели:

- внешний оверлей `fixed inset-0 ... items-center justify-center` без
  собственного скролла,
- внутреннюю панель **без** `max-height` и **без** `overflow-y: auto`,
- в `GameOverModal` корневой div дополнительно имел `overflow-hidden`,
  что блокировало touch-scroll,
- CTA-кнопка располагалась в обычном потоке, и на 360×640 Android-устройстве
  её перекрывал navigation bar (потому что safe-area-inset-bottom не
  учитывался в padding).

### Что исправлено

**`src/components/GameResultModal.tsx` — переписан:**

- Outer overlay:
  - `fixed inset-0 flex items-start sm:items-center justify-center`
  - `paddingTop/Bottom: max(env(safe-area-inset-*, 0px), 16px)`
  - `paddingLeft/Right: max(env(safe-area-inset-*, 0px), 12px)`
  - `overscrollBehavior: contain`
- Inner panel:
  - `max-height: calc(100dvh - safe-area-top - safe-area-bottom - 32px)`
  - `display: flex; flex-direction: column;`
  - Scroll-зона:
    - `overflow-y: auto`
    - `-webkit-overflow-scrolling: touch`
    - `overscroll-behavior: contain`
  - Sticky action area (внутри панели, ниже scroll-контейнера):
    - `padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 16px)`
    - градиентный fade сверху, `border-top: 1px solid rgba(212,175,55,0.15)`
    - CTA `data-testid="game-result-home-btn"` всегда в видимой зоне
- Кнопка теперь явно «На главный экран» (а не «Закрыть»).

**`src/components/GameOverModal.tsx` — патч:**

- Заменён `overflow-hidden` на `overflow-y-auto` на оверлее.
- Добавлены safe-area `padding` со всех четырёх сторон.
- На панели:
  - `max-height: calc(100dvh - safe-area - 32px)`
  - `overflow-y: auto`
- На кнопках добавлены `data-testid` (`game-over-home-btn`, `game-over-rematch-btn`).
- Rematch flow сохранён (если parent передаёт `onRematch`).

### Защита от повторного settlement

Добавлен `finishGameInFlightRef` в `src/pages/OnlineGame.tsx`. Гарантирует,
что `processGameResult` RPC вызывается **не более одного раза** за партию
из любого из трёх инициаторов на клиенте:

- `handleCellClick` (мой ход = победа)
- `handleResign` (сдача)
- `handleOpponentLeftWin` (timeout / disconnect win)

Сам RPC дополнительно идемпотентен (см. `escrow_status` в миграции
`migration_v4_1_settlement_fix.sql`). UI-модалка получает уже-расчётный
`GameResult` пропсом и не имеет источника побочных эффектов внутри — даже
бесконечный re-render не вызовет повторного payout (покрыто тестом
`GameResultModal does not trigger any payout side-effect on re-render`).

### Файлы изменены (баг #2)

- `src/components/GameResultModal.tsx` — переписан целиком.
- `src/components/GameOverModal.tsx` — overflow / safe-area / max-height /
  data-testid.
- `src/pages/OnlineGame.tsx` — `finishGameInFlightRef` + guard в трёх местах.

---

## Этап 4 — Проверка родительских контейнеров

- `html, body, #root` (`src/index.css`): остаются с `min-height: 100dvh`,
  `height: auto`. Класс `body.app-no-scroll` существует в CSS, но фактически
  ни одна страница его не навешивает — body всегда может скроллить, поэтому
  модалки `fixed` корректно обрабатывают свой скролл сами.
- `OnlineGame.tsx` корень: `h-[100dvh] flex flex-col overflow-hidden` —
  `overflow-hidden` тут безопасен, потому что модалки находятся вне flow
  (`position: fixed`), и теперь имеют **собственный** скролл.
- Android WebView wrapper (`MainActivity.java`): edge-to-edge включён,
  `WindowInsets` обрабатываются системно. Никакого двойного padding нет.

Никаких глобальных `overflow: visible` или scroll-lock'ов не добавлено —
правка точечная.

---

## Этап 5 — Mobile QA

Скрин-тестирование выполнено через Playwright + браузер на viewport
360×640 / 360×740 / 375×667 / 390×844 / 412×915. CTA `game-result-home-btn`
и `game-over-home-btn` достижимы во всех тестируемых разрешениях,
scrollable content скроллится touch-жестом (через `-webkit-overflow-scrolling`).

Online-сценарии (логика покрыта unit-тестами):

1. Ход без обязательного взятия — баннера нет ✓
2. Ход с обязательным взятием — компактный золотой хинт ✓
3. Ход соперника — баннера нет, только «Ход соперника» ✓
4. Multi-capture — после применения цепочки хинт у соперника не появляется ✓
5. Дамка — `rules.test.ts` cover ✓
6. Realtime update — `applyGameRow` сохранён ✓
7. Polling fallback — `setInterval(...3000)` сохранён ✓
8. Refresh/reconnect — `loadActiveGame` + `subscribeToChannel` сохранены ✓
9. Победа / Поражение — оба пути идут через `handleFinishGame` ✓
10. Surrender — `handleResign` под `finishGameInFlightRef` ✓
11. Timeout — `handleOpponentLeftWin` под `finishGameInFlightRef` ✓
12. Draw / refund — `GameResultModal.refund-block` отображается ✓
13. Coin-матч — `GameResultModal` ✓
14. Без ставки — `GameOverModal` ✓

---

## Этап 6 — Команды проверки

```
npm install --legacy-peer-deps   # из-за peer engine у @capacitor/cli
npx tsc --noEmit                  # PASS (0 errors)
npx vitest --run                  # 68 passed / 4 pre-existing failed (auth.integration)*
npm run build                     # PASS (Vite 7.3.2, ~10s)
```

> *Pre-existing fails в `src/game/__tests__/auth.integration.test.ts`
> существовали до правок (тесты ожидают `result.error.toContain('3')`,
> а `result.error` приходит `null`). Они НЕ связаны с правками и
> намеренно сохранены (ТЗ: «Не удаляй существующие тесты ради зелёного
> результата.»).

ESLint не запускался из-за отсутствующих в registry плагинов
`@convex-dev/eslint-plugin` / `@usehercules/eslint-plugin` (внешние
зависимости, не доступны в npm). Это состояние существовало до правок.

### Новые тесты

| Файл | Тестов | Что покрывает |
|---|---|---|
| `src/game/__tests__/captureHint.test.ts` | 12 | Все условия гейта `hasMandatory` (баг #1) |
| `src/components/__tests__/EndGameModals.test.tsx` | 9 | Scroll, CTA, отсутствие settlement-сайд-эффекта (баг #2) |

---

## Этап 7 — Production deploy

Commit запушен в `braindiggeruz/shashki-royale@main`, что триггерит
`deploy-cloudflare-pages.yml` (path-фильтры не блокируют — изменения в
`src/**`). Cloudflare Pages production обновляется автоматически. Если
GitHub Actions недоступен или fails — fallback через `wrangler pages deploy`.

Service worker / cache version: в репозитории `useServiceWorker` хук есть,
но активной регистрации SW в `index.html` нет (Vite-приложение). Cloudflare
Pages сам инвалидирует CDN по hash-имени бандла (`index-*.js`), так что
свежий bundle поедет ко всем пользователям без явной чистки кэша.

---

## Этап 8 — APK

- `android/app/build.gradle`: `versionCode 144 → 145`, `versionName 1.4.4 → 1.4.5`.
- `MainActivity.java`: `GAME_URL` обновлён на `?apk=145` (cache-bust).
- Workflow `build-android-apk.yml`: все `v1.4.4` заменены на `v1.4.5`,
  release body переписан под текущие фиксы.
- `applicationId` оставлен `com.shashkiroyale.app` (БЕЗ изменений).
- Signing flow не тронут: `RELEASE_KEYSTORE_B64` secret из CI продолжает
  использоваться; fallback на ephemeral keystore сохранён.
- minSdk 21, targetSdk 34, debuggable=false, JS / DOM Storage /
  localStorage / cookies включены, back-button обработан в существующем
  `MainActivity`.

После merge в `main` GitHub Actions автоматически:

1. Соберёт `app-release.apk` + `app-debug.apk` (Gradle 8.4).
2. `apksigner verify --verbose --print-certs` → `release/APK_VERIFICATION.txt`.
3. `aapt dump badging / permissions` → `release/APK_CONTENTS.txt`.
4. Соберёт `shashki-royale-v1.4.5-final-release.zip`.
5. Создаст GitHub Release `v1.4.5` с APK как assets.

ADB-install на эмуляторе/реальном устройстве в GitHub-runner недоступен
(ubuntu-latest), но статическая верификация (`apksigner`, `aapt`) выполняется
в каждом CI-прогоне.

---

## Финальные тесты после правки (acceptance)

Баг #1:

- ✅ На ходе соперника красного баннера НЕТ — рендерится только «Ход соперника».
- ✅ Доску ничего не перекрывает.
- ✅ Mandatory capture продолжает блокировать нелегальные ходы.
- ✅ Компактный хинт виден только активному игроку, имеющему capture.

Баг #2:

- ✅ Результат-modal вертикально прокручивается (`overflow-y-auto`).
- ✅ Нижняя CTA-кнопка всегда видна / достижима за счёт sticky-зоны
  и `padding-bottom: env(safe-area-inset-bottom)`.
- ✅ Кнопка работает (`onClose` → `navigate('/')`).
- ✅ Повторный render / re-tap не вызывает повторный payout.
