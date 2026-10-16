# SQUAD SOUND

Музыкальный плеер Сквада для **Windows (.exe)** и **Android (.apk)** — один код на Web Audio API,
обёртки Electron и Capacitor.

## Возможности

- **Темы:** Сквад (по умолчанию, как у бота Фини), Мята, AMOLED, Неон, Океан, Токсик, Закат, Светлая + свой цвет акцента.
- **Скорость** 0.5×–2× без изменения тона и **тон** ±12 полутонов без изменения скорости.
- **Винил-режим:** тон вместе со скоростью (Nightcore / Slowed).
- **Реверберация** (количество, размер зала), **эхо** (задержка, повторы).
- **10-полосный эквалайзер** + предусилитель, 12 пресетов.
- **Бас-буст, стерео-ширина, баланс, 8D-звук, лимитер.**
- Пресеты эффектов: Nightcore, Slowed + Reverb, 8D, Концерт, Бас-буст, Пещера, Радио.
- Перемешивание, повтор (список / трек), таймер сна, визуализатор, поиск, drag & drop.
- Управление с экрана блокировки / медиаклавиш (Media Session).
- Все настройки сохраняются. В Windows-версии запоминается и библиотека треков.

## Где взять сборки

GitHub Actions собирает оба файла на каждый push и PR (вкладка **Actions → артефакты**).
При push в `main` или теге `v*` файлы публикуются в **Releases**.

| Файл | Что это |
|---|---|
| `SQUAD-SOUND-x.y.z-setup.exe` | установщик Windows |
| `SQUAD-SOUND-x.y.z-portable.exe` | Windows без установки |
| `SQUAD-SOUND-x.y.z-android.apk` | Android 7.0+ (debug-подпись) |

## Локальная разработка

```bash
npm ci
npm start               # запустить .exe-версию (Electron)
npm run web             # открыть как сайт на http://localhost:8080
npm run dist:win        # собрать .exe (на Windows)
npm run android:apk     # собрать .apk (нужны JDK 21 и Android SDK)
```

## Структура

```
www/                 общий интерфейс и звук
  js/audio-engine.js цепочка Web Audio: тон, EQ, реверб, эхо, 8D, лимитер
  js/themes.js       темы (цвета Сквада — объект `squad`)
  js/app.js          интерфейс плеера
electron/            оболочка Windows
scripts/android-prepare.js  генерация Android-проекта Capacitor
.github/workflows/build.yml сборка .exe и .apk
```
