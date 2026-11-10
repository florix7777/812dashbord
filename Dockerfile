# Dashboard SC - Frontend (nginx)
# Version: 1.4.0

FROM nginx:alpine

# nginx server-block (проксирует /api на backend, лимит загрузки 25 МБ)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Страницы, скрипты, стили, логотип
COPY *.html /usr/share/nginx/html/
COPY assets/ /usr/share/nginx/html/assets/
COPY logo/ /usr/share/nginx/html/logo/

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost/index.html || exit 1

CMD ["nginx", "-g", "daemon off;"]
