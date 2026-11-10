"""Подключение к БД и описание таблиц."""
import os
from datetime import datetime

from sqlalchemy import (JSON, Boolean, Column, DateTime, Float, Integer, MetaData, String,
                        Table, Text, create_engine, inspect, text)

DATABASE_URL = os.getenv("DATABASE_URL", "")
engine = create_engine(DATABASE_URL, pool_pre_ping=True) if DATABASE_URL else None
metadata = MetaData()

# --- уже существующие таблицы (структура не менялась) ---
employee_scores = Table(
    "employee_scores", metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("employee_name", String(255), nullable=False),
    Column("month", String(50), nullable=False),
    Column("period", String(50), nullable=False),
    Column("tqs", Float, default=0.0),
    Column("aht", String(20), default="N/A"),
    Column("activity_count", Integer, default=0),
    Column("svp_scores", JSON, default=dict),
    Column("raw_scores", JSON, default=dict),
    Column("tendencies", String, default=""),
    Column("recommendations", String, default=""),
    Column("created_at", DateTime, default=datetime.utcnow),
    Column("updated_at", DateTime, default=datetime.utcnow, onupdate=datetime.utcnow),
)
employee_info = Table(
    "employees", metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("name", String(255), unique=True, nullable=False),
    Column("created_at", DateTime, default=datetime.utcnow),
)
collection_scores = Table(
    "collection_scores", metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("employee_name", String(255), nullable=False),
    Column("report_date", String(10), nullable=False),
    Column("month_label", String(50), nullable=False),
    Column("collected_amount", Float, nullable=True),   # накопленная с начала месяца; None, если в файле были только суммы за день
    Column("plan_amount", Float, default=0.0),
    Column("daily_amount", Float, nullable=True),     # сумма за один день, если в файле она была
    Column("created_at", DateTime, default=datetime.utcnow),
    Column("updated_at", DateTime, default=datetime.utcnow, onupdate=datetime.utcnow),
)
crm_actions = Table(
    "crm_actions", metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("employee_name", String(255), nullable=False),
    Column("month_label", String(50), nullable=False),
    Column("actions", JSON, default=dict),
    Column("total_actions", Integer, default=0),
    Column("created_at", DateTime, default=datetime.utcnow),
    Column("updated_at", DateTime, default=datetime.utcnow, onupdate=datetime.utcnow),
)

# --- новые таблицы ---
# каждый оценённый звонок отдельной строкой: из них считаются дни, недели и периоды
qc_calls = Table(
    "qc_calls", metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("employee_name", String(255), nullable=False, index=True),
    Column("call_date", String(10), nullable=False, index=True),   # YYYY-MM-DD
    Column("listen_date", String(10)),
    Column("client", String(50), default=""),
    Column("seq", Integer, default=0),                              # порядковый номер при одинаковых (оператор, дата, клиент)
    Column("call_type", String(20), default=""),
    Column("duration_min", Float, default=0.0),
    Column("scores", JSON, default=dict),
    Column("tqs", Float, default=0.0),
    Column("comment", Text, default=""),
    Column("source_file", String(255), default=""),
    Column("created_at", DateTime, default=datetime.utcnow),
    Column("updated_at", DateTime, default=datetime.utcnow, onupdate=datetime.utcnow),
)
# список сотрудников (источник правды по именам)
staff = Table(
    "staff", metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("name", String(255), unique=True, nullable=False),
    Column("active", Boolean, default=True),
    Column("created_at", DateTime, default=datetime.utcnow),
)
# «как написано в файле» -> «как у нас в списке»
name_aliases = Table(
    "name_aliases", metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("alias_key", String(255), unique=True, nullable=False),
    Column("canonical", String(255), nullable=False),
)
# пары, про которые тимлид сказал «это разные люди»
not_same = Table(
    "not_same", metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("name_a", String(255), nullable=False),
    Column("name_b", String(255), nullable=False),
)
upload_log = Table(
    "upload_log", metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("filename", String(255)),
    Column("kind", String(20)),
    Column("summary", JSON, default=dict),
    Column("created_at", DateTime, default=datetime.utcnow),
)


def init_db():
    if engine is None:
        return
    metadata.create_all(engine, checkfirst=True)
    # collection_scores.collected_amount раньше был обязательным, а daily_amount появился позже:
    # на уже существующей базе добавляем колонку и снимаем NOT NULL (на новой базе этого не требуется).
    insp = inspect(engine)
    cols = {c["name"]: c for c in insp.get_columns("collection_scores")}
    with engine.begin() as conn:
        if "daily_amount" not in cols:
            conn.execute(text("ALTER TABLE collection_scores ADD COLUMN daily_amount FLOAT"))
        if engine.dialect.name == "postgresql" and not cols["collected_amount"].get("nullable", True):
            conn.execute(text("ALTER TABLE collection_scores ALTER COLUMN collected_amount DROP NOT NULL"))


def check_db():
    if engine is None:
        return False, "not_configured"
    try:
        with engine.connect() as c:
            c.execute(text("SELECT 1"))
        return True, "connected"
    except Exception:
        return False, "error"
