# Запуск на сервере (Ubuntu 24.04, Docker уже установлен)

Старый проект на порту 80 не трогаем. Наш сайт будет на `http://IP-СЕРВЕРА:8080`.

## 1. Положить проект на сервер
```bash
# вариант А: из GitHub (приватный репозиторий потребует логин и токен)
cd /opt && git clone <ссылка-на-репозиторий> dashboard && cd dashboard

# вариант Б: архивом с вашего компьютера
scp dashboard_sc_v1.4.0.zip root@IP-СЕРВЕРА:/opt/
ssh root@IP-СЕРВЕРА
cd /opt && apt-get install -y unzip && unzip dashboard_sc_v1.4.0.zip -d dashboard && cd dashboard
```

## 2. Настройки и запуск
```bash
docker compose version                     # должен ответить версией
cp .env.example .env
nano .env                                  # заменить POSTGRES_PASSWORD на длинный пароль
                                           # (придумать можно так: openssl rand -hex 16)
mkdir -p reports
docker compose up -d --build
docker compose ps                          # backend, postgres, nginx: Up / healthy
```

## 3. Первая загрузка данных (происходит сама)
В папке `initial_data/` лежат отчёты за май–октябрь. При первом запуске на пустой базе backend сам загружает их в фоне, это занимает 1–2 минуты.
```bash
docker compose logs -f backend             # строки «OK ...» по каждому файлу; выйти: Ctrl+C
curl http://localhost:8080/api/status      # сколько звонков загружено
```
Потом откройте `http://IP-СЕРВЕРА:8080`. Если порт закрыт фаерволом: `ufw status`, затем `ufw allow 8080/tcp`.

Дальше тимлиды грузят новые файлы сами кнопкой «Загрузить отчёт».

## 4. После первой загрузки уберите отчёты из репозитория
Данные теперь в базе, а в `initial_data/` лежат настоящие ФИО и баллы. Репозиторий должен быть приватным, а папку лучше удалить из него:
```bash
git rm -r initial_data && git commit -m "remove initial data" && git push
```
Повторный импорт при перезапуске не происходит: backend загружает файлы только если база пустая.

## Обновление проекта
```bash
cd /opt/dashboard && git pull && docker compose up -d --build
```
Базу это не стирает. Не выполняйте `docker compose down -v`: флаг `-v` удаляет базу.

## Резервная копия базы (раз в день, в cron)
```bash
docker exec qc_postgres pg_dump -U qc_user qc_dashboard | gzip > /opt/backup_$(date +%F).sql.gz
```

## Загрузить файлы вручную из папки (если нужно)
```bash
docker compose exec backend python importer.py /app/initial_data
```
Повторная загрузка безопасна: записи обновляются, а не дублируются.

## Пароль на сайт
Сейчас пароля нет: сайт открыт всем, кто знает адрес и порт, и любой может смотреть данные и загружать файлы. Чтобы включить пароль:
1. Создайте файл с логином и паролем: `printf 'teamlead:%s\n' "$(openssl passwd -apr1 'ПАРОЛЬ')" > .htpasswd`
2. В `nginx.conf` уберите `#` перед двумя строками `auth_basic`.
3. В `Dockerfile` добавьте строку `COPY .htpasswd /etc/nginx/.htpasswd` (после строки с `nginx.conf`).
4. `docker compose up -d --build`. После этого проверка здоровья nginx в Docker покажет unhealthy, это не мешает работе.

Без домена нет https, поэтому пароль на сайт передаётся открытым текстом. Позже лучше купить домен.
