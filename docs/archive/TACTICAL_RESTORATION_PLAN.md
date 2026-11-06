# План восстановления тактических разделов дашборда

> [!CAUTION]
> **ГЛАВНОЕ ПРАВИЛО**: ты работаешь ТОЛЬКО с файлами, перечисленными в этом плане. НЕ трогай файлы аналитики (`analytics.html`, `rating.html`, `forecast.html`, `objections_*.html`, `svp_*.html`, `reg_*.html`, `qc_regulations.html`), НЕ трогай `assets/js/data.js`, `assets/js/app.js`, `assets/js/sidebar.js`, `auto_updater.py`. Любое изменение этих файлов = поломка проекта.

---

## 1. Контекст проблемы

Дашборд QC Dashboard_SC содержит 3 страницы с тактическим контентом:
- **`law.html`** → раздел «Нормативная аргументация»
- **`instruments.html`** → раздел «Инструментарий»
- **`manual.html`** → раздел «Мануал»

Эти страницы **нефункциональны** — показывают заглушки «файл пуст» / «Контент не заполнен», хотя все исходные Markdown-файлы в папке `content/` **полностью заполнены**.

### Корневая причина
Файл `assets/js/tactical-pages.js` загружает `.md`-файлы через `fetch()` в рантайме. **Проблема: `fetch()` возвращает пустой ответ** (например, из-за протокола `file://` или CORS). Результат: код считает, что файлы пусты, и рисует заглушки.

### Решение
**Перейти от динамической загрузки `fetch()` к встроенным данным**. Вся информация из `.md`-файлов будет встроена в единый JS-модуль `assets/js/tactical-data.js`, который подключается через `<script>` тег.

---

## 2. Архитектура файлов

### Файлы, которые ты СОЗДАЁШЬ (новые):
| Файл | Назначение |
|---|---|
| `assets/js/tactical-data.js` | JS-модуль: содержит весь контент из `.md`-файлов в виде JavaScript-строк |

### Файлы, которые ты ИЗМЕНЯЕШЬ (существующие):
| Файл | Что менять |
|---|---|
| `assets/js/tactical-pages.js` | Заменить `fetch()` на чтение из `window.TACTICAL_DATA`. Улучшить Markdown-рендерер. |
| `assets/css/style.css` | Добавить новые CSS-классы для улучшенного отображения тактического контента |
| `law.html` | Добавить `<script src="assets/js/tactical-data.js">` |
| `instruments.html` | Добавить `<script src="assets/js/tactical-data.js">` |
| `manual.html` | Добавить `<script src="assets/js/tactical-data.js">` |

### Файлы, которые ты ЧИТАЕШЬ (источники контента):
| Файл | Для какого раздела |
|---|---|
| `content/law/law-offer.md` | Нормативная аргументация |
| `content/tactical/instruments/manipulation.md` | Инструментарий — Манипуляция |
| `content/tactical/instruments/legending.md` | Инструментарий — Легендирование |
| `content/tactical/instruments/argumentation.md` | Инструментарий — Аргументация |
| `content/tactical/instruments/demand-setting.md` | Инструментарий — Выставление требования |
| `content/tactical/instruments/closing-summary.md` | Инструментарий — Подведение итогов |
| `content/tactical/manual/manual-flow.md` | Мануал |

---

## 3. Пошаговая инструкция

### ШАГ 1: Создай `assets/js/tactical-data.js`

