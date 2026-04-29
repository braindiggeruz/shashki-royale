# 🚀 Руководство по развёртыванию

Полное руководство по развёртыванию Шашки Рояль на разных платформах.

---

## 📱 Мобильное приложение (Android)

### Быстрый старт

```bash
# 1. Скачай APK
wget https://github.com/altynkanafina1-ship-it/shashki-royale/releases/download/v1.0.0/shashki-royal-online-debug.apk

# 2. Установи на устройство
adb install shashki-royal-online-debug.apk

# 3. Запусти приложение
adb shell am start -n com.shashki.royal/.MainActivity
```

### Сборка собственного APK

```bash
# 1. Клонируй репозиторий
git clone https://github.com/altynkanafina1-ship-it/shashki-royale.git
cd shashki-royale

# 2. Установи зависимости
pnpm install

# 3. Сборка
pnpm build

# 4. Синхронизация с Android
npx cap sync android

# 5. Открой в Android Studio
# File > Open > android/

# 6. Собери APK
# Build > Generate Signed Bundle / APK
# Выбери: APK
# Выбери keystore или создай новый
# Нажми: Build
```

### Подпись APK

```bash
# Создай keystore (если нет)
keytool -genkey -v -keystore my-release-key.keystore \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias my-key-alias

# Подпиши APK
jarsigner -verbose -sigalg SHA256withRSA \
  -digestalg SHA-256 \
  -keystore my-release-key.keystore \
  app-release-unsigned.apk my-key-alias

# Выровняй APK
zipalign -v 4 app-release-unsigned.apk app-release.apk

# Проверь подпись
apksigner verify -v app-release.apk
```

---

## 🌐 Веб-версия

### Деплой на Vercel

```bash
# 1. Установи Vercel CLI
npm i -g vercel

# 2. Авторизуйся
vercel login

# 3. Деплой
vercel

# 4. Следуй инструкциям
```

### Деплой на Netlify

```bash
# 1. Установи Netlify CLI
npm i -g netlify-cli

# 2. Авторизуйся
netlify login

# 3. Деплой
netlify deploy --prod --dir=dist
```

### Деплой на Firebase

```bash
# 1. Установи Firebase CLI
npm i -g firebase-tools

# 2. Авторизуйся
firebase login

# 3. Инициализируй проект
firebase init hosting

# 4. Деплой
firebase deploy
```

### Деплой на собственный сервер

```bash
# 1. Сборка
pnpm build

# 2. Загрузи папку dist/ на сервер
scp -r dist/* user@your-server.com:/var/www/shashki-royal/

# 3. Настрой веб-сервер (nginx)
# Пример конфига:
```

```nginx
server {
    listen 80;
    server_name shashki-royal.com;

    location / {
        root /var/www/shashki-royal;
        try_files $uri $uri/ /index.html;
    }

    # API proxy (если нужно)
    location /api/ {
        proxy_pass https://api.shashki-royal.com/;
    }
}
```

---

## 🗄️ Backend (Supabase)

### Инициализация БД

```bash
# 1. Создай проект на https://supabase.com

# 2. Запусти миграции в SQL Editor:
# supabase/schema.sql
# supabase/migration_v3_last_move.sql
# supabase/FINAL_MIGRATION.sql

# 3. Скопируй credentials в .env
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxxxx
```

### Настройка Realtime

```sql
-- Включи Realtime для таблицы games
ALTER PUBLICATION supabase_realtime ADD TABLE games;

-- Включи Realtime для таблицы moves
ALTER PUBLICATION supabase_realtime ADD TABLE moves;
```

### Настройка RLS (Row Level Security)

```sql
-- Включи RLS для games
ALTER TABLE games ENABLE ROW LEVEL SECURITY;

-- Создай политики
CREATE POLICY "Anyone can read games"
  ON games FOR SELECT
  USING (true);

CREATE POLICY "Players can update their games"
  ON games FOR UPDATE
  USING (
    auth.uid()::text = white_player_id OR 
    auth.uid()::text = black_player_id
  );
```

---

## 🔐 Переменные окружения

### .env (локальная разработка)

```env
# Supabase
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxxxx

# Google OAuth (опционально)
VITE_GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com

# API (опционально)
VITE_API_URL=https://api.shashki-royal.com
```

### .env.production (продакшен)

```env
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxxxx
VITE_GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
VITE_API_URL=https://api.shashki-royal.com
```

---

## 📊 Мониторинг и логирование

### Supabase Dashboard

```
https://app.supabase.com/project/xxxxx/logs
```

### Проверка здоровья

```bash
# Проверь Supabase connection
curl -H "Authorization: Bearer $SUPABASE_KEY" \
  https://xxxxx.supabase.co/rest/v1/games?limit=1

# Проверь Realtime
curl https://xxxxx.supabase.co/realtime/v1/health
```

---

## 🔄 CI/CD (GitHub Actions)

### Автоматическая сборка APK

Создай файл `.github/workflows/build-apk.yml`:

```yaml
name: Build APK

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: pnpm install
      
      - name: Build
        run: pnpm build
      
      - name: Sync Capacitor
        run: npx cap sync android
      
      - name: Build APK
        run: |
          cd android
          ./gradlew assembleDebug
      
      - name: Upload APK
        uses: actions/upload-artifact@v3
        with:
          name: shashki-royal-debug.apk
          path: android/app/build/outputs/apk/debug/app-debug.apk
```

### Автоматический деплой на Vercel

Создай файл `.github/workflows/deploy-web.yml`:

```yaml
name: Deploy Web

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: pnpm install
      
      - name: Build
        run: pnpm build
      
      - name: Deploy to Vercel
        uses: vercel/action@master
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
```

---

## 🐛 Troubleshooting

### Проблема: "Cannot find module"
```bash
# Решение: переустанови зависимости
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

### Проблема: "Supabase connection failed"
```bash
# Решение: проверь .env
cat .env
# Убедись что URL и KEY правильные
```

### Проблема: "APK не устанавливается"
```bash
# Решение: очисти старую версию
adb uninstall com.shashki.royal
adb install shashki-royal-online-debug.apk
```

### Проблема: "Build failed"
```bash
# Решение: очисти кеш
pnpm clean
pnpm install
pnpm build
```

---

## 📈 Масштабирование

### Когда растёт количество пользователей:

1. **Оптимизируй БД:**
   - Добавь индексы
   - Оптимизируй запросы
   - Используй кеширование

2. **Масштабируй сервер:**
   - Используй CDN
   - Добавь load balancer
   - Используй микросервисы

3. **Мониторь производительность:**
   - Настрой алерты
   - Отслеживай метрики
   - Анализируй логи

---

## 📝 Чек-лист перед продакшеном

- [ ] Все тесты проходят
- [ ] Нет console.log в коде
- [ ] Переменные окружения установлены
- [ ] HTTPS включен
- [ ] CORS настроен
- [ ] RLS политики включены
- [ ] Резервные копии БД настроены
- [ ] Мониторинг включен
- [ ] Документация обновлена

---

**Готово к развёртыванию! 🚀**
