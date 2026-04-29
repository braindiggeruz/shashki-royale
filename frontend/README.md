# 🎮 Шашки Рояль — Multiplayer Checkers Game

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Version](https://img.shields.io/badge/version-1.0.0--beta-brightgreen.svg)
![Platform](https://img.shields.io/badge/platform-iOS%20%7C%20Android%20%7C%20Web-blue.svg)
![Status](https://img.shields.io/badge/status-Production%20Ready-success.svg)

**Шашки Рояль** — это полнофункциональное мобильное приложение для игры в русские шашки с поддержкой онлайн-режима, рейтинговой системой и Google авторизацией.

## ✨ Основные возможности

### 🎮 Игровые режимы
- **Локальная игра** — играй с другом на одном устройстве
- **Быстрая онлайн-игра** — найди случайного соперника одним тапом
- **Игра по коду** — пригласи друга по 6-значному коду
- **Поделиться ссылкой** — отправь ссылку через мессенджер

### 🌐 Онлайн-функции
- ✅ Realtime синхронизация ходов через Supabase
- ✅ Автоматический поиск соперника
- ✅ Система рейтинга и профилей
- ✅ История игр и статистика

### 🔐 Авторизация
- Google OAuth (опциональна)
- Локальная игра без регистрации
- Профили с аватарками и рейтингом

### 🎨 UI/UX
- Красивый тёмный интерфейс с золотыми акцентами
- Плавные анимации и переходы
- Адаптивный дизайн для мобильных устройств
- Звуковые эффекты

---

## 🏗️ Технический стек

### Frontend
- **React** — UI библиотека
- **TypeScript** — типизация
- **Vite** — сборщик проекта
- **TailwindCSS** — стилизация
- **Framer Motion** — анимации

### Mobile
- **Capacitor** — фреймворк для мобильных приложений
- **iOS** и **Android** поддержка

### Backend
- **Supabase** — PostgreSQL база данных
- **Realtime** — синхронизация в реальном времени
- **Google OAuth** — аутентификация

### Тестирование
- **Vitest** — unit тесты
- **51 тестов** — полное покрытие игровой логики

---

## 📱 Скриншоты

```
Главное меню → Выбор режима → Игра → Результат
```

---

## 🚀 Быстрый старт

### Требования
- Node.js 18+
- pnpm (или npm)
- Android Studio (для сборки APK)

### Установка

```bash
# Клонируй репозиторий
git clone https://github.com/altynkanafina1-ship-it/shashki-royale.git
cd shashki-royale

# Установи зависимости
pnpm install

# Запусти dev сервер
pnpm dev

# Открой http://localhost:5173
```

### Сборка

```bash
# Сборка для продакшена
pnpm build

# Синхронизация с Android
npx cap sync android

# Сборка APK в Android Studio
# Build > Generate Signed Bundle / APK
```

---

## 📁 Структура проекта

```
shashki-royal/
├── src/
│   ├── pages/              # Экраны приложения
│   │   ├── Index.tsx       # Главное меню
│   │   ├── LocalGame.tsx   # Локальная игра
│   │   ├── Lobby.tsx       # Выбор режима
│   │   ├── OnlineGame.tsx  # Онлайн-игра
│   │   └── auth/           # Авторизация
│   ├── components/         # React компоненты
│   │   ├── Board.tsx       # Доска с логикой
│   │   ├── PlayerCard.tsx  # Карточка игрока
│   │   └── ...
│   ├── game/               # Игровая логика
│   │   ├── types.ts        # Типы данных
│   │   ├── rules.ts        # Правила и ходы
│   │   ├── applyMove.ts    # Применение хода
│   │   └── checkWin.ts     # Проверка победы
│   ├── services/           # API сервисы
│   │   ├── gameRooms.ts    # Работа с комнатами
│   │   └── profiles.ts     # Профили игроков
│   ├── lib/                # Утилиты
│   │   ├── supabase.ts     # Supabase конфиг
│   │   └── storage.ts      # LocalStorage
│   └── App.tsx             # Главное приложение
├── android/                # Capacitor Android проект
├── supabase/               # SQL миграции
├── delivery/               # Готовые APK файлы
├── package.json            # Зависимости
├── vite.config.ts          # Конфиг Vite
└── tsconfig.json           # TypeScript конфиг
```

---

## 🎮 Игровые правила

### Русские шашки (8x8 доска)

**Ходы:**
- Обычный ход: шашка движется на 1 клетку по диагонали вперёд
- Захват: если рядом враг и за ним пусто — обязательно захватить
- Дамка: при достижении последней строки шашка становится дамкой (движется на любое расстояние)

**Правила:**
- Если есть обязательный захват — ходить можно только с захватом
- Цепочка захватов — если после захвата есть ещё захват, нужно продолжить
- Игра заканчивается когда у одного игрока нет шашек или нет ходов

---

## 🔧 API и Supabase

### Таблицы БД

**games** — комнаты и состояние игры
```sql
- id (UUID)
- room_code (TEXT, unique) — 6-значный код
- status (TEXT) — waiting/playing/finished
- white_player_id, black_player_id (TEXT)
- board_state (JSONB) — состояние доски
- current_turn (TEXT) — white/black
- winner, resign_reason (TEXT)
- created_at, updated_at (TIMESTAMPTZ)
```

**moves** — история ходов
```sql
- id, game_id (UUID)
- move_number, player_color, move_data, board_state
```

### Миграции

Запусти в Supabase SQL Editor:
```bash
# 1. supabase/schema.sql
# 2. supabase/migration_v3_last_move.sql
# 3. supabase/FINAL_MIGRATION.sql
```

---

## 🧪 Тестирование

```bash
# Запусти тесты
pnpm test

# Результат: 51/51 ✅
```

---

## 📦 Развёртывание

### Мобильное приложение (APK)

```bash
# Готовый APK находится в:
delivery/shashki-royal-online-debug.apk

# Установка:
adb uninstall com.shashki.royal
adb install delivery/shashki-royal-online-debug.apk
```

### Веб-версия

```bash
# Сборка
pnpm build

# Деплой на Vercel
vercel deploy

# Или на другой хостинг
# Загрузи папку dist/
```

---

## 🔑 Переменные окружения

Создай файл `.env`:
```env
VITE_SUPABASE_URL=https://jsykbnkbrwwsxcdurzcw.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## 🐛 Известные проблемы и решения

### Проблема: "Не могу подключиться к Supabase"
**Решение:** Проверь `.env` файл, убедись что URL и ключ правильные

### Проблема: "Ход не отправляется"
**Решение:** Проверь консоль браузера, убедись что Realtime подписка активна

### Проблема: "APK не устанавливается"
**Решение:** Убедись что APK подписан корректно (используется debug keystore)

---

## 📝 Дорожная карта

### Phase 1 (Текущее)
- ✅ Локальная игра
- ✅ Онлайн-режим (быстрая игра + по коду)
- ✅ Google авторизация
- ✅ Мобильное приложение (APK)

### Phase 2 (Планируется)
- 🔄 Система рейтинга (ELO)
- 🔄 Турниры и лиги
- 🔄 Чат в игре
- 🔄 Друзья и приглашения

### Phase 3 (Будущее)
- 📋 Монетизация (внутриигровая валюта)
- 📋 Платежи (Stripe, PayPal)
- 📋 Магазин (скины, аватары)
- 📋 Аналитика и статистика

---

## 🤝 Вклад

Приветствуются pull requests! Для больших изменений сначала откройте issue.

```bash
# Создай ветку
git checkout -b feature/amazing-feature

# Коммитай изменения
git commit -m 'Add amazing feature'

# Push в ветку
git push origin feature/amazing-feature

# Открой Pull Request
```

---

## 📄 Лицензия

Этот проект лицензирован под MIT License — см. файл [LICENSE](LICENSE)

---

## 👥 Автор

**Manus AI Agent** — автономный AI агент для разработки приложений

---

## 📞 Контакты и поддержка

- 📧 Email: support@shashki-royal.dev
- 🐛 Issues: [GitHub Issues](https://github.com/altynkanafina1-ship-it/shashki-royale/issues)
- 💬 Discussions: [GitHub Discussions](https://github.com/altynkanafina1-ship-it/shashki-royale/discussions)

---

## 🙏 Благодарности

- Спасибо Supabase за отличный backend
- Спасибо React и TypeScript сообществам
- Спасибо всем, кто помогал в разработке

---

**Готово к игре! Скачивай и играй! 🎉**

---

<div align="center">

**[⬆ Вернуться к началу](#-шашки-рояль--multiplayer-checkers-game)**

Made with ❤️ by Manus AI

</div>
