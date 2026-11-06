# 🤖 AGENT BRIEF — Dashboard QC

> ВНИМАНИЕ: этот brief частично устарел и служит как исторический контекст.
> Перед любыми действиями сверяйтесь с `CURRENT_STATE.md` и `README.md`.

**Дата создания:** 15 апреля 2026
**Версия:** 1.0
**Обновлять:** при каждой фиксации

---

## ⚡ КРАТКАЯ СУТЬ (прочитай ПЕРВЫМ)

Проект Dashboard QC — многостраничный аналитический сервис для Team Leads Quality Control.
**Текущий статус:** � ВОССТАНОВЛЕНО — backend работает, nginx исправлен, PostgreSQL запущен на правильной версии.

**Что сделано:** Исправлен `docker-compose.yml`, обновлён `nginx.conf`, восстановлен `qc_backend`, решён конфликт PostgreSQL 16.

**Что дальше:** поддерживать стабильность, синхронизировать данные, завершить многостраничную версию и документировать изменения.

---

## 📁 КЛЮЧЕВЫЕ ПУТИ

| Что | Путь |
|-----|------|
| **Рабочая папка** | `d:\Doc\Doc\Doc\Оценка качества звонков\Отчеты\Итоговый отчет\Dashboard_SC\` |
| **Эталон (v1.2.0)** | `D:\Doc\QC\Dashboard_QC\` |
| **ТЗ v1.2.2** | `Dashboard_SC\ТЗ на разработку Dashboard.md` |
| **Статус проекта** | `Dashboard_SC\PROJECT_STATUS.md` |
| **Кризис-план** | `Dashboard_SC\CRISIS_MANAGEMENT.md` |
| **Генеральный план** | `Dashboard_SC\GENERAL_PLAN.md` |
| **Правила проекта** | `Dashboard_SC\skill.md` |
| **Reports (xlsx+pdf)** | `Dashboard_SC\` (корневая папка) |
| **Docker контейнеры** | `qc_backend`, `qc_nginx`, `qc_postgres` |

---

## 🏗️ АРХИТЕКТУРА

```
nginx:80 → backend:8000 (FastAPI) → postgres:5432
```

**15 API эндпоинтов:** `/api/health`, `/api/employees`, `/api/leaderboard`, `/api/history/{name}`, `/api/trends`, `/api/trends/forecast`, и др.

**21 HTML страница:** index, summary, heatmap, analytics, employees, settings, tools/*, regulations/*

---

## 🔴 ТЕКУЩИЕ ПРОБЛЕМЫ (6 багов в работающей системе)

**Бэкенд РАБОТАЕТ** (Up 44 часа), но с ошибками:

| # | Баг | Файл | Строка | Исправление |
|---|-----|------|--------|-------------|
| 1 | PostgreSQL ROUND() не работает | `init_db.py` | SQL views | `ROUND(CAST(AVG(tqs) AS NUMERIC), 4)` |
| 2 | TypeError: list.__round__ | `app.py` | ~560 | Проверка `isinstance(v, (int, float))` |
| 3 | NameError: hist not defined | `app.py` | ~706 | Определить `hist` перед использованием |
| 4 | NULL employee_name в XLSX | `app.py` | parser | Пропускать строки с NULL именем |
| 5 | nginx rewrite cycle → 500 | `nginx.conf` | try_files | `try_files $uri $uri.html $uri/ =404` |
| 6 | Upstream timeout → 504 | Бэкенд | — | Перегрузка, оптимизировать запросы |

### Bind Mounts проблема:
Пути bind mounts указывают на **несуществующие директории**:
- `C:\Users\user\AppData\Local\Programs\Microsoft VS Code\Dashboard_QC\backend` → НЕ существует!
- Docker создаёт пустые папки при старте, перезаписывая файлы в контейнере

### ВАЖНО:
Файлы `app.py`, `init_db.py`, `requirements.txt` ЕСТЬ внутри контейнера `qc_backend`.
НО при рестарте они будут перезаписаны пустыми директориями из-за bind mount!
**ПЕРЕД рестартом — извлечь файлы через `docker cp`!**

---

## 📊 ДАННЫЕ

### XLSX: 10 файлов (Февраль–Апрель 2026)
### PDF: 11 файлов (Февраль–Апрель 2026)
### Сотрудники: ~28 человек (маппинг латиница→кириллица)

### Структура данных (Dashboard_SC):
```javascript
{
  "ФИО": {
    "months": {
      "Февраль 2026": {
        "periods": [
          { "period": "01-08", "tqs": 83, "aht": "02:35:00", 
            "svp": {"Приветствие": 1.0, "Этика": 0.5, ...},
            "tendencies": "...", "rec": "..." }
        ]
      }
    }
  }
}
```

### SVP ключи (кириллица):
Приветствие, Этика, CRM, Легенда, Задолж., Аргумент., Манипул., Требования, Итоги

### Алгоритм диагнозов (7 уровней):
| % | Цвет | Статус |
|---|------|--------|
| 0–24% | 🔴 | Несоответствие СВП |
| 25–49% | 🟠 | Критическая просадка |
| 50–64% | 🟡 тёмный | Систематическая недоработка |
| 65–74% | 🟡 светлый | Недоработка |
| 75–84% | 🔵 | Нестабильная отработка |
| 85–99% | 🟢 | Требует внимания |
| 100% | 🟢 насыщенный | Полное соответствие |

---

## 🔧 ПРАВИЛА РАБОТЫ

### ЗАПРЕЩЕНО
- ❌ Переписывать `index.html` целиком (файл 400Кб)
- ❌ Удалять/ломать статические тексты регламентов
- ❌ Выдумывать данные при подсчётах
- ❌ Допускать эффект "одно лечим — другое калечим"

### ОБЯЗАТЕЛЬНО
- ✅ Менять данные только между маркерами `// --- DATA START ---` и `// --- DATA END ---`
- ✅ Backup перед каждым изменением
- ✅ Тестировать после каждого изменения
- ✅ Обновлять документы при фиксации

