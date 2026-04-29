# HANDOFF ДЛЯ СЛЕДУЮЩЕГО АГЕНТА: «Шашки Рояль»

**Автор handoff:** Manus AI  
**Дата:** 28 апреля 2026  
**Корень проекта:** `/home/ubuntu/work_shashki/shashki-royal`  
**Итоговый архив:** `shashki-royal-FULL-handoff.tar.gz`  
**Доступный APK:** `shashki-royal-online-debug.apk`

> Этот документ предназначен для следующего агента, который должен сразу продолжить работу над проектом без повторного восстановления контекста. В архив включён весь проект, включая `.env` с рабочими переменными окружения, веб-сборку `dist/`, Android-проект `android/`, Supabase-миграции и отчёты текущей сессии. Значения секретов намеренно не дублируются в этом Markdown-файле, чтобы не размножать чувствительные данные; они лежат в `.env` внутри проекта.

## 1. Краткий обзор проекта

«**Шашки Рояль**» — это мобильная и веб-игра в шашки, построенная на **React**, **TypeScript**, **Vite**, **Supabase** и **Capacitor**. Пользовательская цель текущей серии задач состояла в том, чтобы убрать критическую ошибку Supabase при гостевом входе, сделать максимально простой вход без паролей, реализовать онлайн-комнаты без паролей с входом по коду или ссылке, подготовить Android APK и упаковать полный архив проекта для передачи следующему агенту.

| Область | Текущее состояние |
|---|---|
| Веб-приложение | Собирается успешно через `pnpm build`; готовая сборка находится в `dist/`. |
| Авторизация | Добавлен быстрый гостевой вход в одно касание; приложение не падает при отсутствии Supabase-конфигурации. |
| Онлайн-комнаты | Реализованы комнаты без паролей: создание кода, вход по коду, вход по invite-ссылке, ожидание соперника. |
| Supabase | Используются таблицы `games`, `profiles`, `stakes`; миграции лежат в `supabase/`. |
| Android | Capacitor-проект создан и синхронизирован; финальная сборка APK требует исправления конфликта AGP/compileSdk. |
| Передача | Архив должен содержать весь проект без `node_modules` и тяжёлых Gradle-кэшей, но с `.env`, `dist/`, `android/`, `supabase/`, отчётами и APK. |

## 2. Технологический стек

Проект использует современный фронтенд-стек с React 19 и Vite 7, а также Supabase для серверной части и realtime-синхронизации. Android-обёртка создана через Capacitor 8. Пакетный менеджер проекта — **pnpm**.

| Категория | Технологии |
|---|---|
| Frontend | React 19, TypeScript 5.9, Vite 7, TailwindCSS 4 |
| UI | Radix UI, shadcn/ui-подобные компоненты, Lucide React, Framer Motion |
| Routing | `react-router-dom` 7 |
| Backend / Realtime | Supabase, `@supabase/supabase-js` 2 |
| Auth | Supabase Auth плюс локальный гостевой режим через `localStorage` |
| Состояние и данные | TanStack Query v5, локальные React hooks |
| Формы и валидация | `react-hook-form`, `zod` |
| i18n | `i18next`, `react-i18next`; локали `ru` и `uz` |
| Mobile wrapper | Capacitor 8, `@capacitor/android` 8.3.1 |
| Android build | JDK 17, Android SDK, Gradle/AGP в текущем конфликтном состоянии |

## 3. Что было исправлено в этой сессии

Основная критическая проблема была связана с тем, что при отсутствии или недоступности Supabase-конфигурации приложение пыталось работать как полностью серверное и показывало пугающие ошибки пользователю. Теперь локальная игра и гостевой старт работают мягко: если Supabase не сконфигурирован, приложение уходит в локальный сценарий вместо падения.

| Файл | Изменение | Практический эффект |
|---|---|---|
| `src/lib/auth.ts` | Полностью переписан модуль авторизации с fallback на гостевой режим. | Гостевой вход больше не вызывает критическую Supabase-ошибку. |
| `src/components/ProtectedRoute.tsx` | Защищённые маршруты адаптированы под локальную игру и гостевой режим. | Локальная игра доступна без обязательной серверной авторизации. |
| `src/pages/Lobby.tsx` | Убрано пугающее сообщение Supabase; добавлены комнаты, код, ссылка и waiting-state. | Пользователь может создать комнату или войти по коду без пароля. |
| `src/pages/auth/Login.tsx` | Добавлена кнопка «Играть сразу». | Вход в одно касание без email и пароля. |
| `src/pages/auth/Register.tsx` | Добавлена кнопка «Создать и играть». | Создание гостевого профиля в одно касание. |
| `src/services/gameRooms.ts` | Переписан сервис комнат: генерация кода, вход по ссылке, повторная генерация при конфликте. | Онлайн-комнаты работают без паролей и сложной регистрации. |

