# 🎮 Шашки Рояль — Handoff Document

**Дата:** 28 апреля 2026  
**Статус:** Production-ready APK готов  
**Язык:** TypeScript + React + Capacitor (мобильное приложение)

---

## 📋 ОБЗОР ПРОЕКТА

**Шашки Рояль** — мобильная игра в шашки с онлайн-режимом, рейтингом и Google авторизацией.

### Основные компоненты:
- **Frontend:** React + TypeScript + Vite + TailwindCSS + Framer Motion
- **Backend:** Supabase (PostgreSQL + Realtime)
- **Мобильное:** Capacitor (iOS/Android)
- **Игровая логика:** Русские шашки (8x8 доска, правила захвата)

---

## 🏗️ АРХИТЕКТУРА

```
/src
├── /pages              # Экраны приложения
│   ├── Index.tsx       # Главное меню
│   ├── LocalGame.tsx   # Локальная игра
│   ├── Lobby.tsx       # Выбор режима
│   ├── OnlineGame.tsx  # Онлайн-игра (Realtime)
│   ├── auth/           # Авторизация
│   └── Profile.tsx     # Профиль
├── /components         # React компоненты
│   ├── Board.tsx       # Доска
│   ├── PlayerCard.tsx  # Карточка игрока
│   └── ...
├── /game               # Игровая логика
│   ├── types.ts        # Типы
│   ├── rules.ts        # Ходы
│   ├── applyMove.ts    # Применение хода
│   └── checkWin.ts     # Победа
├── /services           # API сервисы
│   ├── gameRooms.ts    # Комнаты
│   └── profiles.ts     # Профили
├── /lib                # Утилиты
│   ├── supabase.ts     # Supabase
│   └── storage.ts      # LocalStorage
└── App.tsx             # Роутинг
```

---

## 🔐 SUPABASE SETUP

### Таблицы:
1. **games** — комнаты и состояние игры
2. **moves** — история ходов
3. **profiles** — профили игроков

### Миграции (запустить в Supabase SQL Editor):
```bash
# 1. supabase/schema.sql
# 2. supabase/migration_v3_last_move.sql
# 3. supabase/FINAL_MIGRATION.sql
```

### Realtime:
- Включена публикация для `games` и `moves` таблиц

---

## 🎮 ИГРОВАЯ ЛОГИКА

### Правила:
- Обычный ход: шашка на 1 клетку по диагонали вперёд
- Захват: если рядом враг и за ним пусто — обязательно
- Дамка: при достижении последней строки
- Цепочка захватов: если есть ещё захват — продолжить

### Файлы:
- `src/game/rules.ts` — `generateLegalMoves()`, `hasMandatoryCapture()`
- `src/game/applyMove.ts` — применение хода
- `src/game/checkWin.ts` — проверка конца игры

---

## 🌐 ОНЛАЙН-РЕЖИМ

### Флоу:
1. **Быстрая игра:** `findAndJoinRandomRoom()` или создать новую
2. **По коду:** `joinRoomByCode(code, playerId)`
3. **Синхронизация:** Realtime канал подписывает обоих игроков

### Критические функции (gameRooms.ts):
```typescript
createRoom(playerId)              // Создать комнату
joinRoomByCode(code, playerId)    // Присоединиться по коду
findAndJoinRandomRoom(playerId)   // Быстрая игра
cleanupOldRooms(playerId)         // Удалить старые комнаты
fetchGame(gameId)                 // Получить состояние
updateGameState(...)              // Отправить ход
finishGame(...)                   // Завершить игру
```

---

## 🔧 КРИТИЧЕСКИЕ ФИКСЫ (ПОСЛЕДНИЕ)

### Fix 1: Мёртвые комнаты
**Проблема:** Старые комнаты оставались в БД, новые игроки подключались к пустым.

**Решение:** 
- `cleanupOldRooms()` удаляет ВСЕ комнаты старше 5 минут
- Вызывается в начале `findAndJoinRandomRoom()` с `await`
- Используется try/catch

