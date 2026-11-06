# Contributing Guidelines

Руководство по внесению изменений в проект QC Dashboard v1.1.

## Быстрая навигация

- [Запуск проекта локально](#запуск-проекта-локально)
- [Проверка изменений](#проверка-изменений)
- [Структура проекта](#структура-проекта)
- [Правила коммитов](#правила-коммитов)
- [Что нельзя коммитить](#что-нельзя-коммитить)

## Запуск проекта локально

### Требования

- Docker и Docker Compose
- Python 3.11+
- Git

### Установка

```bash
# 1. Клонировать репозиторий
git clone <repository-url>
cd Dashboard_SC

# 2. Создать .env из примера
cp .env.example .env

# 3. Запустить проект
docker compose up -d --build

# 4. Проверить статус
docker compose ps
```

### Запуск проверок локально

```bash
# Проверка синтаксиса Python
python -m compileall backend/app.py auto_updater.py scripts/build_tactical_data.py

# Запуск тестов
pytest -q tests/test_backend_smoke.py

# Валидация docker-compose
docker compose config

# Проверка безопасности backend
pip install bandit
bandit -r backend/
```

## Проверка изменений

Перед созданием pull request убедитесь, что:

1. **Все тесты проходят:**
   ```bash
   pytest -q tests/test_backend_smoke.py
   ```

2. **Синтаксис Python корректен:**
   ```bash
   python -m compileall backend/app.py auto_updater.py scripts/build_tactical_data.py
   ```

3. **Docker Compose валиден:**
   ```bash
   docker compose config
   ```

4. **Проект запускается:**
   ```bash
   docker compose down
   docker compose up -d --build
   # Проверить http://localhost/ и http://localhost:8000/api/health
   ```

## Структура проекта

```
Dashboard_SC/
├── backend/           # FastAPI backend
│   ├── app.py        # Основное приложение
│   ├── Dockerfile    # Docker образ backend
│   └── requirements.txt
├── assets/           # Фронтенд ресурсы
│   ├── css/          # Стили
│   └── js/           # Скрипты и данные
├── content/          # Markdown контент
│   ├── law/          # Законодательные документы
│   ├── reglament/    # Регламенты
│   └── tactical/     # Тактические материалы
├── scripts/          # Вспомогательные скрипты
│   ├── build_tactical_data.py
│   └── check_frontend_security.py
├── tests/            # Тесты
│   └── test_backend_smoke.py
├── reports/          # Папка для отчетов (не коммитить!)
├── docker-compose.yml
├── Dockerfile        # Frontend (nginx)
├── auto_updater.py   # Скрипт обновления данных
├── .env.example      # Пример конфигурации
├── README.md         # Основная документация
├── RUNBOOK.md        # Операционная документация
└── CONTRIBUTING.md   # Это руководство
```

## Правила коммитов

### Формат сообщений

Используйте понятные сообщения на русском или английском:

```
feat: добавить новый endpoint для экспорта данных
fix: исправить ошибку парсинга XLSX
docs: обновить документацию API
refactor: упростить логику обработки данных
test: добавить тесты для /api/metrics
```

### Перед коммитом

1. Убедитесь, что код отформатирован
2. Проверьте, что нет лишних файлов (см. ниже)
3. Запустите тесты

## Что нельзя коммитить

### Категорически запрещено

1. **Секреты и пароли:**
   - Пароли от баз данных
   - API ключи
   - Токены доступа
   - Личные данные

2. **Отчеты и персональные данные:**
   - Файлы `reports/*.xlsx`
   - Файлы `reports/*.pdf`
   - Любые файлы с именами сотрудников

3. **Файл .env:**
   - Никогда не коммитьте `.env`
   - Используйте `.env.example` для примеров

4. **Временные файлы:**
   - `__pycache__/`
   - `*.pyc`
   - `.DS_Store`
   - `*.log`

### Если секрет попал в репозиторий

1. **Немедленно отзовите секрет** (revoke token/пароль)
2. Удалите секрет из истории git:
   ```bash
   # Использовать git filter-repo или BFG
   git filter-repo --force --invert-regex --password 'секрет'
   ```
3. Принудительно обновите репозиторий:
   ```bash
   git push --force
   ```
4. Уведомите всех пользователей о необходимости переклонировать репозиторий

## Обновление тактического контента

Если вы изменили markdown файлы在 `content/`, нужно перегенерировать `tactical-data.js`:

```bash
python scripts/build_tactical_data.py
git add assets/js/tactical-data.js
git commit -m "chore: обновить tactical-data.js"
```

## Режимы данных

Проект поддерживает два режима:

1. **API Mode** (текущий) - данные в PostgreSQL, фронтенд читает из API
2. **Static Mode** - данные в `assets/js/data.js`

При внесении изменений учитывайте текущий режим (указан в `.env` и `README.md`).

## Вопросы?

- Прочитайте [RUNBOOK.md](RUNBOOK.md) для операционных вопросов
- Проверьте [README.md](README.md) для общей информации
- Изучите [STABILIZATION_PLAN.md](STABILIZATION_PLAN.md) для понимания архитектуры

## Процесс ревью

1. Все PR должны проходить CI проверки
2. Минимум один аппрув от maintainer
3. Все комментарии должны бытьresolved перед мерджем
4. После мерджа удалите ветку (если это feature branch)