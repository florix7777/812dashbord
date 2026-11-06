# AGENT HANDOFF v1.3.3

**Версия:** 1.3.3  
**Дата:** 13 мая 2026 г.  
**Статус:** ✅ PRODUCTION READY

---

## 🎯 КРАТКИЙ КОНТЕКСТ

Проект QC Dashboard для Soft Collection Unit. Интерфейс для аналитики и тактических материалов.

**Текущая архитектура:**
- **Frontend:** Статические HTML + Chart.js CDN
- **Backend:** FastAPI + PostgreSQL (теневой режим, накопление данных)
- **Data:** `assets/js/data.js` (Static Mode) + PostgreSQL (ENABLE_BACKEND_SYNC=1)
- **Docker:** 3 контейнера (nginx, backend, postgres)

---

## 📁 СТРУКТУРА ПРОЕКТА

```
Dashboard_SC/
├── content/                    # JSON исходники тактических страниц
│   ├── law/law-offer.json     # Нормативная аргументация (2 продукта)
│   ├── tactical/instruments/  # 5 JSON файлов (manipulation, legending...)
│   └── tactical/manual/       # manual-structure.json (5 разделов, 26 тем)
├── assets/js/
│   ├── data.js                # Данные dashboard (генерируется auto_updater.py)
│   ├── tactical-data.js       # Тактические данные (markdown + JSON)
│   ├── tactical-pages.js      # Рендер тактических страниц
│   └── app.js                 # Основная логика
├── backend/                    # FastAPI API
├── reports/                    # Папка для XLSX/PDF отчетов (не коммитить!)
├── auto_updater.py            # Парсер XLSX/PDF → data.js
├── docker-compose.yml         # Docker конфигурация
└── *.html                     # Страницы (analytics, rating, law, instruments, manual)
```

---

## 🔑 КЛЮЧЕВЫЕ ФАЙЛЫ

### **Тактические данные (tactical-data.js)**

```javascript
window.TACTICAL_DATA = {
  law: { offer: `...markdown...` },      // Fallback
  offerJson: { products: [...] },        // JSON для Law
  instrumentsJson: { manipulation: {...}, ... },  // JSON для Instruments
  manualJson: { sections: [...] },       // JSON для Manual
  instruments: { manipulation: `...` },  // Fallback
  manual: { flow: `...` }                // Fallback
}
```

**Важно:** JSON загружается из `content/*.json` и добавляется в `tactical-data.js` скриптом `add_all_json.py`.

---

### **Рендеринг тактических страниц (tactical-pages.js)**

Три основные функции:

1. **`initLawPage()`** → `renderLawJsonFormat(root, data)`
   - Табы: Рассрочка / Микрозайм
   - Аккордеон: Положения оферты
   - Поиск: По всем положениям

2. **`initInstrumentsPage()`** → `renderInstrumentsJsonFormat(root, data)`
   - Табы: 5 инструментов
   - Аккордеон: Тактики внутри
   - Поиск: По всем инструментам

3. **`initManualPage()`** → `renderManualJsonFormat(root, data)`
   - Плитки: 5 разделов
   - Боковая панель: Навигация
   - Хлебные крошки: Путь
   - Поиск: По всему мануалу

---

### **Аналитика (app.js)**

**Ключевые функции:**

- `initFilters()` — Сортировка месяцев (календарная, не алфавитная!)
- `_getEffectiveData()` — Взвешенный расчет TQS/AHT/SVP по activity_count
- `buildLeaderboard()` — 7 столбцов, динамика vs прошлый месяц
- `renderHeatmapByMode()` — SVP Heatmap (Pro алгоритм)

---

## 🐛 ИЗВЕСТНЫЕ ПРОБЛЕМЫ

### **Не делать (сломает работу):**

1. **Не менять структуру `TACTICAL_DATA`** — сломается загрузка JSON
2. **Не удалять fallback на markdown** — резерв на случай проблем с JSON
3. **Не менять ключи JSON** (`offerJson`, `instrumentsJson`, `manualJson`) — сломается `initLawPage` и др.
4. **Не менять формат `data.js`** — сломается `auto_updater.py` и аналитика

### **Можно безопасно менять:**

1. **Содержание JSON файлов** в `content/` — пересобрать `tactical-data.js`
2. **Стили CSS** — не влияет на логику
3. **Тексты страниц** — только контент, не структуру
4. **Версии кэша** в HTML (`?v=20260513-7`) — для сброса кэша браузера

---

## 🔄 ОБНОВЛЕНИЕ ДАННЫХ

### **XLSX/PDF отчеты → data.js:**

```bash
# 1. Положить файлы в reports/
# Quality 01.05.2026 - 11.05.2026.xlsx
# Промежуточный отчет по сотрудникам SC за период 01-11.05.2026.pdf

# 2. Запустить updater
python auto_updater.py

# 3. Проверить data.js
# assets/js/data.js обновлен
```

