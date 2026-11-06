# Dashboard SC

Аналитический dashboard для контроля качества звонков (Soft Collection Unit).

## Текущий статус

**Релиз:** `v1.3.4` (UI Accessibility & Contrast Enhancements)  
**Режим данных:** Static Mode (Переходный период)

Фронтенд читает данные из `assets/js/data.js`. При этом бэкенд и база данных работают в теневом режиме, накапливая историю (при `ENABLE_BACKEND_SYNC=1`). Переход на полный API Mode планируется в будущем.

**Тактические страницы:**
- ✅ Нормативная аргументация — JSON формат, табы, аккордеон, поиск
- ✅ Инструментарий — JSON формат, 5 инструментов, цветовая кодировка
- ✅ Мануал — JSON формат, 5 разделов, 26 тем, боковая панель

## Быстрый старт (Docker)

### Требования

- Docker + Docker Compose
- Python 3.11+ (для локальных скриптов)

### Запуск

```bash
# 1. Клонировать репозиторий
git clone <repository-url>
cd Dashboard_SC

# 2. Создать .env из примера
cp .env.example .env

# 3. Отредактировать .env (при необходимости изменить пароли)
nano .env

# 4. Запустить проект
docker compose up -d --build
```

### Проверка

```bash
docker compose ps
```

### Доступ

- Frontend: `http://localhost/`
- API health: `http://localhost:8000/api/health`
- API metrics: `http://localhost:8000/api/metrics`

### Остановка

```bash
docker compose down
```

## Структура

- **Frontend**: `*.html`, `assets/`
- **Backend**: `backend/` (FastAPI + PostgreSQL)
- **Infrastructure**: `docker-compose.yml`, `nginx.conf`
- **Data update scripts**: `auto_updater.py` и вспомогательные `*.py`
- **Reports mount dir**: `reports/`
- **Tactical content source**: `content/` (см. `content/CONTENT_SUBMISSION.md`)
- **Scripts**: `scripts/` (вспомогательные скрипты)

## Конфигурация

### Переменные окружения (.env)

| Переменная | Описание | Пример |
|------------|----------|--------|
| `POSTGRES_USER` | Пользователь PostgreSQL | `qc_user` |
| `POSTGRES_PASSWORD` | Пароль PostgreSQL | `change_me` |
| `POSTGRES_DB` | Имя базы данных | `qc_dashboard` |
| `DATABASE_URL` | URL подключения к БД | `postgresql+psycopg2://...` |
| `DATA_MODE` | Режим данных: `api` или `static` | `static` |
| `ENABLE_BACKEND_SYNC` | Включить параллельную запись в PostgreSQL | `1` |

См. `.env.example` для полного списка.

## Режимы работы

| Параметр | Static Mode (текущий) | API Mode (целевой) |
|----------|----------------------|-------------------|
| `DATA_MODE` | `static` | `api` |
| Источник данных фронта | `assets/js/data.js` | `/api/metrics` |
| `auto_updater.py` | обновляет `data.js` + пишет в БД | пишет только в БД |
| `ENABLE_BACKEND_SYNC`| `1` (рекомендуется) | `1` (обязательно) |

## Обновление данных (Static Mode)

### Автоматическое/Ручное обновление

`auto_updater.py` следит за папкой `reports/` и автоматически обрабатывает новые/измененные файлы:

```bash
python auto_updater.py
```

### Обновление через API [ПЛАНИРУЕТСЯ]

Загрузка через API временно недоступна для полного цикла (сохраняет, но не парсит).
Будет реализовано в API Mode:

```bash
# Пример: Загрузить XLSX
curl -X POST -F "file=@reports/Quality_01.04.2026.xlsx" http://localhost:8000/api/upload/xlsx
```

## Backend API

### Основные endpoints

| Endpoint | Метод | Описание |
|----------|-------|----------|
| `/api/health` | GET | Проверка состояния |
| `/api/metrics` | GET | Все данные dashboard |
| `/api/employees` | GET | Список сотрудников |
| `/api/history/{name}` | GET | История сотрудника |
| `/api/upload/xlsx` | POST | Загрузка XLSX |
| `/api/upload/pdf` | POST | Загрузка PDF |

Подробная документация API доступна по адресу: `http://localhost:8000/docs`

## Автоматические проверки качества и безопасности

Добавлен CI workflow: `.github/workflows/quality-and-security.yml`

Проверки:

- синтаксис Python (`compileall`);
- smoke-тесты backend API (`tests/test_backend_smoke.py`);
- security-скан backend (`bandit -r backend`);
- baseline-check фронтенд-безопасности (`scripts/check_frontend_security.py`);
- валидация `docker compose config`.

## Тактические страницы

Интеграция и интерактивный рендер выполнены для страниц:

- `law.html`
- `instruments.html`
- `manual.html`

Рендер выполнен через изолированный модуль `assets/js/tactical-pages.js`, чтобы не затрагивать рабочие аналитические функции.

Для наполнения контентом используйте Markdown-шаблоны:

- `content/CONTENT_SUBMISSION.md`

## Документация

- **RUNBOOK.md** - операционная документация (запуск, обслуживание, диагностика)
- **STABILIZATION_PLAN.md** - план стабилизации проекта
- **docs/archive/CURRENT_STATE.md** - текущее состояние проекта

## Важно

- Репозиторий настроен как самодостаточный: backend находится внутри проекта.
- Для локальных нестандартных путей можно использовать переменные:
  - `BACKEND_CONTEXT`
  - `BACKEND_SOURCE`
  - `REPORTS_SOURCE`
- Не коммитьте реальные отчеты/персональные данные в репозиторий.
