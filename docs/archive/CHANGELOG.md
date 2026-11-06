# Changelog

Все значимые технические изменения по стабилизации проекта фиксируются здесь.

## 2026-05-06

### 1) Tactical restoration plan закрыт (v1.3.1)
- Выполнен переход тактических страниц на встроенные данные:
  - добавлен `assets/js/tactical-data.js` (источник контента из `content/.../*.md`);
  - отключена загрузка через `fetch()` в `assets/js/tactical-pages.js`.
- Обновлены страницы подключения:
  - `law.html`
  - `instruments.html`
  - `manual.html`
  - подключён `tactical-data.js` перед `tactical-pages.js`, обновлены cache-buster версии.

### 2) Улучшен markdown-рендер тактических материалов
- Добавлена синхронная загрузка данных по ключам `window.TACTICAL_DATA`.
- Расширен рендер:
  - нумерованные списки, unicode-буллеты, разделители;
  - зачёркнутый текст `~~...~~`;
  - автоссылки для голых URL;
  - замена табуляции на визуальный отступ;
  - глобальная очистка экранирующих `\` перед спецсимволами.
- Дополнительно очищены артефакты (`####`, экранированные линии `_..._`) в тактическом UI.

### 3) Обновлён UI сайдбара и темы
- В `assets/js/sidebar.js`:
  - убраны бейджи `Новый` у `Нормат. аргументация`, `Инструментарий`, `Мануал`;
  - заголовок `ТАКТИЧЕСКИЕ ИНСТРУМЕНТЫ` приведён к стилю section-title.
- В `assets/css/style.css`:
  - отключено подчёркивание ссылок у `.nav-item` (включая hover/active);
  - добавлены/актуализированы классы тактической типографики и карточек (`.tactical-hr`, `.tactical-callout`, `.law-details`, `.instrument-card`, `.manual-tile`, `.manual-content-area`).
- В `assets/js/app.js` и `assets/js/core.js`:
  - заменены emoji-иконки темы на единый SVG-комплект (light/dark).

## 2026-04-29

### 1) Tactical content integration завершена
- Подключен и структурирован пользовательский контент в:
  - `content/tactical/instruments/*.md`
  - `content/tactical/manual/manual-flow.md`
- Тактические страницы переведены из каркаса в рабочий формат knowledge base.

### 2) Обновлен модуль рендера тактических страниц
- `assets/js/tactical-pages.js` переработан под интерактивный UX:
  - карточная навигация по темам/подтемам;
  - постраничный просмотр больших материалов;
  - быстрые переходы по темам (dropdown);
  - рендер markdown-таблиц;
  - полнотекстовый поиск по инструментам.

### 3) Manual section upgraded
- В `manual.html` секция "Граф процесса" переведена в формат интерактивных плиток тем.
- В "Описание шага" добавлен вывод полноценного контента темы с пагинацией.
- Секция "Полный мануал по темам" реализована как "одна тема на страницу" с навигацией.

### 4) Text quality hardening
- Добавлена очистка артефактов/битых символов в рендере тактического контента.
- Устранены проблемы кодировки, вызывавшие нечитабельный текст в UI.

## 2026-04-23

### 1) Репозиторий самодостаточный
- `docker-compose.yml` переведен на локальные пути backend/reports по умолчанию.
- Добавлен локальный backend-контур: `backend/app.py`, `backend/Dockerfile`, `backend/requirements.txt`.
- Добавлена папка `reports/` для стабильного bind-mount.

### 2) Унификация документации и архитектуры
- Добавлен единый источник правды: `CURRENT_STATE.md`.
- Добавлен актуальный `README.md` с рабочим запуском.
- В исторических документах добавлены дисклеймеры и ссылка на `CURRENT_STATE.md`:
  - `PROJECT_STATUS.md`
  - `GENERAL_PLAN.md`
  - `FINAL_REPORT.md`
  - `AGENT_BRIEF.md`

### 3) Автопроверки качества и безопасности
- Добавлены backend smoke-тесты: `tests/test_backend_smoke.py`.
- Добавлен CI workflow: `.github/workflows/quality-and-security.yml`.
- В CI включены syntax check, smoke tests, Bandit scan, проверка `docker compose config`.

### 4) Hardening-пакет
- В CI закреплены версии инструментов: `pytest==9.0.3`, `bandit==1.9.4`.
- Добавлена baseline-проверка фронтенд-безопасности:
  - `security/frontend-security-baseline.json`
  - `scripts/check_frontend_security.py`

### 5) Тактические разделы: каркас + sidebar
- Добавлен изолированный модуль `assets/js/tactical-pages.js` для страниц:
  - `law.html`
  - `instruments.html`
  - `manual.html`
- Добавлены каркасы страниц с безопасными fallback-сценариями при пустом контенте.
- Sidebar переведен на SVG-иконки в минималистичном стиле, выровнен compact-режим.
- Добавлена инструкция по передаче контента: `content/CONTENT_SUBMISSION.md`.
