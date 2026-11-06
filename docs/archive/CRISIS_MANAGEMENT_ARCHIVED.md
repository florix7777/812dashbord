# 🚨 КРИЗИС-МЕНЕДЖМЕНТ ПЛАН — Dashboard QC

**Дата:** 15 апреля 2026
**Статус:** 🔴 АКТИВНЫЙ КРИЗИС
**Цель:** Доведение текущего проекта до полноценного рабочего вида

---

## 📌 СУТЬ КРИЗИСА

Проект Dashboard QC находится в **нерабочем состоянии** из-за 6 багов в работающей системе:

### Бэкенд РАБОТАЕТ (Up 44 часа), но с ошибками:

| # | Баг | Серьёзность | Симптомы | Файл для исправления |
|---|-----|------------|----------|---------------------|
| 1 | **PostgreSQL ROUND()** | 🟡 Средняя | Views не создаются при старте | `init_db.py` |
| 2 | **TypeError: list.__round__** | 🔴 Критическая | `/api/history/{name}` падает | `app.py:560` |
| 3 | **NameError: hist** | 🔴 Критическая | `/api/trends/forecast` падает | `app.py:706` |
| 4 | **NULL employee_name** | 🟡 Средняя | Парсер XLSX сохраняет NULL | `app.py` (parser) |
| 5 | **nginx rewrite cycle** | 🔴 Критическая | HTML → 500 error | `nginx.conf` |
| 6 | **Upstream timeout** | 🟠间歇ная | API → 504 Gateway | Бэкенд перегружен |

### Bind Mounts (источники файлов):
- **Backend:** `C:\Users\user\AppData\Local\Programs\Microsoft VS Code\Dashboard_QC\backend` → `/app` (НЕ существует!)
- **Nginx:** `C:\Users\user\AppData\Local\Programs\Microsoft VS Code` → `/usr/share/nginx/html`
- **Nginx config:** `C:\Users\user\AppData\Local\Programs\Microsoft VS Code\Dashboard_QC\nginx.conf` → `/etc/nginx/nginx.conf`
- **Reports:** `C:\Users\user\AppData\Local\Programs\Microsoft VS Code\Dashboard_QC\reports` → `/app/reports`
- **index.html:** `C:\Users\user\AppData\Local\Programs\Microsoft VS Code\index.html` → `/app/index.html`

### Корневая проблема
**Пути bind mounts указывают на несуществующие директории.** Docker создаёт пустые папки при старте.
Бэкенд файлы ВНУТРИ контейнера ЕСТЬ, но mount их перезаписывает пустыми директориями при рестарте.

---

## 🎯 ПРИОРИТЕТЫ (по убыванию)

### P0 — КРИТИЧЕСКИЕ (без этого проект мёртв)
1. **Восстановить бэкенд** — FastAPI API на порту 8000
2. **Исправить nginx** — proxy pass + static files
3. **Проверить PostgreSQL** — данные + подключение

### P1 — ФУНКЦИОНАЛЬНЫЕ (без этого проект неполноценен)
4. **Синхронизировать данные** — парсер → API → HTML
5. **Исправить SVP Heatmap** — динамическая работа с фильтрами
6. **Исправить тултипы** — позиционирование при скролле

### P2 — ПОЛИРУЮЩИЕ (улучшения)
7. **Release banners** — версионирование в UI
8. **Growth Zone Table** — для тимлидов
9. **Objection Toolkit** — B2C/B2B режим
10. **CSS улучшения** — glassmorphism, CSS vars

---

## 🔧 КРИЗИС-ШАГИ (последовательность)

### ШАГ 0: СОХРАНЕНИЕ ТЕКУЩЕГО СОСТОЯНИЯ (КРИТИЧЕСКИ ВАЖНО!)

**ПРЕЖДЕ чем что-либо менять — извлечь файлы из контейнеров!**

```bash
# Остановить контейнеры (чтобы не было конфликта mounts)
docker stop qc_backend qc_nginx

# Извлечь файлы бэкенда из контейнера
docker cp qc_backend:/app/app.py "D:\Doc\QC\Dashboard_QC\recovered_app.py"
docker cp qc_backend:/app/init_db.py "D:\Doc\QC\Dashboard_QC\recovered_init_db.py"
docker cp qc_backend:/app/requirements.txt "D:\Doc\QC\Dashboard_QC\recovered_requirements.txt"

# Извлечь nginx конфиг
docker cp qc_nginx:/etc/nginx/nginx.conf "D:\Doc\QC\Dashboard_QC\recovered_nginx.conf"
docker cp qc_nginx:/etc/nginx/conf.d/default.conf "D:\Doc\QC\Dashboard_QC\recovered_nginx_default.conf"

# Создать правильные директории для bind mounts
mkdir -p "C:\Users\user\AppData\Local\Programs\Microsoft VS Code\Dashboard_QC\backend"
mkdir -p "C:\Users\user\AppData\Local\Programs\Microsoft VS Code\Dashboard_QC\reports"

# Скопировать файлы в правильные места
copy "D:\Doc\QC\Dashboard_QC\recovered_app.py" "C:\Users\user\AppData\Local\Programs\Microsoft VS Code\Dashboard_QC\backend\app.py"
copy "D:\Doc\QC\Dashboard_QC\recovered_init_db.py" "C:\Users\user\AppData\Local\Programs\Microsoft VS Code\Dashboard_QC\backend\init_db.py"
copy "D:\Doc\QC\Dashboard_QC\recovered_requirements.txt" "C:\Users\user\AppData\Local\Programs\Microsoft VS Code\Dashboard_QC\backend\requirements.txt"
```

