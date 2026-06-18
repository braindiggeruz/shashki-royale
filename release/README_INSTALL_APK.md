# Шашки Рояль v1.4.2 — установка APK

Два файла в этом релизе:

* **`shashki-royale-v1.4.2-webview.apk`** — основной (release-signed).
* **`shashki-royale-v1.4.2-webview-debug.apk`** — debug версия (поведение идентично, разница только в типе подписи).

## Установка на Android

1. Скачайте APK на телефон (через браузер с GitHub Release).
2. Откройте файл — Android предложит установить.
3. Если просит «Разрешить установку из неизвестных источников» — соглашайтесь только для вашего браузера/файлового менеджера.
4. Готово. На рабочем столе появится иконка с короной — «Шашки Рояль».

## Параметры APK

| Поле | Значение |
|---|---|
| Package ID | `com.shashkiroyale.webviewfinal` |
| Version name | `1.4.2` |
| Version code | `142` |
| Min SDK | 21 (Android 5.0) |
| Target SDK | 34 (Android 14) |
| Ориентация | portrait |
| URL внутри WebView | https://shashki-royale.pages.dev/?apk=142 |
| Тип | Native Android WebView (НЕ TWA) |
| Подпись | v1 (JAR) + v2 (APK Signature Scheme v2) |

## Что проверить на телефоне

* [ ] При первом открытии **сразу видна главная** — без Google/email login wall.
* [ ] В шапке слева кнопка профиля (имя `Player_xxxxxx`) + бейдж с балансом **100 Coin** (welcome bonus).
* [ ] Справа в шапке: динамик 🔊, кубок 🏆, переключатель RU/UZ.
* [ ] Корона + надпись «ШАШКИ РОЯЛЬ» + «Русские шашки».
* [ ] Большая красная кнопка **«Играть онлайн»**.
* [ ] Блок **«БЫСТРЫЙ МАТЧ»** со ставками **1 · 5 · 10 · 25 · 50 Coin** — кнопки активны (баланс ≥ ставка).
* [ ] Кнопка **«Все столы / своя ставка»**.
* [ ] Серые кнопки **«Играть локально»** и **«Правила»**.
* [ ] **Ничего не обрезается** нижним navigation bar Android (safe-area).
* [ ] **Нет** горизонтального скролла.
* [ ] Тап на ставку “1 Coin” → переход в `/online-game`, ищется соперник.
* [ ] Кнопка «Назад» Android корректно ходит по навигации внутри WebView.
* [ ] Переключатель RU ↔ UZ работает.

## Проверка целостности (опционально)

```
shasum -a 256 shashki-royale-v1.4.2-webview.apk
```

Apksigner verify внутри подписи:

```
apksigner verify --verbose --print-certs shashki-royale-v1.4.2-webview.apk
```

Должно вернуть:
```
Verifies
Verified using v1 scheme (JAR signing): true
Verified using v2 scheme (APK Signature Scheme v2): true
V2 Signer: certificate DN: CN=Shashki Royale, OU=Game, O=ShashkiRoyale, L=Tashkent, ST=TK, C=UZ
```

## Что делать если что-то не работает

* **«Profile not found» / нет баланса:** обновите страницу или перезапустите APK. При первом запуске нужно ≈3 сек чтобы создался профиль + начислились 100 Coin.
* **«Insufficient balance» на ставке:** значит баланс ниже выбранной ставки. Играйте локально или возьмите меньшую ставку.
* **Не находит соперника:** требуется второй игрок с такой же ставкой. Откройте сайт https://shashki-royale.pages.dev/?apk=142 на втором устройстве/в другом браузере и нажмите ту же ставку — матч соберётся автоматически.
* **Белый экран:** проверьте интернет. WebView грузит https://shashki-royale.pages.dev.