## 4. Маршруты приложения

В `src/App.tsx` настроены публичные, auth- и protected-маршруты. Важно: в фактическом `App.tsx` локальная игра указана как `/local`, хотя в части предыдущих заметок фигурировал путь `/local-game`. Следующему агенту нужно учитывать именно текущее состояние файла.

| Путь | Компонент | Назначение |
|---|---|---|
| `/` | `Index` | Главное меню. |
| `/rules` | `Rules` | Правила игры. |
| `/auth/login` | `LoginPage` | Вход, включая «Играть сразу». |
| `/auth/register` | `RegisterPage` | Регистрация, включая гостевой профиль. |
| `/auth/forgot-password` | `ForgotPasswordPage` | Восстановление пароля. |
| `/auth/callback` | `AuthCallback` | Callback авторизации. |
| `/auth/reset-password` | `ResetPasswordPage` | Сброс пароля. |
| `/local` | `ProtectedRoute` + `LocalGame` | Локальная игра. |
| `/lobby` | `ProtectedRoute` + `Lobby` | Онлайн-лобби и комнаты. |
| `/online-game` | `ProtectedRoute` + `OnlineGame` | Онлайн-игра через Supabase. |
| `/profile` | `ProtectedRoute` + `ProfilePage` | Профиль. |
| `/leaderboard` | `ProtectedRoute` + `LeaderboardPage` | Таблица лидеров. |
| `/stake-lobby` | `ProtectedRoute` + `StakeLobbyPage` | Лобби ставок. |
| `/wallet` | `ProtectedRoute` + `WalletPage` | Кошелёк. |

## 5. Онлайн-комнаты без паролей

Сервис комнат находится в `src/services/gameRooms.ts`. Он импортирует Supabase-клиент и начальную доску, генерирует код комнаты из безопасного для чтения алфавита без похожих символов, поддерживает извлечение кода из обычного ввода или URL и создаёт игру со статусом `waiting`. При входе второго игрока комната переводится в состояние `playing`, а чёрный игрок записывается в `black_player_id`.

| Функция | Назначение |
|---|---|
| `extractRoomCode(input)` | Нормализует код комнаты; умеет вытаскивать `room` или `code` из ссылки. |
| `createRoom(playerId)` | Создаёт игру с новым `room_code`, белым игроком и начальным состоянием доски. |
| `joinRoom(code, playerId)` | Ищет waiting-комнату по коду и присоединяет второго игрока. |
| `fetchGame(gameId)` | Загружает строку игры из Supabase. |
| `updateGameState(...)` | Обновляет состояние доски, ход, последний ход и номер хода. |
| `finishGame(...)` | Завершает игру и записывает победителя. |
| `insertMove(...)` | Записывает ход, если таблица ходов присутствует в схеме. |

В `src/pages/Lobby.tsx` добавлена логика создания комнаты, отображения кода, копирования кода, генерации invite-ссылки и использования `navigator.share`, если он доступен на устройстве. Автоматический вход по ссылке реализован через query-параметры `room` или `code`.

## 6. Supabase и переменные окружения

Файл `.env` находится в корне проекта и включён в полный архив. Он содержит реальные значения `VITE_SUPABASE_URL` и `VITE_SUPABASE_ANON_KEY`. В handoff-документе значения не продублированы, чтобы не создавать лишних копий секрета; следующий агент должен читать их из `.env`.

