# MVP — План улучшений Dashboard_SC
**Версия:** 1.0 | **Дата:** 04.05.2026 | **Составлен по результатам аудита**

> **Для агента:** Этот документ — твоя пошаговая инструкция. Выполняй задачи строго по порядку. Не пропускай шаги. Не делай ничего, что не описано здесь. Перед каждым изменением — читай раздел "⚠️ Осторожно".

---

## 🗂️ Структура плана

| Этап | Приоритет | Описание | Риск |
|------|-----------|----------|------|
| [Этап 1](#этап-1-уборка-мусора) | P2 | Удаление мусорных файлов | 🟢 Низкий |
| [Этап 2](#этап-2-исправление-данных) | P0 | Очистка data.js от мусорных записей | 🟡 Средний |
| [Этап 3](#этап-3-удаление-tailwind) | P1 | Удаление Tailwind CDN | 🟢 Низкий |
| [Этап 4](#этап-4-error-handling) | P0 | Добавление защиты от ошибок | 🟡 Средний |
| [Этап 5](#этап-5-оптимизация-загрузки) | P1 | Не грузить тяжёлые скрипты где не надо | 🟡 Средний |
| [Этап 6](#этап-6-исправление-heatmap-pro) | P1 | Починить Pro-heatmap в light-mode | 🟡 Средний |
| [Этап 7](#этап-7-исправление-модального-окна) | P2 | Выровнять CSS-классы модального окна | 🟢 Низкий |
| [Этап 8](#этап-8-исправление-aht-формата) | P2 | Стандартизировать формат AHT | 🟡 Средний |

### Статус выполнения (журнал)

| Этап | Статус | Примечание |
|------|--------|------------|
| Этап 1 — Уборка мусора | **Выполнено** (04.05.2026) | Удалены временные скрипты; архивные MD и прочие лишние файлы корня → `docs/archive/` или `reports/`; корень соответствует списку 1.2. |
| Этап 2 — Данные | **Выполнено** (04.05.2026) | `clean_data()` в `auto_updater.py`; `refresh_dashboard()` пересобрал `assets/js/data.js`. |
| Этап 3 — Tailwind CDN | **Выполнено** (04.05.2026) | Утилиты в `style.css`; CDN убран из 15 HTML. |
| Этап 4 — Error handling | **Выполнено** (04.05.2026) | Глобальные обработчики и `try/catch` в `app.js` по плану. |
| Этап 5 — Загрузка скриптов | **Выполнено** (04.05.2026) | Добавлен `assets/js/core.js`; на информационных страницах без `data.js`/`app.js` (+ `reg_mechanics.html` по той же логике). |
| Этап 6 — Heatmap Pro | **Выполнено** (04.05.2026) | Классы в `style.css`, правки `renderHeatmapPro()` в `app.js`. |
| Этап 7 — Модальное окно | **Выполнено** (04.05.2026) | Вариант B: `law-modal` / `law-modal-box` в B2C/B2B. |
| Этап 8 — AHT | **Выполнено** (04.05.2026) | `format_duration()` в Python; `_ahtToSecs` / `_secsToAht` в `app.js`; данные пересобраны. |

---

## ✅ Правила работы для агента

1. **Перед изменением любого файла** — прочитай его полностью
2. **Делай резервную копию** файла перед правкой (добавь суффикс `.bak`)
3. **Проверяй результат** после каждого шага
4. **Не меняй данные** (data.js) напрямую — только через описанные инструкции
5. **Если что-то непонятно** — остановись и спроси, не импровизируй

---

## Этап 1: Уборка мусора

### 1.1 Файлы для удаления из корня проекта

⚠️ **Осторожно:** Перед удалением убедись, что файл НЕ импортируется ни в одном HTML. Проверь командой: `findstr /r /s "имя_файла" *.html`

**Временные скрипты-заглушки (удалить безопасно):**
```
temp_script.js          ← 639 КБ мусор
index.html.backup       ← 824 КБ старый бэкап
check.py
check_data.py
check_rec.py
clean_appjs.py
cleanup_assets.py
debug_pdf_parse.py
debug_rec.py
fix_app_js.py
fix_brackets.py
fix_sidebar_flicker.py
fix_syntax.py
fix_tactical.py
fix_tactical_bg.py
fix_vse.py
generate_pages.py
inject_data.py
inject_pages.py
parse_pdfs.py
refactor_final.py
refactor_md.py
refactor_mechanics.py
refactor_sidebar.py
refactor_tactical.py
refactor_theme.py
replace_light_mode.py
split_index.py
update_april.py
update_b2b.py
update_cache.py
update_legend.py
update_theme.py
write_sidebar.py
```

**Архивные MD-документы (переместить в `docs/archive/`):**
```
ACTION_PLAN_21042026.md
CRISIS_MANAGEMENT_ARCHIVED.md
DEEP_AUDIT_21042026.md
DEPLOYMENT_STATUS.md
FINAL_REPORT.md
GENERAL_PLAN.md
AGENT_BRIEF.md
README_AGENT.md
Работа предыдущего агента.md   ← 407 КБ!
```

**Создай папку для архива:**
```powershell
New-Item -ItemType Directory -Path "docs\archive" -Force
Move-Item ACTION_PLAN_21042026.md docs\archive\
Move-Item CRISIS_MANAGEMENT_ARCHIVED.md docs\archive\
# ... и т.д. для всех архивных MD
```

### 1.2 Проверка после этапа 1

После уборки в корне проекта должны остаться ТОЛЬКО эти файлы:
```
index.html              ← редирект на analytics.html
analytics.html
rating.html
forecast.html
objections_b2c.html
objections_b2b.html
law.html
instruments.html
manual.html
reg_mechanics.html
reg_methodology.html
reg_base.html
reg_rules.html
qc_regulations.html
svp_crm.html
svp_mechanism.html
auto_updater.py
b2b_data.json
b2b_script.txt
skill.md
MVP.md                  ← этот файл
CHANGELOG.md
README.md
VERSION_HISTORY.md
RELEASE_NOTES.md
MANIFEST.json
Dockerfile
docker-compose.yml
docker-config.json
nginx.conf
.dockerignore
.gitignore
health_check.ps1
snapshot.sh
```

---

## Этап 2: Исправление данных

### 2.1 Проблема

В `assets/js/data.js` есть записи с ключом `"Неизвестно"` внутри объектов сотрудников, а также служебные поля `_tqs_values`, `_durations`, `_activity_count`. Они искажают статистику.

### 2.2 Как найти проблему

Открой `assets/js/data.js` и найди:
- Строки вида `"Неизвестно": {` — это целые разделы месяцев
- Строки вида `"period": "Неизвестно"` — ненужные периоды
- Строки вида `"_tqs_values": []` — служебные поля

### 2.3 Исправление в auto_updater.py

⚠️ **Это исправление в автообновителе, а НЕ в data.js напрямую.** При следующем запуске auto_updater.py данные пересоберутся чисто.

Открой `auto_updater.py` и найди функцию `refresh_dashboard()` (строка ~450). После строки `data = read_xlsx_files()` добавь очистку:

```python
def clean_data(data: Dict[str, Any]) -> Dict[str, Any]:
    """Удаляет мусорные записи из собранных данных."""
    cleaned = {}
    for employee, emp_data in data.items():
        if not employee or employee.strip() == "":
            continue
        clean_months = {}
        for month, month_data in emp_data.get("months", {}).items():
            if month == "Неизвестно":
                continue  # пропускаем неизвестные месяцы
            clean_periods = []
            for period in month_data.get("periods", []):
                if period.get("period") == "Неизвестно":
                    continue
                if period.get("tqs", 0) == 0 and not period.get("_tqs_values"):
                    continue  # пустые периоды без данных
                # Удаляем служебные поля
                period.pop("_tqs_values", None)
                period.pop("_durations", None)
                period.pop("_activity_count", None)
                clean_periods.append(period)
            if clean_periods:
                clean_months[month] = {"periods": clean_periods}
        if clean_months:
            cleaned[employee] = {"months": clean_months}
    return cleaned
```

Затем в `refresh_dashboard()` добавь вызов после парсинга:
```python
def refresh_dashboard() -> None:
    try:
        data = read_xlsx_files()
        read_pdf_files(data)
        data = clean_data(data)  # ← ДОБАВИТЬ ЭТУ СТРОКУ
        if not data:
            ...
```

### 2.4 Ручная правка data.js (временное решение)

Если нет возможности запустить auto_updater.py, вручную в `assets/js/data.js`:
1. Найди все вхождения `"Неизвестно":` (как ключ месяца внутри `months`)
2. Удали весь блок `"Неизвестно": { "periods": [...] }` вместе с запятой перед ним
3. Убедись что JSON остался валидным (скобки сбалансированы)

---

## Этап 3: Удаление Tailwind

### 3.1 Проблема

Все HTML-файлы содержат:
```html
<script src="https://cdn.tailwindcss.com"></script>
```
Это +300 КБ при каждой загрузке. Tailwind используется только для классов `transition-all duration-300` на `#sidebar` и `#main`.

### 3.2 Решение

**Шаг A:** В файл `assets/css/style.css` добавь в самое начало:
```css
/* Замена Tailwind utility-классов */
.transition-all {
  transition-property: all;
  transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
}
.duration-300 {
  transition-duration: 300ms;
}
```

**Шаг B:** Во ВСЕХ HTML-файлах удали строку:
```html
<script src="https://cdn.tailwindcss.com"></script>
```

**Список файлов для правки (15 штук):**
```
analytics.html
rating.html
forecast.html
objections_b2c.html
objections_b2b.html
law.html
instruments.html
manual.html
reg_mechanics.html
reg_methodology.html
reg_base.html
reg_rules.html
qc_regulations.html
svp_crm.html
svp_mechanism.html
```

**Шаг C: Проверка.** Открой каждую страницу. Сайдбар должен плавно открываться/закрываться как прежде.

---

## Этап 4: Error Handling

### 4.1 Проблема

В `assets/js/app.js` нет защиты от ошибок. Если у сотрудника нет данных за текущий месяц — весь дашборд падает.

### 4.2 Добавление глобального обработчика ошибок

Открой `assets/js/app.js`. В самое начало файла (строка 1) добавь:

```javascript
// ========== GLOBAL ERROR BOUNDARY ==========
window.onerror = function(msg, src, line, col, err) {
  console.error('[QC Dashboard Error]', msg, 'at', src, line + ':' + col, err);
  return true; // предотвращаем показ браузерного alert
};

window.addEventListener('unhandledrejection', function(e) {
  console.error('[QC Dashboard Promise Error]', e.reason);
});
```

### 4.3 Защита функции updateDashboard

Найди в `app.js` функцию `updateDashboard()` (строка ~401). Оберни её содержимое:

```javascript
function updateDashboard() {
  try {
    // ... весь существующий код функции ...
  } catch (e) {
    console.error('[updateDashboard failed]', e);
  }
}
```

### 4.4 Защита функции showEmployee

Найди функцию `showEmployee(name)` (строка ~749). Оберни содержимое аналогично:

```javascript
function showEmployee(name) {
  try {
    // ... весь существующий код ...
  } catch (e) {
    console.error('[showEmployee failed]', e);
    const el = document.getElementById('drilldownContent');
    if (el) el.innerHTML = '<p style="color:#ef4444;padding:20px;">Ошибка загрузки данных сотрудника</p>';
  }
}
```

### 4.5 Защита рендера Heatmap

Найди `renderHeatmap()` (строка ~634) и `renderHeatmapPro()` (строка ~667). Добавь в начало каждой:

```javascript
function renderHeatmap() {
  try {
    // ... весь существующий код ...
  } catch(e) {
    console.error('[renderHeatmap failed]', e);
  }
}
```

---

## Этап 5: Оптимизация загрузки скриптов

### 5.1 Проблема

Информационные страницы (`reg_methodology.html`, `qc_regulations.html`, `svp_crm.html`, `svp_mechanism.html`, `reg_base.html`, `reg_rules.html`, `reg_mechanics.html`) загружают `data.js` (596 КБ) и `app.js` (76 КБ) без необходимости.

### 5.2 Что удалить с информационных страниц

На следующих страницах **удали** теги `<script src="assets/js/data.js">` и `<script src="assets/js/data.js">`:

```
reg_methodology.html    ← удали data.js и app.js (там нет графиков)
reg_base.html           ← удали data.js и app.js
reg_rules.html          ← удали data.js и app.js
qc_regulations.html     ← удали data.js и app.js
svp_mechanism.html      ← удали data.js и app.js
svp_crm.html            ← удали data.js и app.js
```

⚠️ **Осторожно:** НЕ удаляй `sidebar.js` — он нужен для навигации. НЕ удаляй `app.js` c тех страниц, где он используется (вызовы `toggleTheme`, `initTheme` — они в app.js).

**Решение:** Вынести `initTheme` и `toggleTheme` в `sidebar.js`, чтобы они работали без app.js. Или создать `core.js` с минимальными функциями:

**Создай `assets/js/core.js`:**
```javascript
// Минимальный набор для информационных страниц
function isLight() { return document.body.classList.contains('light-mode'); }

function initTheme() {
  const urlParams = new URLSearchParams(window.location.search);
  let theme = urlParams.get('theme') || localStorage.getItem('sc-theme') || 'light';
  localStorage.setItem('sc-theme', theme);
  if (theme === 'light') {
    document.body.classList.add('light-mode');
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.innerHTML = '🌞';
  }
  // Sidebar state
  let sidebarState = urlParams.get('sidebar') || localStorage.getItem('sc-sidebar') || 'expanded';
  localStorage.setItem('sc-sidebar', sidebarState);
  const sidebar = document.getElementById('sidebar');
  const main = document.getElementById('main');
  if (sidebar && main) {
    sidebar.style.transition = 'none';
    main.style.transition = 'none';
    if (sidebarState === 'collapsed') {
      sidebar.classList.add('collapsed');
      main.classList.add('collapsed');
    }
    requestAnimationFrame(() => requestAnimationFrame(() => {
      sidebar.style.transition = '';
      main.style.transition = '';
    }));
  }
}

function toggleTheme() {
  const isLightNow = document.body.classList.toggle('light-mode');
  const theme = isLightNow ? 'light' : 'dark';
  localStorage.setItem('sc-theme', theme);
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.innerHTML = isLightNow ? '🌞' : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>';
  const url = new URL(window.location.href);
  url.searchParams.set('theme', theme);
  window.history.replaceState({}, '', url);
}

window.toggleTheme = toggleTheme;
window.toggleSidebar = function() {
  const sidebar = document.getElementById('sidebar');
  const main = document.getElementById('main');
  sidebar.style.transition = 'none';
  main.style.transition = 'none';
  const isCollapsed = sidebar.classList.toggle('collapsed');
  main.classList.toggle('collapsed');
  requestAnimationFrame(() => requestAnimationFrame(() => {
    sidebar.style.transition = '';
    main.style.transition = '';
  }));
  const state = isCollapsed ? 'collapsed' : 'expanded';
  localStorage.setItem('sc-sidebar', state);
  const url = new URL(window.location.href);
  url.searchParams.set('sidebar', state);
  window.history.replaceState({}, '', url);
};
```

На информационных страницах замени:
```html
<!-- БЫЛО -->
<script src="assets/js/data.js"></script>
<script src="assets/js/sidebar.js"></script>
<script src="assets/js/app.js"></script>

<!-- СТАЛО -->
<script src="assets/js/core.js"></script>
<script src="assets/js/sidebar.js"></script>
```

---

## Этап 6: Исправление Heatmap Pro

### 6.1 Проблема

Функция `renderHeatmapPro()` в `app.js` (строки 667-744) содержит захардкоженные dark-цвета в inline-стилях. В light-mode таблица нечитаема.

### 6.2 Решение

В `renderHeatmapPro()` найди строки с захардкоженными цветами и замени их на CSS-классы.

**Шаг A.** В `assets/css/style.css` добавь в конец:

```css
/* ===== PRO HEATMAP ===== */
.pro-heatmap-legend {
  margin-bottom: 12px;
  padding: 12px;
  border: 1px solid #2d3748;
  border-radius: 10px;
  background: rgba(15, 23, 42, 0.45);
}
body.light-mode .pro-heatmap-legend {
  border: 1px solid #e4e4e7;
  background: #ffffff;
}

.pro-heatmap-legend-title {
  font-size: 12px;
  font-weight: 600;
  color: #cbd5e1;
  margin-bottom: 9px;
}
body.light-mode .pro-heatmap-legend-title {
  color: #3f3f46;
}

.pro-heatmap-row {
  display: flex;
  margin-bottom: 4px;
  cursor: pointer;
  padding: 6px;
  border-radius: 8px;
  border: 1px solid rgba(45, 55, 72, 0.65);
  background: rgba(15, 23, 42, 0.28);
  transition: all 0.15s ease;
}
body.light-mode .pro-heatmap-row {
  border: 1px solid #e4e4e7;
  background: #ffffff;
}

.pro-heatmap-row.selected {
  border: 1px solid #a78bfa;
  background: rgba(167, 139, 250, 0.12);
}

.pro-heatmap-name {
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: #e2e8f0;
  line-height: 1;
  display: flex;
  align-items: center;
}
body.light-mode .pro-heatmap-name {
  color: #27272a;
}
```

**Шаг B.** В `renderHeatmapPro()` замени генерацию строки оператора:

```javascript
// БЫЛО (захардкоженные цвета):
const border = name === selectedEmployee
  ? 'border:1px solid #a78bfa;background:rgba(167,139,250,0.12);'
  : 'border:1px solid rgba(45,55,72,0.65);background:rgba(15,23,42,0.28);';
html += `<div style="...${border}..." ...>`;
html += `<div style="...color:#e2e8f0;...">`;

// СТАЛО (CSS-классы):
const rowClass = 'pro-heatmap-row' + (name === selectedEmployee ? ' selected' : '');
html += `<div class="${rowClass}" style="gap:${colGap}px;margin-bottom:4px;" onclick="showEmployee('${name.replace(/'/g, "\\'")}')">`;
html += `<div class="pro-heatmap-name" style="width:${operatorWidth}px;font-size:${nameFont}px;">${name}</div>`;
```

**Шаг C.** Легенду Pro-heatmap обернуть в класс:
```javascript
// БЫЛО:
let html = '<div style="margin-bottom:12px;padding:12px;border:1px solid #2d3748;border-radius:10px;background:rgba(15,23,42,0.45);">';
html += '<div style="font-size:12px;font-weight:600;color:#cbd5e1;margin-bottom:9px;">Pro-диагноз...';

// СТАЛО:
let html = '<div class="pro-heatmap-legend">';
html += '<div class="pro-heatmap-legend-title">Pro-диагноз по процентной шкале (7 уровней)</div>';
```

---

## Этап 7: Исправление модального окна

### 7.1 Проблема

В `objections_b2c.html` и `objections_b2b.html` модальное окно закона использует классы `modal-overlay` и `modal`, которых НЕТ в `style.css`. Есть только `.law-modal` и `.law-modal-box`.

### 7.2 Решение

**Вариант A (быстрый):** Добавить алиасы в `style.css`:
```css
/* Алиасы для совместимости */
.modal-overlay { display: none; position: fixed; top: 0; left: 0;
  width: 100%; height: 100%; background: rgba(0,0,0,0.7);
  z-index: 200; align-items: center; justify-content: center; }
.modal-overlay.open { display: flex; }
.modal { background: #1e2435; border: 1px solid #a78bfa;
  border-radius: 14px; padding: 28px; max-width: 500px;
  width: 90%; position: relative; }
body.light-mode .modal { background: #ffffff; }
```

**Вариант B (правильный):** В `objections_b2c.html` и `objections_b2b.html` поменяй классы:
```html
<!-- БЫЛО: -->
<div class="modal-overlay" id="lawModal" onclick="...">
  <div class="modal" style="position:relative;">

<!-- СТАЛО: -->
<div class="law-modal" id="lawModal" onclick="...">
  <div class="law-modal-box">
```

⚠️ Предпочитай Вариант B — он не добавляет лишний CSS.

---

## Этап 8: Исправление формата AHT

### 8.1 Проблема

`auto_updater.py` → `format_duration()` возвращает формат `"02:12:45"` (ч:мм:сс или мм:сс:00), а `_ahtToSecs()` в app.js парсит как `MM:SS` (минуты:секунды). Это приводит к неверному отображению AHT.

### 8.2 Исправление в auto_updater.py

Найди функцию `format_duration()` (строка ~140) и замени на:

```python
def format_duration(minutes: float) -> str:
    """Возвращает строку в формате M:SS (минуты:секунды) для совместимости с app.js."""
    if minutes <= 0:
        return "N/A"
    total_seconds = int(round(minutes * 60))
    mins = total_seconds // 60
    secs = total_seconds % 60
    return f"{mins}:{secs:02d}"
```

### 8.3 Исправление парсера в app.js

Найди `_ahtToSecs()` (строка ~360) и замени на более надёжную версию:

```javascript
function _ahtToSecs(t) {
  if (!t || t === 'N/A') return 0;
  const p = t.split(':');
  if (p.length === 3) {
    // формат H:MM:SS
    return parseInt(p[0]||0)*3600 + parseInt(p[1]||0)*60 + parseInt(p[2]||0);
  }
  // формат M:SS
  return parseInt(p[0]||0)*60 + parseInt(p[1]||0);
}
function _secsToAht(s) {
  const m = Math.floor(s/60);
  const sec = s % 60;
  return m + ':' + sec.toString().padStart(2,'0');
}
```

---

## 🏁 Финальная проверка

После выполнения всех этапов проверь:

### Чеклист для агента:

- [x] `temp_script.js` удалён
- [x] `index.html.backup` удалён
- [x] Мусорные py-скрипты удалены или перемещены
- [x] В `data.js` нет записей `"Неизвестно"`
- [x] Tailwind CDN убран из всех 15 HTML-файлов
- [x] `.transition-all` и `.duration-300` добавлены в `style.css`
- [x] Сайдбар по-прежнему плавно анимируется
- [x] `window.onerror` добавлен в `app.js`
- [x] `updateDashboard()` обёрнута в try/catch
- [x] `core.js` создан для информационных страниц
- [x] Информационные страницы больше не грузят `data.js`
- [x] Pro-heatmap выглядит корректно в light-mode
- [x] Модальное окно закона открывается корректно на B2C/B2B страницах
- [x] AHT отображается в формате `M:SS`

### Быстрая проверка в браузере:

1. Открой `analytics.html` → KPI-карточки показывают данные
2. Переключи тему → всё меняется корректно
3. Открой `analytics.html` → Pro-heatmap читаем в light-mode
4. Нажми на карточку закона в B2C → модальное окно открывается
5. Открой `reg_methodology.html` → страница загружается быстро (нет data.js в Network)
6. Открой DevTools → Console → нет красных ошибок

---

## 📝 Что НЕ делать

- ❌ Не рефакторить `sidebar.js` без понимания анти-флicker логики
- ❌ Не удалять `raw_scores` из data.js — они используются в диагностике
- ❌ Не менять ключи SVP_KEYS — они синхронизированы между auto_updater.py и app.js
- ❌ Не трогать forecast.html пока не стабилизирован основной analytics.html
- ❌ Не подключать базу данных — backend/app.py — заглушка, пусть остаётся
- ❌ Не менять структуру `DASHBOARD_DATA` — много кода завязано на неё

---

*Документ составлен на основе аудита от 01.05.2026. Актуален для версии v1.2.3.*