1. Прочитай каждый `.md`-файл из таблицы выше.
2. Содержимое каждого файла сохрани как JavaScript-строку (используй template literals — обратные кавычки `` ` ``). Экранируй символы `` ` `` и `${` внутри контента, если они встретятся.
3. **НЕ СОКРАЩАЙ И НЕ РЕДАКТИРУЙ КОНТЕНТ**. 

**Структура файла:**
```javascript
window.TACTICAL_DATA = {
  law: { offer: \`...содержимое law-offer.md...\` },
  instruments: {
    manipulation: \`...содержимое manipulation.md...\`,
    legending: \`...содержимое legending.md...\`,
    argumentation: \`...содержимое argumentation.md...\`,
    demandSetting: \`...содержимое demand-setting.md...\`,
    closingSummary: \`...содержимое closing-summary.md...\`
  },
  manual: { flow: \`...содержимое manual-flow.md...\` }
};
```

### ШАГ 2: Обнови `law.html`, `instruments.html`, `manual.html`

В каждом файле вставь `<script src="assets/js/tactical-data.js?v=20260506"></script>` **ДО** `tactical-pages.js`. Не забудь обновить параметр `?v=` у `tactical-pages.js`.

### ШАГ 3: Перепиши `assets/js/tactical-pages.js`

1. **Замени `loadMarkdown()`**:
```javascript
function loadMarkdownSync(key) {
  const parts = key.split('.');
  let data = window.TACTICAL_DATA;
  for (const p of parts) {
    if (!data || typeof data !== 'object') return '';
    data = data[p];
  }
  return typeof data === 'string' ? data : '';
}
```
2. Удалите `async/await` из `initLawPage`, `initInstrumentsPage`, `initManualPage`.
3. Замените пути на ключи. Например, `loadMarkdownSync('instruments.manipulation')`.
4. **Улучши `markdownToSimpleHtml()`**:
   - Нумерованные списки (`1. Текст` → `<ol><li>Текст</li></ol>`).
   - Юникод-буллеты (`• Текст` или `o Текст` → `<li>Текст</li>`).
   - Разделители (`___` или `---` → `<hr class="tactical-hr">`).
   - Убери одинокие `*` и `#`, которые просвечивают как артефакты.

### ШАГ 4: Улучши CSS в `assets/css/style.css`

Добавь в конец файла следующие стили. Если такие правила (например, `.tactical-text-body`) уже есть, обнови их значения.

```css
/* ===== TACTICAL CONTENT TYPOGRAPHY IMPROVEMENTS ===== */
.tactical-text-body { 
  color: #b0bec5; font-size: 14px; line-height: 1.75; 
}
body.light-mode .tactical-text-body { color: #4a4a4a; }

.tactical-text-title { color: #e0e7ee; font-weight: 700; letter-spacing: -0.01em; }
body.light-mode .tactical-text-title { color: #1e293b; }

.tactical-text-body ol { margin: 8px 0 14px 24px; padding: 0; font-size: 14px; line-height: 1.75; }
.tactical-text-body ol li { margin: 6px 0; }

.tactical-hr { border: none; border-top: 1px solid #334155; margin: 20px 0; }
body.light-mode .tactical-hr { border-top: 1px solid #e4e4e7; }

.tactical-callout {
  border-left: 3px solid #f97316; padding: 10px 14px; margin: 10px 0;
  border-radius: 0 8px 8px 0; background: rgba(249, 115, 22, 0.06);
  font-style: italic; font-size: 13px; color: #94a3b8;
}
body.light-mode .tactical-callout { background: rgba(249, 115, 22, 0.04); color: #71717a; }

.law-details { transition: all 0.2s ease; }
.law-details[open] { border-color: #f97316; }
.law-details summary::-webkit-details-marker { color: #f97316; }
body.light-mode .law-details[open] { border-color: #ea580c; }

.instrument-card { border-radius: 14px; padding: 20px; margin-bottom: 16px; border: 1px solid #2d3748; background: rgba(15, 23, 42, 0.35); transition: border-color 0.2s; }
.instrument-card:hover { border-color: #475569; }
body.light-mode .instrument-card { background: #ffffff; border: 1px solid rgba(249, 115, 22, 0.1); }
body.light-mode .instrument-card:hover { border-color: rgba(249, 115, 22, 0.3); }

.manual-tile { text-align: left; cursor: pointer; border-radius: 12px; padding: 14px 16px; border: 1px solid #334155; background: rgba(15, 23, 42, 0.55); transition: all 0.2s ease; min-height: 70px; }
.manual-tile:hover { border-color: #475569; background: rgba(15, 23, 42, 0.7); }
.manual-tile.active { border-color: #f97316; background: rgba(249, 115, 22, 0.1); }
body.light-mode .manual-tile { border: 1px solid #e4e4e7; background: #ffffff; }
body.light-mode .manual-tile:hover { border-color: #d4d4d8; background: #fafafa; }
body.light-mode .manual-tile.active { border-color: #ea580c; background: rgba(249, 115, 22, 0.05); }

.manual-content-area { border: 1px solid #334155; border-radius: 12px; padding: 20px 24px; background: rgba(15, 23, 42, 0.3); min-height: 200px; }
body.light-mode .manual-content-area { border: 1px solid rgba(249, 115, 22, 0.12); background: #fdfaf6; }
```

### ШАГ 5: Верификация
1. Убедиться, что `law.html`, `instruments.html`, `manual.html` корректно отображают весь контент, а не «файл пуст».
2. Проверить переключение темной/светлой темы (тексты должны быть читаемы, шрифты и буллиты корректны).
3. Убедиться, что `analytics.html`, `rating.html`, `forecast.html` по-прежнему работают.