### Команда "зафиксируй"
1. Backup файлов в `backups/snapshot_YYYYMMDD_HHMMSS/`
2. Обновить `PROJECT_STATUS.md`
3. Обновить `VERSION_HISTORY.md`
4. Git commit + tag
5. Push в GitHub

---

## 🐳 DOCKER КОМАНДЫ

```bash
# Проверить статус
docker ps -a

# Логи контейнеров
docker logs qc_backend --tail 50
docker logs qc_nginx --tail 20
docker logs qc_postgres --tail 20

# Перезапуск
docker restart qc_backend
docker restart qc_nginx

# Подключение к БД
docker exec -it qc_postgres psql -U postgres -d dashboard_qc

# Исследование бэкенда
docker exec qc_backend ls -la /app/
docker exec qc_backend find / -name "app.py" 2>/dev/null

# Тест API
curl http://localhost:8000/api/health
curl http://localhost:8000/api/employees

# Тест страниц
curl http://localhost/summary.html
curl http://localhost/heatmap.html
```

---

## 📋 ПРИОРИТЕТЫ ДЕЙСТВИЙ

1. **P0:** Восстановить бэкенд (app.py + init_db.py)
2. **P0:** Исправить nginx.conf
3. **P0:** Проверить PostgreSQL данные
4. **P1:** Синхронизировать парсер с БД
5. **P1:** Исправить SVP Heatmap (динамика + алгоритм)
6. **P1:** Исправить графики (последовательность + фильтрация)
7. **P2:** Release banners, Growth Zone, Objection Toolkit
8. **P2:** Многостраничность (21 страница)
9. **P2:** Финализация + push в GitHub

---

## 📦 ЗАВИСИМОСТИ (Python)

```
fastapi
uvicorn[standard]
psycopg2-binary
pandas
openpyxl
pdfplumber
watchdog
pydantic
```

---

## 🔑 КЛЮЧЕВЫЕ ФАКТЫ

- **Название:** Dashboard QC v1.2.2
- **Отдел:** Quality Control, Soft Collection Unit, Variant Retail Finance
- **Метрики:** TQS (0-100%), AHT (MM:SS), СВП (9 критериев с весами)
- **Источники:** xlsx (оценки) + pdf (рекомендации)
- **Парсер:** watchdog (real-time) в Dashboard_SC, batch в Dashboard_QC
- **Дизайн:** Dashboard_SC нравится пользователю, Dashboard_QC функционально богаче
- **Цель:** Объединить лучшее из обоих, исправить неработающее

---

## ⚠️ ПРИ СМЕНЕ АГЕНТА

1. Прочитать этот файл
2. Прочитать `PROJECT_STATUS.md`
3. Прочитать `CRISIS_MANAGEMENT.md`
4. Прочитать `GENERAL_PLAN.md`
5. Прочитать `skill.md`
6. Проверить `docker ps -a`
7. Начать с ФАЗЫ 0 кризис-плана

---

*Этот документ ОБНОВЛЯЕТСЯ при каждой фиксации. Всегда читай последнюю версию.*
*Последнее обновление: 15 апреля 2026*