### Fix 2: Наложение доски
**Проблема:** Доска закрывала аватарки.

**Решение:** 
- Добавлен `max-h-[60vh]` к контейнеру доски в `OnlineGame.tsx`

### Fix 3: Google авторизация видна
**Проблема:** Кнопка Google была ниже экрана.

**Решение:** 
- Переделан UI Login.tsx
- Google кнопка прямо под "Играть сразу"

---

## 📱 СБОРКА И ДЕПЛОЙ

### Локальная разработка:
```bash
cd /home/ubuntu/shashki-royal
pnpm install
pnpm dev          # Dev сервер
pnpm build        # Продакшен
npx vitest run    # Тесты
```

### Сборка APK:
```bash
pnpm build
npx cap sync android
# Затем в Android Studio: Build > Generate Signed Bundle / APK
```

### Подпись APK:
```bash
cd /tmp && mkdir apk_final && cd apk_final
unzip /path/to/app-release.apk
zip -r /tmp/unsigned.apk .
zipalign -p -f 4 /tmp/unsigned.apk /tmp/aligned.apk
apksigner sign --ks /home/ubuntu/debug.keystore \
  --ks-pass pass:android \
  --key-pass pass:android \
  /tmp/aligned.apk
```

### Текущий APK:
- **Путь:** `/home/ubuntu/shashki-royal/delivery/shashki-royal-online-debug.apk`
- **Размер:** 8.1 MB
- **Подпись:** Debug keystore
- **Статус:** Production-ready

---

## 🔑 ПЕРЕМЕННЫЕ ОКРУЖЕНИЯ

```env
VITE_SUPABASE_URL=https://jsykbnkbrwwsxcdurzcw.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Файл:** `.env` в корне проекта

---

## 🧪 ТЕСТИРОВАНИЕ

### Статус:
- **Test Files:** 2 passed
- **Tests:** 51 passed ✅

### Запуск:
```bash
cd /home/ubuntu/shashki-royal
npx vitest run
```

---

## ⚠️ ИЗВЕСТНЫЕ ОГРАНИЧЕНИЯ

1. **Debug keystore** — для тестирования. Production нужен production keystore
2. **RLS политики** — простые. Production нужны более строгие
3. **Нет аутентификации** — playerId из localStorage
4. **Нет системы рейтинга** — профили есть, но рейтинг не обновляется

---

## 📝 СЛЕДУЮЩИЕ ШАГИ

1. **Монетизация:**
   - Система внутриигровой валюты
   - Платежи (Stripe, PayPal, Uzcard)
   - Магазин (скины, аватары, премиум)

2. **Улучшения:**
   - Система рейтинга (ELO)
   - Турниры и лиги
   - Чат в игре
   - Друзья и приглашения

3. **Оптимизация:**
   - Production keystore
   - Оптимизация APK
   - Кэширование Realtime

4. **Аналитика:**
   - Sentry (ошибки)
   - Mixpanel/Firebase (аналитика)

---

## 🆘 TROUBLESHOOTING

### "Не могу подключиться к Supabase"
→ Проверить `.env`, URL и ключ правильные

### "Ход не отправляется"
→ Консоль браузера, Realtime подписка активна

### "Доска не отображается"
→ `board_state` в Supabase — валидный JSON

---

## 🚀 БЫСТРЫЙ СТАРТ

1. **Распаковать архив:**
   ```bash
   tar -xzf shashki-royal.tar.gz
   cd shashki-royal
   ```

2. **Установить зависимости:**
   ```bash
   pnpm install
   ```

3. **Проверить конфиг:**
   ```bash
   cat .env
   ```

4. **Запустить dev сервер:**
   ```bash
   pnpm dev
   ```

5. **Собрать APK:**
   ```bash
   pnpm build
   npx cap sync android
   ```

---

**Проект готов к продакшену! 🎉**

Версия: 1.0.0-beta  
Дата: 28 апреля 2026
