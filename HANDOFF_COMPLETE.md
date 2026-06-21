# 🎯 Шашки Рояль — Complete Handoff (v1.4.9)

> **Этот файл — единственный источник правды для следующего агента.**
> Прочитай его целиком перед любыми изменениями. Все остальные `HANDOFF_*.md`
> в репо устаревшие — этот свежее всех (написан 2026-06-21 после полного
> finishing-спринта v1.4.8 → v1.4.9).

---

## 1. Что это за проект

**«Шашки Рояль»** — мобильный/PWA онлайн-сервис для русских шашек с
внутренней валютой Coin (₡) и ставочными матчами.

* **Production:** https://shashki-royale.pages.dev/
* **Native Android APK:** WebView-обёртка вокруг production URL,
  package `com.shashkiroyale.app`. Грузит prod при каждом запуске —
  поэтому фронтенд-фиксы доходят до APK-юзеров без пересборки.
* **GitHub repo:** https://github.com/braindiggeruz/shashki-royale
* **Branch:** `main`
* **Supabase project ref:** `jsykbnkbrwwsxcdurzcw`
* **Cloudflare Pages project:** `shashki-royale`
* **Latest commit on `main` (2026-06-21):** `eaf97f0` (wallet RPC fix)
* **Latest GitHub Release:** `v1.4.8` —
  https://github.com/braindiggeruz/shashki-royale/releases/tag/v1.4.8

### Ключевой инвариант (НЕ НАРУШАТЬ)

> **Coin — это внутренняя игровая валюта без вывода и без real-money
> ценности.** Перспектива: 1 Coin ≈ 1 USD в будущем. Поэтому:
>
> * НЕ добавлять платежи / депозиты / withdrawals / крипту / Stripe.
> * НЕ начислять большие free бонусы (welcome 100 ₡ — максимум).
> * НЕ давать награды за daily login / streak в Coin (только cosmetic
>   badge).
> * Реферальная награда — **1 ₡** пригласившему, **только** после 3
>   реально сыгранных партий приглашённого.

---

## 2. Доступы / Tokens / Credentials

### 2.1 GitHub

* **Owner:** `braindiggeruz`
* **PAT (full repo write):** запросить у владельца — не храним в репо
  (GitHub Secret Scanning блокирует push с literal PAT). Владелец
  передаст в чате при старте сессии.

  Используется для:
  * `git clone https://braindiggeruz:<PAT>@github.com/braindiggeruz/shashki-royale.git`
  * REST API `https://api.github.com/repos/braindiggeruz/shashki-royale/...`
  * Upload assets в Releases (`uploads.github.com`)

### 2.2 Supabase

* **Project ref:** `jsykbnkbrwwsxcdurzcw`
* **Project URL:** `https://jsykbnkbrwwsxcdurzcw.supabase.co`
* **SQL Editor (для миграций):**
  https://supabase.com/dashboard/project/jsykbnkbrwwsxcdurzcw/sql/new
* **Anon key (можно использовать без секретов — публикуется в bundle):**
  Извлекается из production bundle:
  ```bash
  curl -s "https://shashki-royale.pages.dev/assets/index-XXXXXX.js" \
    | grep -oE 'eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+' | head -1
  ```
  JWT payload: `{"iss":"supabase","ref":"jsykbnkbrwwsxcdurzcw","role":"anon","iat":1777102921,"exp":2092678921}`
* **Service role / DB password — НЕ доступны агенту.** Все DDL/RPC
  миграции применяются вручную владельцем через Supabase Dashboard
  SQL Editor.

### 2.3 Cloudflare

