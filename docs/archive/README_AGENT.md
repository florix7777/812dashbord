# 🤖 README_AGENT — QC Dashboard Handover (v1.3.0)

> **Для нового агента:** читай этот файл ПЕРВЫМ. Здесь всё что нужно для работы без потери прогресса.

---

## 📋 Сводка проекта

| Параметр | Значение |
|---|---|
| **Версия** | v1.3.0 |
| **Дата** | 2026-04-29 |
| **Статус** | ✅ PRODUCTION — работает в Docker (http://localhost) |
| **Репо** | github.com/vrfcualitycontrol-max/QC_Dashboard_v1.1 |
| **Назначение** | Дашборд контроля качества звонков SC Unit, Variant Retail Finance |

---

## 🗂️ Структура файлов

```
Dashboard_SC/
├── index.html              ← редирект на analytics.html
├── analytics.html          ← операционная аналитика + TQS/AHT графики
├── rating.html             ← рейтинг операторов
├── forecast.html           ← AI прогноз (Holt-Winters, нативный JS)
├── objections_b2c.html     ← база возражений B2C
├── objections_b2b.html     ← база возражений B2B
├── law.html                ← нормативная база (НПА РУз)
├── instruments.html        ← тактический инструментарий (6 модулей)
├── manual.html             ← полный мануал по темам
├── reg_mechanics.html      ← механика оценки + TQS-карта
├── reg_methodology.html    ← методология (9 критериев)
├── svp_mechanism.html      ← архитектура СВП
├── svp_crm.html            ← CRM Soft Collection
├── qc_regulations.html     ← регламент работы QC
├── reg_base.html           ← нормативная база
├── reg_rules.html          ← правила оценки
│
├── assets/
│   ├── css/style.css       ← ВСЕ стили (тёмная + светлая темы)
│   ├── js/
│   │   ├── app.js          ← главная логика: данные, фильтры, графики, initTheme()
│   │   ├── sidebar.js      ← сайдбар: разметка, навигация, toggleSidebar()
│   │   ├── data.js         ← DASHBOARD_DATA (данные по операторам)
│   │   └── tactical-pages.js ← рендеринг тактических страниц (инструменты, мануал, НПА)
│   └── fonts/, images/
│
├── Dockerfile              ← nginx:alpine, копирует *.html + assets/
├── docker-compose.yml      ← nginx (port 80) + backend (8000) + postgres
├── nginx.conf              ← конфиг nginx
│
├── README_AGENT.md         ← ЭТО ФАЙЛ (для агентов)
└── PROJECT_STATUS.md       ← краткий статус + changelog
```

---

## 🎨 Дизайн-система (Antigravity Light Theme)

### Принципы
- **Светлая тема — основная** (по умолчанию при первом запуске)
- Тёмная тема — опциональная, включается кнопкой ☀️/🌙 в правом верхнем углу
- Выбранная тема **сохраняется при переходах** между страницами (через URL-параметр `?theme=light|dark` + `localStorage`)

### Цветовая палитра (светлая тема)
```css
--bg-main:     #fdfaf6    /* основной фон — тёплый белый */
--bg-sidebar:  rgba(253, 250, 246, 0.85) + blur  /* сайдбар */
--text-main:   #3f3f46    /* основной текст — тёмно-серый */
--text-accent: #ea580c    /* акцент — оранжевый */
--border:      rgba(249, 115, 22, 0.15)  /* мягкая оранжевая граница */
```

### CSS-классы для динамических компонентов
Все интерактивные элементы используют реактивные CSS-классы (не inline-стили), которые автоматически адаптируются к теме:

| Класс | Назначение |
|---|---|
| `.tactical-input` | Поля ввода, поисковики |
| `.tactical-stage` | Секции с контентом (фон) |
| `.tactical-pill` | Кнопки-таблетки переключения |
| `.tactical-pill.active` | Активная кнопка-таблетка |
| `.tactical-text-title` | Заголовки в контенте |
| `.tactical-text-body` | Основной текст контента |
| `.tactical-text-accent` | Акцентный текст (оранжевый) |
| `.tactical-th` | Заголовки таблиц |
| `.tactical-td` | Ячейки таблиц |
| `.tactical-code` | Инлайн-код |
| `.tqs-btn` | Кнопка "Открыть карту TQS" |

---

## 🔧 Архитектура темы и сайдбара

### Как работает тема
```
Загрузка страницы
  → app.js: initTheme() читает ?theme= из URL (приоритет) → localStorage → default='light'
  → body.classList.add('light-mode') или remove
  → Кнопка ☀️/🌙 обновляется
  → При клике на nav-ссылку: sidebar.js дописывает ?theme=... в href
  → Следующая страница получает тему через URL, применяет без мигания
```

### Как работает сайдбар
```
Загрузка страницы
  → initTheme() читает ?sidebar= из URL (приоритет) → localStorage → default='expanded'
  → ВАЖНО: сначала transition='none', потом класс, потом transition='' (нет мигания!)
  → При клике на nav-ссылку: sidebar.js дописывает ?sidebar=collapsed|expanded в href
  → Гамбургер (☰): toggleSidebar() — переключает collapsed/expanded, сохраняет в LS и URL
```

### ⚠️ Критические правила (не нарушать!)
1. **`initTheme()` всегда должна**: замораживать `transition` → применять класс → восстанавливать transition через `requestAnimationFrame × 2`
2. **`toggleSidebar()`** определена **только в `sidebar.js`**. В `app.js` только `window.toggleSidebar = toggleSidebar`
3. **Никаких `toggleTheme()`/`toggleSidebar()` в sidebar.js** — там только единственный `toggleSidebar()`
4. **Все nav-ссылки** получают `?theme=` и `?sidebar=` через перехватчик в `initSidebar()`
5. **Не использовать inline-стили** для тематических изменений — только CSS-классы

---

## 📄 Тактические страницы (instruments.html, manual.html, law.html)

Рендеринг этих страниц — в `assets/js/tactical-pages.js`.

### Функции
- `initInstrumentsPage()` — инициализирует страницу инструментарий
- `initManualPage()` — инициализирует мануал
- `initLawPage()` — инициализирует нормативную базу

### Структура данных
Данные для инструментов/мануала хранятся в виде Markdown в `data.js` и рендерятся через:
- `markdownToSimpleHtml(mdText)` — MD → HTML
- `splitByHeading(mdText, level)` — разбивает MD по заголовкам
- `buildManualTopics(mdText)` — автовыбор уровня заголовков

### Важно
- В `formatInline()` используй класс `tactical-code` (не inline-стиль с цветом)
- Заголовки `##` и `###` используют класс `tactical-text-accent` (адаптируется к теме)

---

## 🐳 Docker

```bash
# Проверить статус
docker ps

# Контейнеры
# qc_nginx    → http://localhost (порт 80) — фронтенд
# qc_backend  → http://localhost:8000 — бэкенд
# qc_postgres → порт 5432 — БД

# Пересобрать после изменений в HTML/JS/CSS (не обязательно, nginx монтирует директорию напрямую)
docker-compose restart qc_nginx

# Полный ребилд образа (если менялся Dockerfile)
docker-compose build nginx && docker-compose up -d nginx
```

### Конфигурация
- Nginx монтирует директорию `Dashboard_SC` напрямую через `bind mount` — изменения в файлах применяются **без пересборки образа**
- Версия Dockerfile: обновить строку `# Version:` при изменениях

---

## 📊 Данные

Данные операторов — в `assets/js/data.js`, объект `DASHBOARD_DATA`.

### Структура записи оператора
```js
"Имя Фамилия": {
  months: {
    "Февраль 2026": {
      summary: { tqs, aht, calls, nps, ... },
      periods: [
        { period: "01-07.02.2026", tqs, aht, calls, ... },
        ...
      ]
    }
  }
}
```

### Добавление нового периода
1. Добавить объект в `periods` нужного месяца для каждого оператора
2. Обновить `summary` (агрегация по всем периодам)
3. Если новый месяц — добавить ключ в `months`

---

## 🚀 Git & Версионность

```bash
# Текущая ветка: main
# Последний тег: v1.3.0

# Создать коммит
git add -A
git commit -m "feat: описание"
git push origin main

# Тег версии
git tag -a v1.X.X -m "release: описание"
git push origin v1.X.X
```

### Changelog
| Версия | Дата | Изменения |
|---|---|---|
| v1.3.0 | 2026-04-29 | Antigravity light theme, theme/sidebar persistence, sidebar jitter fix |
| v1.2.5 | 2026-04-23 | Tactical knowledge base stabilization |
| v1.2.4 | 2026-04-22 | Multi-page architecture, AI forecasting |
| v1.2.3 | ~2026-03 | Initial production release |

---

## ✅ Текущий статус компонентов

| Компонент | Статус | Примечание |
|---|---|---|
| Светлая тема | ✅ Готово | Основная тема, по умолчанию |
| Тёмная тема | ✅ Готово | Опциональная |
| Переключение темы | ✅ Готово | Сохраняется при навигации |
| Сайдбар компактный | ✅ Готово | Без мигания при переходах |
| Сайдбар раскрытый | ✅ Готово | Состояние сохраняется |
| Инструментарий | ✅ Готово | CSS-классы, адаптивный |
| Мануал | ✅ Готово | CSS-классы, адаптивный |
| НПА / Law | ✅ Готово | CSS-классы, адаптивный |
| Механика оценки | ✅ Готово | Адаптированные цвета и шрифты |
| Нормат. база | ✅ Готово | Адаптированные цвета и шрифты |
| Кнопка TQS-карты | ✅ Готово | Стиль `.tqs-btn` |
| AI Прогноз | ✅ Готово | Holt-Winters, нативный JS |
| Docker | ✅ Работает | nginx:80, backend:8000, postgres |
| GitHub | ✅ Актуально | Ветка main, тег v1.3.0 |

---

## 🔜 Следующие задачи (из MASTER_PLAN)

1. **Export Module** — экспорт отчётов в PDF/PNG
2. **Growth Insights** — панель динамики роста операторов
3. **New Period** — добавление данных за следующий период
