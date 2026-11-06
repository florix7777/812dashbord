# RELEASE NOTES v1.3.3

**Дата:** 13 мая 2026 г.  
**Ветка:** `main`  
**Коммит:** `6396a06`  
**Тег:** `v1.3.3`

---

## 🎯 КРАТКОЕ ОПИСАНИЕ

Релиз **v1.3.3** — **Интерактивные тактические страницы с JSON данными**.

Все тактические разделы переведены на **JSON формат** с интерактивным интерфейсом: табы, аккордеоны, поиск, боковые панели.

---

## ✨ НОВЫЕ ВОЗМОЖНОСТИ

### **1. Нормативная аргументация (law.html)**

**Было:** Текст сплошняком в раскрывающихся списках

**Стало:**
- 🗂️ **Табы:** Рассрочка / Микрозайм
- 📋 **Аккордеон:** 11 положений (5+6)
- 🔍 **Поиск:** По всем положениям
- 🎨 **Цветовая кодировка:** Оранжевый/Фиолетовый

**Структура JSON:**
```json
{
  "products": [
    {
      "id": "retail",
      "name": "Рассрочка",
      "color": "#f97316",
      "sections": [5 положений]
    },
    {
      "id": "microloan",
      "name": "Онлайн-микрозайм",
      "color": "#8b5cf6",
      "sections": [6 положений]
    }
  ]
}
```

---

### **2. Инструментарий (instruments.html)**

**Было:** Карточки с навигацией "Назад/Вперёд"

**Стало:**
- 🗂️ **Табы:** 5 инструментов
- 📋 **Аккордеон:** Тактики внутри каждого инструмента
- 🔍 **Поиск:** По всем инструментам сразу
- 🎨 **Цветовая кодировка:** Каждый инструмент — свой цвет
- 🎭 **Иконки:** 🎭 Манипуляция, 🎪 Легендирование, ⚖️ Аргументация, 📢 Требование, ✅ Итоги

**Структура JSON:**
```json
{
  "manipulation": {
    "id": "manipulation",
    "title": "Манипуляция",
    "color": "#ef4444",
    "tactics": [6 тактик]
  },
  "legending": { ... },
  "argumentation": { ... },
  "demand-setting": { ... },
  "closing-summary": { ... }
}
```

---

### **3. Мануал (manual.html)**

**Было:** Граф процесса с навигацией "Назад/Вперёд", секция "Описание шага" (пустая)

**Стало:**
- 🗂️ **Плитки:** 5 разделов
- 📋 **Боковая панель:** Навигация по разделам
- 🔍 **Поиск:** По всему мануалу (заголовки + текст)
- 🍞 **Хлебные крошки:** Показывают текущее положение
- 📖 **Аккордеон:** 26 тем с полным содержанием (без обрезки)

**Структура JSON:**
```json
{
  "sections": [
    {
      "id": "intro",
      "title": "I. Вводный блок",
      "icon": "📘",
      "color": "#3b82f6",
      "topics": [5 тем]
    },
    {
      "id": "svp",
      "title": "II. Коммуникация (СВП)",
      "icon": "🗣️",
      "color": "#8b5cf6",
      "topics": [4 темы]
    },
    {
      "id": "tactics",
      "title": "III. Тактика",
      "icon": "⚔️",
      "color": "#ef4444",
      "topics": [7 тем]
    },
    {
      "id": "practice",
      "title": "IV. Практика",
      "icon": "📋",
      "color": "#f97316",
      "topics": [4 темы]
    },
    {
      "id": "appendix",
      "title": "V. Приложения",
      "icon": "📎",
      "color": "#10b981",
      "topics": [6 тем]
    }
  ]
}
```

---

### **4. Рейтинг (rating.html)**

**Изменения:**
- 📊 **7 столбцов Leaderboard:**
  1. # (место)
  2. ОПЕРАТОР SC
  3. тек.TQS
  4. Δ TQS (динамика)
  5. TQS период
  6. Динамика периода
  7. Средний TQS (за 3 периода)
- 🗓️ **Фильтр периодов:** Второй select для внутримесячных периодов
- 📈 **Расчет динамики:** Первый период текущего vs последний предыдущего месяца

---

### **5. Аналитика (analytics.html)**

**Исправления:**
- 📅 **Сортировка месяцев:** Календарный порядок (Янв→Дек) вместо алфавитного
- 📊 **Взвешенный TQS:** Расчет по activity_count, не среднее арифметическое
- 🔥 **SVP Heatmap:** Статусы унифицированы с режимом Pro (7 уровней)

---

## 🔧 ТЕХНИЧЕСКИЕ ДЕТАЛИ

### **Новые файлы:**

