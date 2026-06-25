# APK build · how to get a fresh installable file

## TL;DR — клиенту обновлять APK не нужно

Существующий APK уже на телефонах ваших игроков **автоматически
подхватит светлую доску** при следующем открытии — Capacitor
сконфигурирован как WebView с `server.url =
https://shashki-royale.pages.dev/?apk=143`. После web-deploy на
Cloudflare Pages (commit фиксируется в `fix/light-board` branch) все
устройства видят свежую палитру.

## Нужен свежий APK файл? Два варианта

### Вариант A · GitHub Actions (рекомендуется, нет локального тулчейна)

В репозитории появился `.github/workflows/build-apk.yml`. Запуск:

1. GitHub → Actions → **build-apk** → **Run workflow** → выбрать
   ветку `main` (или `fix/light-board`).
2. Если хотите *signed release APK* — установите репо-secrets:
   - `ANDROID_KEYSTORE_B64` — `base64 < release.keystore`
   - `ANDROID_KEYSTORE_PASSWORD`
   - `ANDROID_KEY_ALIAS`
   - `ANDROID_KEY_PASSWORD`
   и при запуске workflow поставьте флажок «release».
3. Когда CI завершится, на странице workflow run внизу секция
   **Artifacts** содержит `shashki-royale-debug-<sha>.zip` →
   распаковать → `app-debug.apk`.

### Вариант B · локальная сборка (Mac / Linux x86_64 / Windows + WSL)

```bash
git clone https://github.com/altynkanafina1-ship-it/shashki-royale.git
cd shashki-royale
pnpm install --no-frozen-lockfile
pnpm exec vite build
npx cap sync android
cd android
./gradlew assembleDebug
# результат: app/build/outputs/apk/debug/app-debug.apk
```

Нужны: JDK 17 + Android Studio (для SDK) + Node 22+ + pnpm.

> Из ARM64-облачных контейнеров сборка **не работает** — Google
> публикует AAPT2 только для x86_64 Linux. Это известное
> ограничение, не баг вашего проекта.

## Подписание для Play Store / прямой раздачи

Чтобы пользователи могли обновляться поверх существующего APK,
**подпись должна совпадать**. Если у вас уже есть `release.keystore`
с прошлых сборок (1.4.7 / 1.4.8) — используйте его. Иначе создайте
один раз и сохраните:

```bash
keytool -genkey -v -keystore release.keystore \
  -alias shashki -keyalg RSA -keysize 2048 -validity 36500
```

Положите этот keystore в GitHub Secrets как `ANDROID_KEYSTORE_B64`
(`base64 < release.keystore`), и CI начнёт собирать подписанный
release APK при выборе соответствующего флага.

## Что было изменено в этой версии

| Файл                                | Изменение                                                |
| :---------------------------------- | :------------------------------------------------------- |
| `src/components/Board.tsx`          | DARK_SQ `#6D4C41 → #B58863`, LIGHT_SQ `#D7CCC8 → #F0D9B5` |
| `capacitor.config.{ts,json}`        | `?apk=142 → ?apk=143`                                    |
| `.github/workflows/build-apk.yml`   | новый CI workflow для сборки APK                          |

Светлая палитра — каноническая Lichess-стайл (de-facto standard для
онлайн-шашек/шахмат). Белые шашки остаются хорошо видны благодаря
существующему золотому риму (`#D4AF37` 2px border).
