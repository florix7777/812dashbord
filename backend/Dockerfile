FROM python:3.12-slim
WORKDIR /app
# curl нужен для healthcheck в docker-compose
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
# в compose папка backend монтируется в /app, поэтому код подхватывается без пересборки
COPY . .
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