* **Pages project:** `shashki-royale`
* **Production URL:** https://shashki-royale.pages.dev/
* **API token и Account ID** хранятся в GitHub Secrets
  (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`) — агенту напрямую
  недоступны, но workflow их использует автоматически.
* **Deploy flow:** `git push origin main` → GitHub Action
  `Deploy to Cloudflare Pages` (~1–2 минуты) → авто-деплой `dist/`.
  Никаких ручных действий не требуется.

### 2.4 Android signing

* GitHub Secrets:
  * `RELEASE_KEYSTORE_B64` — base64 keystore (persistent, тот же что
    использовался для v1.4.6, v1.4.7, v1.4.8).
  * `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`
* **Certificate fingerprint (НЕ потерять — иначе Android не пустит
  upgrade с предыдущей версии):**
  * DN: `CN=Shashki Royale, OU=Game, O=ShashkiRoyale, L=Tashkent, ST=TK, C=UZ`
  * SHA-256: `9a546cf31f0ee44357fc101f9984d096ea882e4ebbb75ef61a0ab4163f8c05c6`
  * SHA-1: `8e48d30a7053977d8d579b9eb27d50122e9d24f7`

---

## 3. Стек

* **Frontend:** React 19 + Vite 7 + TypeScript 5.9
* **State:** React hooks + модульный профиль-кэш (без Redux/Zustand)
* **Routing:** react-router-dom v7
* **UI:** Tailwind v4 + Radix UI + motion (Framer Motion) + lucide-react
* **i18n:** i18next + react-i18next (RU + UZ)
* **Backend:** Supabase (Postgres + Realtime + RPC + RLS)
* **Auth:** Supabase Auth + анонимный fallback (player_id из localStorage)
* **PWA:** Service Worker `/public/sw.js`
* **Hosting frontend:** Cloudflare Pages
* **Native Android:** минимальный WebView wrapper в `android/app`
* **CI/CD:** GitHub Actions
  * `.github/workflows/deploy-cloudflare-pages.yml` — пуш в `main` → деплой
  * `.github/workflows/build-android-apk.yml` — пуш в `android/**` →
    собрать APK + создать Release
* **Package manager:** **pnpm** (не yarn, не npm — в репо `pnpm-lock.yaml`)

---

## 4. Структура репо

```
/app/  (or whatever cwd you cloned into)
├── public/
│   ├── sw.js                    ← Service Worker, CACHE_VERSION = 'v1.4.9-wallet-rpc'
│   ├── reset.html               ← Самоочищающаяся страница (см. раздел 11)
│   ├── icon/                    ← PWA иконки
│   └── site.webmanifest
├── src/
│   ├── App.tsx                  ← Корневой компонент, роутер
│   ├── main.tsx                 ← Entry point
│   ├── index.css                ← Tailwind base + custom CSS variables
│   ├── i18n.ts                  ← i18next setup
│   ├── components/
│   │   ├── Board.tsx            ← Доска
│   │   ├── Piece.tsx
│   │   ├── PlayerCard.tsx       ← Карточка игрока + win-streak бейдж 🔥
│   │   ├── EngagementStrip.tsx  ← Полоска статистики на главной (v1.4.8)
│   │   ├── GameOverModal.tsx    ← Модалка результата + share + rematch (v1.4.8)
│   │   ├── GameResultModal.tsx  ← Модалка для ставочных партий
│   │   ├── WalletDisplay.tsx    ← Отображение баланса. Использует getWallet → RPC (v1.4.9 fix)
│   │   ├── QuickStakeBar.tsx    ← Быстрый матч 1/5/10/25/50 ₡
│   │   ├── MatchmakingOverlay.tsx
│   │   ├── ProtectedRoute.tsx
│   │   └── ui/                  ← Radix-обёртки (shadcn-style)
│   ├── pages/
│   │   ├── Index.tsx            ← Главный экран
│   │   ├── Lobby.tsx            ← Лобби для онлайн-партий
│   │   ├── OnlineGame.tsx       ← Игра онлайн (через submit_move RPC)
│   │   ├── LocalGame.tsx        ← Локальная партия (без сервера)
│   │   ├── StakeLobbyPage.tsx
│   │   ├── WalletPage.tsx
│   │   ├── ProfilePage.tsx
│   │   ├── LeaderboardPage.tsx
│   │   ├── Rules.tsx
│   │   └── auth/
│   │       ├── Login.tsx
│   │       ├── Signup.tsx
│   │       └── ResetPassword.tsx
│   ├── services/
│   │   ├── profiles.ts          ← getOrCreateProfile, updateProfile, processGameResult
│   │   ├── stakes.ts            ← getWallet (через RPC!), createStakeGame, etc.
│   │   ├── gameRooms.ts         ← fetchGame, listOpenRooms (без UPDATE/INSERT — RLS блокирует)
│   │   ├── secureMoves.ts       ← submitMove, submitResign, claimTimeoutWin, claimWelcomeBonus
│   │   └── engagement.ts        ← updateEngagementAfterGame, registerReferral, claimReferralPayout, recordDailyLogin
│   ├── hooks/
│   │   ├── usePlayerId.ts       ← Гибрид: auth.user.id ИЛИ localStorage UUID
│   │   ├── useAuthState.ts      ← Supabase Auth state listener
│   │   ├── use-profile.ts       ← TTL-кэшированный профиль + кошелёк
│   │   ├── useAnonymousBootstrap.ts ← Создаёт профиль + welcome bonus + ref pickup
│   │   ├── useGameResult.ts     ← Финализация партии через process_game_result + engagement update
│   │   ├── use-service-worker.ts
│   │   ├── use-audio.ts
│   │   ├── use-debounce.ts
│   │   └── use-mobile.ts
│   ├── lib/
│   │   ├── supabase.ts          ← createClient + setPlayerContext helper
│   │   ├── auth.ts              ← signIn, signUp, signOut, onAuthStateChange, getCurrentUser
│   │   ├── storage.ts           ← getOrCreatePlayerId (localStorage)
│   │   ├── rating.ts            ← Elo rating helpers
│   │   ├── icon-generator.ts
│   │   └── utils.ts
│   ├── game/                    ← Pure game logic (правила, AI, типы)
│   │   ├── types.ts             ← Board, Move, PlayerColor
│   │   ├── rules.ts             ← Локальная валидация ходов (server валидирует независимо)
│   │   └── __tests__/           ← vitest unit tests (rules, captureHint, auth.integration)
│   └── locales/                 ← JSON переводов RU + UZ
├── supabase/
│   ├── schema.sql               ← (старый) base schema
│   ├── FINAL_MIGRATION.sql      ← v1 base (устарел)
│   ├── migration_auth.sql       ← Supabase Auth setup
│   ├── migration_stakes.sql     ← wallets + wallet_transactions + game_stakes + RPCs
│   ├── migration_v2.sql
│   ├── migration_v3_last_move.sql
│   ├── migration_v3_security_fix.sql
│   ├── migration_v4_anonymous_ux.sql  ← get_or_create_profile (welcome bonus 100 Coin!)
│   ├── migration_v4_1_settlement_fix.sql
│   ├── migration_v4_2_explicit_caller_auth.sql ← process_game_result, process_stake_game_result
│   ├── migration_v5_secure_moves.sql  ← server-authoritative submit_move + RLS lockdown (v1.4.7)
│   ├── migration_v6_engagement.sql    ← win_streak, daily_challenge, referrals (v1.4.8)
│   ├── migration_v6_1_welcome_bonus_fix.sql  ← hotfix
│   └── apply_to_supabase.sql    ← КОМБИНИРОВАННЫЙ one-click файл (v6 + v6.1)
├── android/
│   ├── app/
│   │   ├── build.gradle         ← versionCode 148, versionName 1.4.8
│   │   └── src/main/
│   │       ├── AndroidManifest.xml
│   │       ├── java/com/shashkiroyale/app/MainActivity.kt
│   │       └── res/
│   ├── build.gradle
│   ├── gradle.properties
│   └── settings.gradle
├── .github/workflows/
│   ├── deploy-cloudflare-pages.yml
│   └── build-android-apk.yml
├── HANDOFF_v1.4.7.md            ← Историчный (security hardening)
├── HANDOFF_v1.4.8.md            ← Историчный (engagement)
├── HANDOFF_COMPLETE.md          ← ТЫ ЗДЕСЬ (свежее всех)
├── APPLY_MIGRATION.md           ← Как применить v6 миграцию (1 минута)
├── package.json
├── pnpm-lock.yaml               ← ПОЛЬЗОВАТЬСЯ ПОСЛЕДНЕЙ ВЕРСИЕЙ pnpm
├── vite.config.ts
├── tsconfig.json
├── eslint.config.mjs            ← BROKEN: ссылается на @convex-dev/eslint-plugin, не установлен (pre-existing baseline, не блокирует CI)
└── vitest.config.ts
```

---

## 5. База данных — текущее состояние (после всех миграций)

### 5.1 Применённые миграции в production Supabase

| Миграция                                 | Что добавила                                                                  | Статус |
|------------------------------------------|--------------------------------------------------------------------------------|--------|
| `migration_stakes.sql`                   | `wallets` + `wallet_transactions` + `game_stakes` + базовые RPC                | ✅ applied |
| `migration_auth.sql`                     | Supabase Auth интеграция                                                       | ✅ applied |
| `migration_v2.sql`                       | profiles полировка                                                             | ✅ applied |
| `migration_v3_last_move.sql`             | `games.last_move_*` колонки                                                    | ✅ applied |
| `migration_v3_security_fix.sql`          | первый раунд RLS lockdown                                                      | ✅ applied |
| `migration_v4_anonymous_ux.sql`          | get_or_create_profile с welcome bonus 100 Coin                                 | ✅ applied |
| `migration_v4_1_settlement_fix.sql`      | process_game_result idempotent                                                 | ✅ applied |
| `migration_v4_2_explicit_caller_auth.sql`| process_game_result принимает p_caller_player_id                               | ✅ applied |
| `migration_v5_secure_moves.sql`          | submit_move + RLS lockdown + claim_welcome_bonus + anti-farm fp                | ✅ applied |
| `migration_v6_engagement.sql`            | win_streak, daily_challenge, register_referral, claim_referral_payout          | ✅ applied (вручную через Dashboard 2026-06-21) |
| `migration_v6_1_welcome_bonus_fix.sql`   | hotfix `claim_welcome_bonus` (column names + valid CHECK)                      | ✅ applied (вручную) |
| **brutal balance restore SQL**           | `UPDATE wallets SET crypto_balance = GREATEST(crypto_balance, 1000)`           | ✅ applied (вручную, 830 wallets обновлено) |

### 5.2 Ключевые таблицы

#### `profiles`
```
id                       UUID PK
player_id                TEXT UNIQUE   ← или 'p_xxx' (анон) или 'auth_<supabase_user_id>'
nickname                 TEXT
avatar_index             INT
avatar_url               TEXT NULL     ← Google profile picture
display_name             TEXT NULL
rating                   INT DEFAULT 1000
total_games, wins, losses, draws  INT
device_fp_hash           TEXT          ← v5 anti-farm
-- v6 engagement columns:
win_streak               INT DEFAULT 0
best_win_streak          INT DEFAULT 0
daily_challenge_date     DATE
daily_challenge_wins     INT DEFAULT 0
referrer_id              TEXT          ← player_id того кто пригласил
referral_paid            BOOL          ← idempotency для claim_referral_payout
referred_games_played    INT DEFAULT 0 ← счётчик чтобы платить рефералу только после 3 партий
-- auth + misc:
auth_user_id             UUID NULL     ← если зарегистрирован через Supabase Auth
email                    TEXT NULL
created_at, updated_at, last_seen_at TIMESTAMPTZ
```

#### `wallets`
```
profile_id      UUID PK FK→profiles
crypto_balance  NUMERIC(20,2) DEFAULT 1000.00 CHECK >= 0   ← реальное "1 ₡"
locked_balance  NUMERIC(20,2) DEFAULT 0       ← заблокировано в active stake
updated_at      TIMESTAMPTZ
```

#### `wallet_transactions`
```
id            UUID PK
profile_id    UUID FK
game_id       UUID FK NULL
type          TEXT CHECK IN ('deposit','withdrawal','fee_lock','fee_refund','prize_payout','starting_bonus','loss')
amount        NUMERIC(20,2) CHECK >= 0
status        TEXT CHECK IN ('pending','completed','failed') DEFAULT 'completed'
note          TEXT
created_at    TIMESTAMPTZ
```

> **ВАЖНО:** колонки **`type` / `note`** (не `transaction_type` / `description`).
> Welcome bonus метим как `type='starting_bonus'` + `note='Welcome bonus'`
> (тип `welcome_bonus` НЕ существует в CHECK — это был latent bug v5).

#### `games`
```
id              UUID PK
white_player_id, black_player_id  TEXT
status          TEXT IN ('waiting','playing','finished','cancelled')
current_turn    TEXT
move_number     INT
board_state     JSONB
winner          TEXT NULL
resign_reason   TEXT NULL
last_move_at, last_from_*, last_to_*  ← v5
created_at, updated_at
```

#### `moves`
```
id              UUID PK
game_id         UUID FK
move_number     INT
player_color    TEXT
move_data       JSONB   ← массив jumps (как принимает submit_move)
board_state     JSONB
created_at      TIMESTAMPTZ
```

#### `game_stakes`
```
id              UUID PK
game_id         UUID UNIQUE FK
entry_fee       NUMERIC(20,2) CHECK >= 1 AND <= 10000
pot_amount      NUMERIC(20,2)
white_profile_id, black_profile_id  UUID FK
escrow_status   TEXT IN ('waiting','locked','paid','refunded')
payout_status   TEXT IN ('pending','paid','failed','refunded')
created_at, updated_at
```

#### `engagement_log` (v6)
```
game_id       UUID
player_id     TEXT
recorded_at   TIMESTAMPTZ
PRIMARY KEY (game_id, player_id)  ← идемпотентность для update_engagement_after_game
```

#### `action_log` (v5)
```
id           BIGSERIAL PK
player_id    TEXT
action       TEXT   ← e.g. 'create_game'
created_at   TIMESTAMPTZ
-- Используется триггером для rate limit (max 10 create_game / 60s)
```

### 5.3 RPC функции (SECURITY DEFINER)

| RPC                                  | Параметры                                                              | Назначение                                                       |
|--------------------------------------|------------------------------------------------------------------------|------------------------------------------------------------------|
| `set_player_context`                 | `p_player_id text`                                                     | Ставит `app.current_player_id` для RLS этой сессии               |
| `get_or_create_profile`              | `p_player_id text` → `{profile, wallet, is_new}` JSON                  | Idempotent. Возвращает кошелёк ВСЕГДА (обход RLS).               |
| `update_profile`                     | `p_player_id, p_nickname, p_avatar_index`                              | Обновить ник + аватар                                            |
| `submit_move` ⭐                     | `p_game_id uuid, p_player_id text, p_expected_move_number int, p_jumps jsonb` | Атомарный ход: валидация, применение, settlement при game-over   |
| `submit_resign`                      | `p_game_id, p_player_id, p_reason`                                     | Сдача                                                            |
| `claim_timeout_win`                  | `p_game_id, p_player_id, p_timeout_s` (default 90)                     | Засчитать таймаут соперника                                       |
| `cancel_waiting_room`                | `p_game_id, p_player_id`                                               | Отменить свою waiting комнату                                     |
| `claim_welcome_bonus` ⚠️             | `p_player_id, p_device_fp_hash, p_bonus_amount` (default 100)          | После v6.1 hotfix — корректно работает с реальной схемой         |
| `process_game_result`                | `p_game_id, p_winner_player_id, p_finish_reason, p_caller_player_id`   | Settlement (рейтинг + выплата). Идемпотентно.                    |
| `process_stake_game_result`          | (legacy, не трогать)                                                   | Старая версия для ставок                                          |
| `create_stake_game`                  | `p_player_id, p_entry_fee, p_room_code, p_board_state`                 | Создать ставочную партию с escrow                                 |
| `create_anonymous_stake_game`        | (для not-auth)                                                         |                                                                  |
| `cancel_stake_game`                  | `p_game_id, p_player_id`                                               | Возврат entry_fee из escrow                                       |
| **`update_engagement_after_game`** 🔥 | `p_player_id, p_game_id, p_won, p_is_draw`                             | v6. Идемпотентно через `engagement_log`                          |
| **`register_referral`** 🔥           | `p_player_id, p_referrer_id`                                           | v6. Защита от self-ref, повторного set, несуществующего referrer  |
| **`claim_referral_payout`** 🔥       | `p_player_id`                                                          | v6. Платит 1 ₡ referrer-у после 3 партий приглашённого           |
| `request_withdrawal`                 | (есть, но НЕ используется — нет UI и не нужно)                         |                                                                  |

### 5.4 RLS политики

* **`games`**: SELECT — все; INSERT — только если `white_player_id = current_player_id` и `status='waiting'`; UPDATE/DELETE — **запрещено напрямую** (только через SECURITY DEFINER функции).
* **`moves`**: SELECT — все; INSERT/UPDATE/DELETE — **запрещено напрямую**.
* **`profiles`**: SELECT — все (для отображения никнейма соперника); INSERT/UPDATE — только свой.
* **`wallets`**: SELECT — только владельца (по `app.current_player_id`); INSERT/UPDATE через RPC.
* **`wallet_transactions`**: SELECT — только свои; INSERT через RPC.
* **`action_log`**: SELECT — только свои.
* **`engagement_log`**: нет RLS (внутренняя таблица для идемпотентности; не содержит чувствительных данных).
* **`public_profiles`** view: SELECT — все (включая win_streak, best_win_streak).

> **Гарантия безопасности v1.4.7:** даже с украденным anon-ключом
> атакующий не может изменить состояние партии или баланс — все мутации
> идут через `SECURITY DEFINER` функции, которые валидируют caller.

---

## 6. История релизов

| Версия | Commit (short) | Тема                                             |
|--------|----------------|--------------------------------------------------|
| v1.4.2 | —              | Coin/QuickMatch + secure settlement              |
| v1.4.3 | da1b2c1        | Production APK + heavy deps                      |
| v1.4.4 | 4095e00        | APK hotfix InflateException                      |
| v1.4.5 | 8d8ddaf        | Opponent capture warning + mobile scroll         |
| v1.4.6 | 8d8ddaf        | (фикс LocalGame.tsx)                             |
| v1.4.7 | 3627d9d        | **Security hardening**: server-auth submit_move + RLS lockdown |
| v1.4.7 SW | 9d7c81a     | Service worker cache bump                        |
| v1.4.8 | 559f40f        | **Engagement**: win_streak, daily_challenge, referrals, share, rematch |
| v1.4.8 docs| 3c0c20e    | Apply-to-supabase one-click SQL + welcome bonus hotfix + handoff |
| v1.4.9 SW | b5d00bd     | **Self-clearing /reset.html + SW force-reload** |
| v1.4.9 fix| eaf97f0     | **Wallet RPC fix** (race condition в RLS)       |

> **Tag-ом помечена только до `v1.4.8`**. Коммиты `b5d00bd` и `eaf97f0`
> попадают на ту же tag-ветку (v1.4.9 не тегали, потому что не меняли
> APK — только фронт и SW; обновляются автоматически через Cloudflare).

---

## 7. История этого финиш-спринта (2026-06-21)

Контекст: предыдущий агент закончил v1.4.8 (commit `559f40f`), но
закончились кредиты. Я подхватил с этой точки.

### Что я проверил

1. **Commit `559f40f` на месте**, оба workflow (APK + Cloudflare) для него — success.
2. **GitHub Release v1.4.8** уже опубликован с 7 ассетами.
3. **APK release v1.4.8** скачан, верифицирован:
   * `apksigner verify` — v1 + v2 OK
   * SHA-256 cert `9a546cf3…` совпадает с v1.4.7 (persistent keystore)
   * `aapt dump badging`: package + version + sdks правильные
   * 876 файлов, normal size 4.79 MB (не stub)
4. **`pnpm install && tsc -b && pnpm build && vitest run`**:
   * typecheck ✅ clean
   * build ✅ 528 KB / 161 KB gzip
   * tests 68/72 (4 pre-existing auth.integration failures — baseline)
   * lint ❌ pre-existing config bug (eslint.config.mjs ссылается на не-установленный `@convex-dev/eslint-plugin`)
5. **Production smoke**: HTTP 200, SW `v1.4.8`, bundle содержит engagement testids.

### Что я обнаружил (КРИТИЧНО)

#### Bug 1: Migration v6 не была применена в Supabase
* `update_engagement_after_game`, `register_referral`, `claim_referral_payout` — функций нет
* `engagement_log` — таблицы нет
* `public_profiles.win_streak/best_win_streak` — колонок нет
* **Эффект:** все v1.4.8 engagement-фичи silent-fail в production (frontend ловит `error` от RPC и пишет `console.warn`).

#### Bug 2: Welcome bonus сломан с v1.4.7 (latent)
* В console у нового игрока:
  ```
  [useAnonymousBootstrap] welcome bonus claim failed:
  Error: column "transaction_type" does not exist
  ```
* `claim_welcome_bonus` из migration_v5 пытался писать в:
  * `coin_balance` (нет, есть `crypto_balance`)
  * `transaction_type` (нет, есть `type`)
  * `description` (нет, есть `note`)
  * `'welcome_bonus'` (не в CHECK constraint; разрешены: `'starting_bonus'` и др.)
* **Эффект:** функция всегда падала, throw в frontend, BONUS_CLAIMED_KEY не ставился, retry бесконечно. Но wallet всё равно НЕ был перезаписан, потому что транзакция функции откатывалась.
* НО `get_or_create_profile` из migration_v4 при создании НОВОГО wallet'а ставит 100 ₡ сама — так что новые профили после v4 получали bonus. Старые профили (созданные до v4) — нет.

#### Bug 3: getWallet через RLS race condition
* `WalletDisplay.tsx` использует `services/stakes.ts → getWallet(playerId)`.
* Старый код: `setPlayerContext()` → `SELECT FROM profiles → SELECT FROM wallets`.
* PostgREST маршрутизирует эти запросы на разные connection в pool.
* На SELECT-side `current_setting('app.current_player_id')` = NULL → RLS блокирует → wallet вернулся null → UI показал 0.
* **Эффект:** баланс 0 даже при наличии 1000 ₡ в БД.

### Что я сделал

#### Commit `3c0c20e` (docs)
* Создал `supabase/apply_to_supabase.sql` — one-click файл (v6 + v6.1).
* Создал `supabase/migration_v6_1_welcome_bonus_fix.sql` (отдельный hotfix).
* Создал `APPLY_MIGRATION.md` с пошаговой инструкцией.
* Создал `HANDOFF_v1.4.8.md`.
* Прикрепил всё к GitHub Release v1.4.8 как assets (5 файлов).
* Обновил body Release v1.4.8 — добавил блок «⚠️ ВАЖНО — применить SQL».

#### Владелец вручную применил
* `apply_to_supabase.sql` — добавил engagement-колонки + RPC + починил `claim_welcome_bonus`.
* Brutal-restore SQL: `UPDATE wallets SET crypto_balance = GREATEST(crypto_balance, 1000)` — 830 wallets обновлено, каждому ≥ 1000 ₡.

#### Commit `b5d00bd` (self-clearing reset)
* Создал `/public/reset.html` — открывается → чистит localStorage / sessionStorage / cookies / IndexedDB / cacheStorage / serviceWorkers → редиректит на `/?fresh=TS`.
* Изменил `/public/sw.js`: CACHE_VERSION → `v1.4.9-cleanup`, в `activate` добавил `clients.navigate(client.url)` чтобы все открытые вкладки автоматически перезагружались с новым кодом.
* **URL для пользователя:** https://shashki-royale.pages.dev/reset

#### Commit `eaf97f0` (wallet RPC fix)
* В `src/services/stakes.ts::getWallet()` заменил двухшаговый SELECT
  на один вызов `supabase.rpc('get_or_create_profile', ...)`.
* Это устраняет RLS race condition: `get_or_create_profile` —
  SECURITY DEFINER, обходит RLS, всегда возвращает корректный wallet.
* SW cache version → `v1.4.9-wallet-rpc`.

### Финальное состояние (2026-06-21 после спринта)

* ✅ Production: https://shashki-royale.pages.dev/ — SW `v1.4.9-wallet-rpc`, новый bundle `index-Dew5PoTC.js`
* ✅ БД: 830 кошельков с балансом ≥ 1000 ₡, все v6 RPC и таблицы на месте
* ✅ Welcome bonus для новых игроков работает (через get_or_create_profile)
* ✅ Engagement (win_streak, daily_challenge, referrals) работает
* ✅ Self-clearing /reset URL работает
* ✅ APK v1.4.8 валиден, использует prod URL (получает все JS-фиксы автоматически)

---

## 8. Известные проблемы / технический долг

### P0 (надо починить когда будет время)
1. **Double-entry ledger для wallets** (упоминалось в HANDOFF_v1.4.7).
   Сейчас `wallets.crypto_balance` — единственный источник правды.
   Brutal-restore это показал: легко пере-присвоить произвольное значение.
   Для серьёзной экономики нужно `ledger_entries` с
   `balance = SUM(entries)`. ~1 день работы.
2. **Auto-timeout finalizer.** Сейчас `claim_timeout_win` срабатывает
   только когда другой клиент жмёт кнопку. Если оба игрока уйдут —
   партия зависнет в `playing`. Решение: pg_cron job который раз в
   2 минуты вызывает `claim_timeout_win` для всех `playing` партий
   с `last_move_at < now() - interval '90 seconds'`.

### P1
3. **4 failing tests** в `src/game/__tests__/auth.integration.test.ts`
   (поведение `expect(null).toContain("8")` — validation возвращает
   `null` вместо строки). Pre-existing с v1.4.5+. Не блокирует CI.
4. **ESLint config broken** — `eslint.config.mjs` импортирует
   `@convex-dev/eslint-plugin`, которого нет в `package.json`.
   `pnpm lint` падает. Не блокирует CI (lint не в pipeline). Чтобы
   починить — либо убрать импорт, либо `pnpm add -D @convex-dev/eslint-plugin`.
5. **Multiple guest profiles** — при загрузке `OnlineGame.tsx` хук
   `useAuthState` может создать несколько `auth_guest_xxx` профилей
   подряд (видел в RPC-логах 3 одновременных `get_or_create_profile`).
   Не критично, но захламляет БД. Нужно подебаунсить.
6. **`request_withdrawal` RPC и `/wallet` UI** — есть код, но
   функциональности **не должно быть** (Coin без вывода). Желательно
   удалить или скрыть, чтобы не запутать игрока.

### P2 (nice to have)
7. Sentry / PostHog для observability.
8. CSP / SRI через `_headers` файл (Cloudflare Pages).
9. Заменить ручной device fingerprint на FingerprintJS-pro.
10. Daily challenge variations (Win 5 in row, etc.).
11. UI для best_win_streak в Leaderboard.
12. Удалить ESLint импорт `@convex-dev/eslint-plugin`.
13. **Текст в HANDOFF_v1.4.7.md устарел** — там описано как `claim_welcome_bonus` пишет в `transaction_type`. Это уже не так.
14. **Engagement-strip УВЕЛИЧИВАЕТСЯ только когда есть данные.** Новые игроки на главной не видят его (by design). Можно показывать "первая партия → получи бейдж" placeholder.

---

## 9. Как работают ключевые сценарии

### 9.1 Bootstrap анонимного игрока (`useAnonymousBootstrap.ts`)

При загрузке Index.tsx:
1. `getOrCreatePlayerId()` — берёт `damka_player_id` из localStorage или генерит новый (`p_xxxxxxxxx`).
2. `getOrCreateProfile(playerId)` — RPC создаёт profile + wallet (100 ₡) если новый, или возвращает существующий.
3. `recordDailyLogin()` — localStorage `sr_daily_login_v1` инкрементит streak если `lastDate === yesterday`, иначе сбрасывает.
4. Если URL содержит `?ref=<player_id>` и нет `sr_ref_processed_v1` в localStorage → `registerReferral()` RPC.
5. Если нет `sr_welcome_claimed_v1` в localStorage → `computeDeviceFingerprint()` (SHA-256 от UA + screen + canvas) → `claimWelcomeBonus(playerId, fp, 100)`. (Сейчас этот шаг почти всегда возвращает `already_claimed`, потому что `get_or_create_profile` уже выдал bonus — это нормально, frontend не падает.)
6. `invalidateProfileCache()` чтобы Index.tsx подхватил свежий wallet.

### 9.2 Онлайн-партия

* Лобби (`Lobby.tsx`) → matchmaking через `find_or_create_quick_stake_game` RPC.
* `OnlineGame.tsx` подписывается на Realtime channel для `games.id = X` и `moves.game_id = X`.
* Клик на клетку → локальная валидация (`game/rules.ts`) → `submitMove()` RPC.
* RPC валидирует серверно: caller — участник, ход правильный по правилам русских шашек, цепочки взятий обязательны. Применяет к `board_state`. При game-over вызывает `process_game_result()` в той же транзакции.
* После game-over вызывается `useGameResult.handleFinishGame()`:
  * `processGameResult()` — идемпотентный финал (рейтинг, выплата).
  * `updateEngagementAfterGame()` — win_streak, daily_challenge.
  * `claimReferralPayout()` — server сам решит платить или нет.
  * `invalidateProfileCache()`.

### 9.3 Ставочная партия

* Игрок выбирает ставку 1/5/10/25/50 ₡ → `QuickStakeBar.tsx` → `createOrFindStakeGame()` RPC.
* RPC: создаёт `games.status='waiting'` + `game_stakes` с escrow → блокирует `entry_fee` из `wallets.crypto_balance` в `wallets.locked_balance`.
* Когда второй игрок подключается → escrow_status → 'locked', статус игры → 'playing'.
* При финале — `process_stake_game_result` (legacy) или новый flow через `process_game_result` + ручной payout. **НЕ ТРОГАТЬ без доказанной необходимости.**

---

## 10. Команды разработки

```bash
# 1. Клонировать (запросить PAT у владельца)
git clone https://braindiggeruz:<YOUR_PAT>@github.com/braindiggeruz/shashki-royale.git
cd shashki-royale

# 2. Установить (только pnpm!)
pnpm install        # ~1 минута

# 3. Локальный dev (нужен .env с VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY)
pnpm dev            # http://localhost:5173

# 4. Проверки перед коммитом
npx tsc -b --noEmit                 # typecheck
pnpm build                          # production build
pnpm exec vitest run                # tests (ожидается 68/72)
# pnpm lint — pre-existing broken, не запускать

# 5. Commit + push (Cloudflare деплоит автоматически)
git add -A
git commit -m "..."
git push origin main

# 6. Проверить что Cloudflare задеплоил
curl -s "https://shashki-royale.pages.dev/sw.js" | head -2
# должна показать актуальную CACHE_VERSION

# 7. Применить SQL миграцию (если есть новая)
# открыть https://supabase.com/dashboard/project/jsykbnkbrwwsxcdurzcw/sql/new
# вставить .sql файл, нажать Run
```

### Если нужно собрать новый APK

1. Bump version: `android/app/build.gradle` `versionCode` и `versionName`, plus `MainActivity.kt` apk параметр URL.
2. Commit + push в `main` под путём `android/**` → GitHub Action автоматически:
   * Собирает release + debug APK
   * Подписывает persistent keystore (из RELEASE_KEYSTORE_B64)
   * Создаёт GitHub Release v1.x.y
   * Загружает APK + reports как assets

### Проверка APK

```bash
# Установить инструменты
apt-get install -y apksigner aapt

# Скачать
curl -sL -o release.apk \
  https://github.com/braindiggeruz/shashki-royale/releases/download/v1.4.8/shashki-royale-v1.4.8-release.apk

# Подпись
apksigner verify --verbose --print-certs release.apk
# должна быть SHA-256: 9a546cf3...

# Метаданные
aapt dump badging release.apk | head -5
aapt dump permissions release.apk

# Содержимое
unzip -l release.apk | head
```

---

## 11. Как пользователю исправить "застрявший" кэш

Если игрок жалуется на старый баланс / отсутствие новых фич:

**Просто дать ссылку:** https://shashki-royale.pages.dev/reset

Эта страница:
1. Чистит localStorage, sessionStorage, cookies.
2. Удаляет все IndexedDB базы.
3. Удаляет все cacheStorage.
4. Unregister все service workers.
5. Через 1.2 сек редиректит на `/?fresh=<timestamp>` (cache buster).

Работает в любом браузере (Chrome, Safari, Firefox, Android WebView в APK).

---

## 12. Полезные ссылки

* **Production:** https://shashki-royale.pages.dev/
* **Reset cache:** https://shashki-royale.pages.dev/reset
* **GitHub:** https://github.com/braindiggeruz/shashki-royale
* **Final commit:** https://github.com/braindiggeruz/shashki-royale/commit/eaf97f0
* **Release v1.4.8:** https://github.com/braindiggeruz/shashki-royale/releases/tag/v1.4.8
* **Release APK:** https://github.com/braindiggeruz/shashki-royale/releases/download/v1.4.8/shashki-royale-v1.4.8-release.apk
* **Debug APK:** https://github.com/braindiggeruz/shashki-royale/releases/download/v1.4.8/shashki-royale-v1.4.8-debug.apk
* **Final ZIP:** https://github.com/braindiggeruz/shashki-royale/releases/download/v1.4.8/shashki-royale-v1.4.8-final-release.zip
* **Apply migration SQL:** https://github.com/braindiggeruz/shashki-royale/releases/download/v1.4.8/apply_to_supabase.sql
* **Supabase Dashboard:** https://supabase.com/dashboard/project/jsykbnkbrwwsxcdurzcw
* **Supabase SQL Editor:** https://supabase.com/dashboard/project/jsykbnkbrwwsxcdurzcw/sql/new
* **Cloudflare Pages:** https://dash.cloudflare.com/?to=/:account/pages/view/shashki-royale
* **GitHub Actions:** https://github.com/braindiggeruz/shashki-royale/actions

---

## 13. ЗОЛОТЫЕ ПРАВИЛА для следующего агента

1. **НЕ ОТКАТЫВАТЬ security v1.4.7.** Все мутации `games`/`moves` —
   только через SECURITY DEFINER. Прямой UPDATE/INSERT — запрещён RLS.
2. **НЕ МЕНЯТЬ package ID** (`com.shashkiroyale.app`). Иначе Android
   не пустит upgrade.
3. **НЕ ПЕРЕСОЗДАВАТЬ keystore.** Использовать только тот что в
   GitHub Secrets `RELEASE_KEYSTORE_B64`. Cert SHA-256 `9a546cf3…`
   ОБЯЗАН совпадать с предыдущим релизом.
4. **НЕ ТРОГАТЬ** `process_game_result` / `process_stake_game_result`
   без доказанной необходимости. Они идемпотентны и сложны.
5. **НЕ ДОБАВЛЯТЬ платежи / крипту / withdrawals.** Coin — игровая
   валюта без real-money.
6. **НЕ НАЧИСЛЯТЬ большие free бонусы.** Welcome 100 ₡, referral
   1 ₡ — это максимум. Перспектива 1 Coin = 1 USD.
7. **pnpm only.** Не запускать `npm install` или `yarn install`.
8. **Перед коммитом:** `npx tsc -b --noEmit && pnpm build && pnpm exec vitest run`.
9. **Если SQL миграция нужна:** написать идемпотентную SQL
   (CREATE OR REPLACE, IF NOT EXISTS), приложить к Release как asset,
   обновить body Release с инструкцией → попросить владельца
   нажать Run в Supabase SQL Editor.
10. **Service Worker при изменении JS бандла:** ОБЯЗАТЕЛЬНО bump
    `CACHE_VERSION` в `public/sw.js`. Иначе старые клиенты не
    получат новый код.
11. **Если страница застряла у юзера на старом кэше:** дать
    ссылку `https://shashki-royale.pages.dev/reset`.
12. **Все 4 failing auth.integration tests** — это baseline.
    НЕ удалять, НЕ исправлять (изменение требует переписать validation),
    просто не считать регрессией.

---

Удачи, агент! Если что-то непонятно — читай комментарии в SQL миграциях
и в коде, они довольно подробные.

— *Finishing agent, 2026-06-21*