### ШАГ 1: Исправление багов бэкенда

#### Баг 1: PostgreSQL ROUND() в init_db.py
```python
# БЫЛО (ошибка):
ROUND(AVG(tqs), 4)

# СТАЛО (исправление):
ROUND(CAST(AVG(tqs) AS NUMERIC), 4)
```

#### Баг 2: TypeError list.__round__ в app.py:560
```python
# БЫЛО (ошибка):
"scores": {k: round(v, 4) for k, v in (s.scores or {}).items()}

# СТАЛО (исправление):
"scores": {k: (round(v, 4) if isinstance(v, (int, float)) else v) for k, v in (s.scores or {}).items()}
```

#### Баг 3: NameError: hist в app.py:706
```python
# БЫЛО (ошибка):
current_tqs = hist[-1]["tqs"] if hist else 0  # hist не определён

# СТАЛО (исправление):
hist = get_employee_history(name)  # определить hist ПЕРЕД использованием
current_tqs = hist[-1]["tqs"] if hist else 0
```

#### Баг 4: NULL employee_name в парсере
```python
# Добавить проверку перед INSERT:
if employee_name and employee_name.strip():
    # INSERT/UPDATE
else:
    logger.warning(f"Пропущена строка с NULL именем: {row}")
    continue
```

### ШАГ 2: Исправление nginx

#### Баг 5: Rewrite cycle
```nginx
# БЫЛО (ошибка):
try_files $uri $uri/ /index.html;

# СТАЛО (исправление):
location / {
    root /usr/share/nginx/html;
    try_files $uri $uri.html $uri/ =404;
}

location /api/ {
    proxy_pass http://backend:8000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

### ШАГ 3: Перезапуск с правильными файлами

```bash
# Создать правильную структуру директорий
mkdir -p "C:\Users\user\AppData\Local\Programs\Microsoft VS Code\Dashboard_QC\backend"

# Запустить контейнеры заново
docker-compose -f D:\Doc\QC\Dashboard_QC\docker-compose.yml down
docker-compose -f D:\Doc\QC\Dashboard_QC\docker-compose.yml up -d

# Проверить
docker ps -a
docker logs qc_backend --tail 30
docker logs qc_nginx --tail 20
```

### ШАГ 4: Энд-ту-энд тест
```bash
# Health check
curl http://localhost:8000/api/health

# Получить сотрудников
curl http://localhost:8000/api/employees

# Проверить страницу
curl http://localhost/summary.html
```

---

## 📊 КАРТА ЗАВИСИМОСТЕЙ

```
[nginx:80] ──proxy──→ [backend:8000] ──connect──→ [postgres:5432]
     ↑                      ↑
     │                      │
static files          парсер xlsx/pdf
                      API responses
```

**Точка отказа:** backend (если падает → всё ломается)

---

## ⏱️ КРИТЕРИИ ВЫХОДА ИЗ КРИЗИСА

- [ ] `curl http://localhost:8000/api/health` → `{"status": "ok"}`
- [ ] `curl http://localhost:8000/api/employees` → JSON массив сотрудников
- [ ] `curl http://localhost/summary.html` → 200 OK, HTML загружается
- [ ] `curl http://localhost/heatmap.html` → 200 OK, данные с API
- [ ] `docker ps` → все 3 контейнера Up + healthy
- [ ] Данные актуальны (включая Апрель 2026)

---

## 🛡️ ИММУНИТЕТ К ПОЛОМКАМ

### Правила фиксации:
1. **Перед каждым изменением** → `docker save dashboard_qc-backend > backup.tar`
2. **После каждого изменения** → тест всех эндпоинтов
3. **При неудаче** → `docker load < backup.tar && docker restart`
4. **Файлы HTML** → копировать в `backups/` перед правкой
5. **Команда "зафиксируй"** → создаёт backup + тег + запись в VERSION_HISTORY.md

---

*Документ обновляется при каждом шаге кризис-менеджмента.*