| Файл | Назначение |
|---|---|
| `.env` | Реальная конфигурация Supabase для текущего проекта. |
| `.env.example` | Шаблон переменных окружения с комментариями. |
| `src/lib/supabase.ts` | Создание клиента Supabase и чтение `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. |
| `supabase/schema.sql` | Базовая схема. |
| `supabase/FINAL_MIGRATION.sql` | Финальная миграция из предыдущих этапов. |
| `supabase/migration_auth.sql` | Auth/profile-миграция. |
| `supabase/migration_stakes.sql` | Миграция ставок. |
| `supabase/migration_v2.sql` | Дополнительная миграция v2. |
| `supabase/migration_v3_last_move.sql` | Миграция поля последнего хода. |
| `supabase/migration_v3_security_fix.sql` | Миграция security/RLS-исправлений. |

Следующему агенту важно проверить, что таблица `games` содержит поля `room_code`, `status`, `white_player_id`, `black_player_id`, `board_state`, `current_turn` и `last_move`. Онлайн-игра в `src/pages/OnlineGame.tsx` использует realtime-подписки Supabase и ожидает корректные RLS-политики.

## 7. Android APK: текущее состояние и причина ошибки

Capacitor Android-проект уже создан в папке `android/`, а веб-сборка синхронизирована в Android assets. Были установлены и настроены JDK 17 и Android SDK. Однако последняя сборка APK не завершилась из-за конфликта между текущим Android Gradle Plugin и `compileSdk=36`.

| Компонент | Текущее значение / состояние |
|---|---|
| JDK | `/usr/lib/jvm/java-17-openjdk-amd64` |
| Android SDK | `/home/ubuntu/android-sdk`; также есть системный `/usr/lib/android-sdk` |
| Установленные platforms | `android-33`, `android-36` |
| Build tools | `33.0.2`, `36` |
| Android Gradle Plugin | `7.4.2` |
| `compileSdkVersion` | `36` в `android/variables.gradle` |
| `targetSdkVersion` | `36` в `android/variables.gradle` |
| Последняя ошибка | `Android resource linking failed`, `failed to load include path /home/ubuntu/android-sdk/platforms/android-36/android.jar` |
| Предыдущая исправленная ошибка | `invalid source release: 21`; заменено на Java 17 в Android Gradle-файлах. |
| Доступный APK | `/home/ubuntu/work_shashki/deliver/shashki-royal-online-debug.apk` |

Корневая причина выглядит так: **AGP 7.4.2 слишком старый для комфортной работы с compileSdk 36**. В `android/gradle.properties` было добавлено подавление предупреждения, но это не решает AAPT/resource-linking failure. Следующему агенту нужно либо обновить Android Gradle Plugin и Gradle wrapper, либо временно понизить compileSdk/targetSdk до 33 и привести AndroidX-зависимости к совместимым версиям.

### Рекомендуемый вариант A: обновить AGP и Gradle wrapper

Этот путь лучше для долгосрочной поддержки, потому что проект уже использует современные Capacitor-зависимости. Нужно открыть `android/build.gradle` и заменить старый classpath Android Gradle Plugin на версию 8.x, например `8.3.2` или совместимую с Gradle wrapper. Затем нужно обновить `android/gradle/wrapper/gradle-wrapper.properties` на Gradle 8.x.

```bash
cd /home/ubuntu/work_shashki/shashki-royal/android
# 1. В android/build.gradle заменить:
#    classpath 'com.android.tools.build:gradle:7.4.2'
#    на, например:
#    classpath 'com.android.tools.build:gradle:8.3.2'
# 2. В android/gradle/wrapper/gradle-wrapper.properties заменить distributionUrl на Gradle 8.4+.
# 3. Затем выполнить:
./gradlew clean
./gradlew assembleDebug
```

### Альтернативный вариант B: понизить compileSdk до 33

Этот путь может быть быстрее, если нужно срочно получить debug APK на текущем AGP 7.4.2. Нужно вернуть `compileSdkVersion` и `targetSdkVersion` к 33 в `android/variables.gradle`, затем проверить версии AndroidX-зависимостей. Если новые AndroidX-пакеты требуют более высокий compileSdk, их нужно понизить, например до `androidxActivityVersion=1.7.2` и `androidxAppCompatVersion=1.6.1`.

```bash
cd /home/ubuntu/work_shashki/shashki-royal/android
# В android/variables.gradle:
# compileSdkVersion = 33
# targetSdkVersion = 33
# androidxActivityVersion = '1.7.2'
# androidxAppCompatVersion = '1.6.1'
./gradlew clean
./gradlew assembleDebug
```

## 8. Команды запуска и проверки

После распаковки архива следующий агент должен перейти в корень проекта, установить зависимости и выполнить стандартные команды. Если `node_modules` отсутствует, это нормально: он намеренно исключён из архива, чтобы не раздувать размер передачи.

| Задача | Команда |
|---|---|
| Установка зависимостей | `pnpm install` |
| Запуск dev-сервера | `pnpm dev` |
| Проверка production build | `pnpm build` |
| Синхронизация Capacitor | `npx cap sync` |
| Переход в Android-проект | `cd android` |
| Debug APK | `./gradlew assembleDebug` |
| Очистка Android build | `./gradlew clean` |

Рекомендуемая последовательность после распаковки выглядит так:

```bash
cd /home/ubuntu/work_shashki/shashki-royal
pnpm install
pnpm build
npx cap sync
cd android
./gradlew assembleDebug
```

## 9. Ключевые файлы проекта

Следующие файлы являются наиболее важными для продолжения работы. Если времени мало, начинать нужно именно с них.

| Путь | Почему важен |
|---|---|
| `src/lib/auth.ts` | Главная логика авторизации и гостевого fallback. |
| `src/lib/supabase.ts` | Конфигурация Supabase-клиента и проверка наличия окружения. |
| `src/components/ProtectedRoute.tsx` | Контроль доступа к маршрутам и локальному режиму. |
| `src/pages/auth/Login.tsx` | Быстрый гостевой вход «Играть сразу». |
| `src/pages/auth/Register.tsx` | Быстрое создание гостевого профиля. |
| `src/pages/Lobby.tsx` | Создание комнаты, вход по коду, invite-ссылка, ожидание соперника. |
| `src/services/gameRooms.ts` | Серверная логика комнат поверх Supabase. |
| `src/pages/OnlineGame.tsx` | Realtime-игра, загрузка и синхронизация состояния. |
| `src/hooks/usePlayerId.ts` | Локальный UUID гостевого игрока. |
| `src/hooks/useAuthState.ts` | Состояние авторизации. |
| `src/game/*` | Правила шашек, применение хода, сериализация, начальная доска. |
| `supabase/*` | SQL-схема и миграции. |
| `capacitor.config.ts` | Конфигурация Capacitor. |
| `android/variables.gradle` | Android SDK, target/compile/min SDK и AndroidX versions. |
| `android/build.gradle` | Android Gradle Plugin classpath. |
| `android/gradle.properties` | JDK, SDK и Gradle-настройки. |

## 10. Отчёты, уже созданные в проекте

В корне проекта есть два отчёта, которые полезно прочитать перед продолжением. Они включены в архив.

| Файл | Содержание |
|---|---|
| `ИСПРАВЛЕНИЯ_ВХОД_АВТОРИЗАЦИЯ.md` | Подробности исправлений Supabase-ошибки, гостевого входа и ProtectedRoute. |
| `ОТЧЕТ_ОНЛАЙН_КОМНАТЫ_APK.md` | Подробности реализации онлайн-комнат и текущий статус APK. |
| `HANDOFF_ДЛЯ_АГЕНТА.md` | Этот документ, объединяющий актуальное состояние и следующие шаги. |

## 11. Что именно находится в финальном архиве

Финальный архив должен быть создан из `/home/ubuntu/work_shashki` и содержать папку `shashki-royal/`. Из него намеренно исключаются `node_modules`, `.gradle` и build-кэши Android, но сохраняются исходники, конфигурация, Supabase, `dist/`, Android-проект, отчёты и `.env`.

| Включено | Статус |
|---|---|
| `src/` | Да |
| `supabase/` | Да |
| `android/` | Да, без `.gradle` и build-кэшей |
| `dist/` | Да |
| `package.json` | Да |
| `pnpm-lock.yaml` | Да |
| `capacitor.config.ts` | Да |
| `.env` | Да, содержит реальные Supabase-значения |
| `.env.example` | Да |
| Markdown-отчёты | Да |
| Debug APK | Да, файл дополнительно копируется в корень архива/выдачи |
| `node_modules/` | Нет, нужно восстановить через `pnpm install` |

## 12. Команда для пересборки архива

Если архив нужно пересобрать, используй следующую команду. Она исключает тяжёлые зависимости и Gradle-кэши, но оставляет всё, что нужно для продолжения работы.

```bash
cd /home/ubuntu/work_shashki
tar -czf /home/ubuntu/shashki-royal-FULL-handoff.tar.gz \
  --exclude='shashki-royal/node_modules' \
  --exclude='shashki-royal/android/.gradle' \
  --exclude='shashki-royal/android/build' \
  --exclude='shashki-royal/android/app/build' \
  --exclude='shashki-royal/android/capacitor-android/build' \
  --exclude='shashki-royal/android/capacitor-cordova-android-plugins/build' \
  shashki-royal/ \
  deliver/shashki-royal-online-debug.apk
```

## 13. Следующие задачи для агента

Наиболее срочная следующая задача — довести Android APK до свежей успешной сборки. Приоритетный путь — обновить Android Gradle Plugin и Gradle wrapper до 8.x, так как проект уже поднят до `compileSdk=36`. Если пользователь требует немедленный debug APK, можно временно собрать с `compileSdk=33`, но это технический компромисс.

| Приоритет | Задача | Комментарий |
|---|---|---|
| P0 | Исправить Android-сборку | Выбрать вариант A или B из раздела 7. |
| P0 | Сгенерировать свежий debug APK | После исправления выполнить `./gradlew assembleDebug`. |
| P1 | Проверить установку APK на Android | Убедиться, что WebView открывает игру и Supabase env встроен в build. |
| P1 | Протестировать онлайн-комнаты на двух устройствах/браузерах | Проверить создание, вход по коду, вход по ссылке и realtime-ходы. |
| P2 | Подготовить release signing | Создать keystore, настроить Gradle signingConfigs, собрать release APK/AAB. |
| P2 | Усилить betting/stakes-логику | Проект содержит `stakes` и `wallet`; для реальных денег нужна серьёзная безопасность и серверная валидация. |
| P2 | Провести security review RLS | Особенно важно для ставок и игр на деньги. |

## 14. Важное предупреждение по ставкам и деньгам

В проекте присутствуют страницы и сервисы, связанные со ставками и кошельком: `src/pages/StakeLobbyPage.tsx`, `src/pages/WalletPage.tsx`, `src/services/stakes.ts`, `supabase/migration_stakes.sql`. Если продукт будет использовать реальные деньги, нельзя полагаться только на клиентскую логику React. Следующий агент должен проектировать betting-механику как серверно-валидируемую систему: все балансы, ставки, результаты партий и списания должны проверяться на backend/Supabase edge functions или отдельном сервере, а RLS-политики должны быть протестированы на обходы.

> Следующий агент должен быть силён в gamification и betting games. Нужно улучшать не только APK, но и игровую экономику, антифрод, серверную проверку результата партии и пользовательский опыт онлайн-соревнования.

## 15. Быстрый чек-лист для следующего агента

| Шаг | Что сделать | Ожидаемый результат |
|---|---|---|
| 1 | Распаковать архив и зайти в `shashki-royal/`. | Видна структура проекта. |
| 2 | Проверить `.env`. | Supabase URL и ANON KEY присутствуют. |
| 3 | Выполнить `pnpm install`. | Восстановлены зависимости. |
| 4 | Выполнить `pnpm build`. | `dist/` собирается без ошибок. |
| 5 | Выполнить `npx cap sync`. | Android assets обновлены. |
| 6 | Исправить AGP/compileSdk конфликт. | Gradle готов к сборке. |
| 7 | Выполнить `cd android && ./gradlew assembleDebug`. | Получен свежий APK. |
| 8 | Проверить `Lobby` и `OnlineGame`. | Комнаты создаются и работают между двумя клиентами. |
| 9 | Подготовить release signing, если нужно. | Готов release APK/AAB. |

## 16. Минимальный контекст для общения с пользователем

Пользователь просил сделать всё быстро из-за нехватки токенов. Для пользователя важно получить **один полный архив** и **максимально подробный handoff**, чтобы следующий агент мог продолжить работу сразу. Если APK-сборка ещё не исправлена, нужно честно сказать, что в архив включён доступный debug APK из предыдущей частичной сборки, а свежая сборка требует устранения конфликта Android Gradle Plugin и compileSdk.

Формулировка для пользователя может быть такой: «Я подготовил полный архив проекта с исходниками, Supabase-миграциями, Android-проектом, веб-сборкой, `.env`, отчётами и handoff. Также отдельно приложен доступный debug APK. Свежая APK-сборка не завершена из-за конфликта AGP 7.4.2 и compileSdk 36; в handoff описаны два точных пути исправления».