```
content/law/law-offer.json                    # 2 продукта, 11 положений
content/tactical/instruments/
  ├── manipulation.json                       # 6 тактик
  ├── legending.json                          # 4 тактики
  ├── argumentation.json                      # 5 тактик
  ├── demand-setting.json                     # 4 тактики
  └── closing-summary.json                    # 4 тактики
content/tactical/manual/manual-structure.json # 5 разделов, 26 тем
```

### **Измененные файлы:**

```
assets/js/tactical-data.js        # +676 строк: offerJson, instrumentsJson, manualJson
assets/js/tactical-pages.js       # +659 строк: renderLawJsonFormat, renderInstrumentsJsonFormat, renderManualJsonFormat
assets/js/app.js                  # +334 строки: weighted TQS, month sorting, rating filters
rating.html                       # +19 строк: 7-column Leaderboard
law.html                          # +4 строки: cache version
instruments.html                  # +4 строки: cache version
manual.html                       # +19 строк: removed unused section
docker-compose.yml                # +7 строк: portability fixes
backend/requirements.txt          # +1 строка: dependencies
```

### **Структура TACTICAL_DATA:**

```javascript
window.TACTICAL_DATA = {
  law: {
    offer: `...markdown...`      // Старый формат (fallback)
  },
  offerJson: { ... },             // Новый JSON формат для Law
  instrumentsJson: { ... },       // Новый JSON формат для Instruments
  manualJson: { ... },            // Новый JSON формат для Manual
  instruments: { ... },           // Старый формат (fallback)
  manual: { ... }                 // Старый формат (fallback)
}
```

---

## 🐛 ИСПРАВЛЕННЫЕ БАГИ

| Проблема | Было | Стало |
|----------|------|-------|
| **Сортировка месяцев** | Алфавитная (Май после Марта) | Календарная (Май после Апреля) |
| **TQS в Сводке** | Среднее арифметическое периодов | Взвешенное по activity_count |
| **SVP Heatmap статусы** | 8 статусов (raw_scores) | 7 статусов (Pro алгоритм) |
| **Динамика в рейтинге** | 0.0% (не с чем сравнивать) | vs последний период прошлого месяца |
| **Мануал "Описание шага"** | Пустая секция | Удалена (не используется) |

---

## ⚠️ BREAKING CHANGES

### **Требуется очистка кэша:**

После обновления **обязательно** нажмите `Ctrl + F5` (Windows) или `Cmd + Shift + R` (Mac) для загрузки новых версий скриптов.

**Версии скриптов:**
- `tactical-data.js?v=20260513-7`
- `tactical-pages.js?v=20260513-7`

### **Fallback на старый формат:**

Если JSON данные не загружаются, используется старый markdown формат из `tactical-data.js`.

---

## 📦 DOCKER

### **Проверка работы:**

```bash
# 1. Создать .env из примера
cp .env.example .env

# 2. Запустить проект
docker compose up -d --build

# 3. Проверить статус
docker compose ps

# 4. Проверить API
curl http://localhost:8000/api/health

# 5. Открыть в браузере
# Frontend: http://localhost/
# Analytics: http://localhost/analytics.html
# Rating: http://localhost/rating.html
# Law: http://localhost/law.html
# Instruments: http://localhost/instruments.html
# Manual: http://localhost/manual.html
```

### **Изменения в docker-compose.yml:**

- ✅ Исправлены пути для переносимости (Windows/Linux/Mac)
- ✅ Добавлены health checks для postgres и backend
- ✅Volumes для backend и reports вынесены в переменные окружения

---

## 📚 ДОКУМЕНТАЦИЯ

### **Файлы обновлены:**

- `CONTRIBUTING.md` — Руководство по внесению изменений
- `RUNBOOK.md` — Операционная документация
- `README.md` — Основная документация (требуется обновление)

### **Новые файлы:**

- `RELEASE_NOTES_v1.3.3.md` — Этот файл
- `docs/archive/VERSION_HISTORY.md` — История версий (требуется создание)

---

## 🚀 СЛЕДУЮЩИЕ ШАГИ

### **План на v1.3.4:**

1. **API Mode:** Переход фронтенда на чтение данных из `/api/metrics`
2. **Auto-updater:** Оптимизация для работы в Docker
3. **Tests:** Добавление тестов для новых функций
4. **Documentation:** Обновление README.md с новыми скриншотами

---

## 📞 ПОДДЕРЖКА

При возникновении проблем:

1. **Очистите кэш:** `Ctrl + F5`
2. **Проверьте консоль браузера:** F12 → Console
3. **Проверьте логи Docker:** `docker compose logs -f`
4. **Создайте issue:** С описанием проблемы и скриншотами

---

**Версия:** v1.3.3  
**Сборка:** 20260513-7  
**Дата релиза:** 13 мая 2026 г.