### **Тактические JSON → tactical-data.js:**

```bash
# 1. Изменить JSON в content/
# content/law/law-offer.json
# content/tactical/instruments/*.json
# content/tactical/manual/manual-structure.json

# 2. Пересобрать tactical-data.js
python add_all_json.py

# 3. Обновить версии в HTML
# law.html, instruments.html, manual.html: v=20260513-7
```

---

## 🧪 ТЕСТИРОВАНИЕ

### **Перед коммитом:**

```bash
# 1. Синтаксис Python
python -m compileall backend/app.py auto_updater.py

# 2. Тесты backend
pytest -q tests/test_backend_smoke.py

# 3. Docker валидация
docker compose config

# 4. Проверка JSON
python -c "import json; json.load(open('content/law/law-offer.json'))"
```

### **В браузере:**

1. **Очистить кэш:** `Ctrl + F5`
2. **Консоль:** F12 → Console (нет ошибок)
3. **Проверить страницы:**
   - `analytics.html` — графики, месяцы по порядку
   - `rating.html` — 7 столбцов, фильтры
   - `law.html` — табы, аккордеон
   - `instruments.html` — 5 табов, цвета
   - `manual.html` — плитки, боковая панель

---

## 📦 DOCKER

### **Запуск:**

```bash
# 1. Создать .env
cp .env.example .env

# 2. Запустить
docker compose up -d --build

# 3. Проверить
docker compose ps
curl http://localhost:8000/api/health
```

### **Остановить:**

```bash
docker compose down
```

### **Логи:**

```bash
# Все контейнеры
docker compose logs -f

# Отдельный контейнер
docker compose logs -f nginx
```

---

## 🚀 GIT WORKFLOW

### **Создание релиза:**

```bash
# 1. Коммит
git add -A
git commit -m "release: v1.3.x - описание изменений"

# 2. Тег
git tag -a v1.3.x -m "Version 1.3.x — краткое описание"

# 3. Пуш (если есть remote)
git push origin main
git push origin v1.3.x
```

### **Текущие теги:**

```
v1.2.3 — Production deployment
v1.2.4 — Multi-page architecture
v1.3.0 — Antigravity theme
v1.3.1 — Tactical stabilization
v1.3.2 — Final stabilization
v1.3.3 — Interactive tactical pages (CURRENT)
```

---

## 📚 ДОКУМЕНТАЦИЯ

### **Основные файлы:**

- `README.md` — Общая информация
- `CONTRIBUTING.md` — Как вносить изменения
- `RUNBOOK.md` — Операционная документация
- `RELEASE_NOTES_v1.3.3.md` — Детальные заметки релиза
- `AGENT_HANDOFF_v1.3.3.md` — Этот файл (быстрый контекст)

### **Архив:**

- `docs/archive/` — История, старые планы, handoff предыдущих агентов

---

## ⚠️ КРИТИЧЕСКИЕ МОМЕНТЫ

### **1. Кэш браузера**

После изменений **обязательно** `Ctrl + F5`. Версии скриптов: `?v=20260513-7`

### **2. JSON формат**

- `tactical-data.js` должен содержать и JSON, и markdown (fallback)
- Ключи: `offerJson`, `instrumentsJson`, `manualJson` (не менять!)
- JSON экранирует backticks: \` → \\`

### **3. Data.js**

- Генерируется `auto_updater.py` из XLSX/PDF
- Не коммитить изменения (данные меняются часто)
- Формат: `const DASHBOARD_DATA = { "Сотрудник": {...} }`

### **4. Docker**

- Не коммитить `.env` (пароли!)
- `reports/` папка — пустая в git (`.gitkeep` только)
- Health checks: postgres (10s), backend (10s)

---

## 🆘 ПОМОЩЬ

### **Если что-то сломалось:**

1. **Проверить синтаксис:**
   ```bash
   python -m compileall assets/js/tactical-pages.js
   ```

2. **Проверить JSON:**
   ```bash
   python -c "import json; json.load(open('content/law/law-offer.json'))"
   ```

3. **Откатить изменения:**
   ```bash
   git checkout -- assets/js/tactical-pages.js
   ```

4. **Проверить Docker:**
   ```bash
   docker compose down
   docker compose up -d --build
   docker compose logs -f
   ```

### **Контекст:**

- **Не выдумывать** — спрашивать в `CONTRIBUTING.md` или у пользователя
- **Не додумывать** — проверять в документации
- **Не галлюцинировать** — перепроверять изменения

---

**Версия:** v1.3.3  
**Сборка:** 20260513-7  
**Дата:** 13 мая 2026 г.  
**Статус:** ✅ PRODUCTION READY
