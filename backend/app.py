"""Dashboard SC backend: API + разбор загружаемых Excel/PDF."""
import datetime as dt
import os
import sys
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi import Body, FastAPI, File, Form, HTTPException, Query, UploadFile  # noqa: E402
from fastapi.concurrency import run_in_threadpool  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import JSONResponse  # noqa: E402
from pydantic import BaseModel  # noqa: E402
from sqlalchemy import select  # noqa: E402
from sqlalchemy.exc import IntegrityError, SQLAlchemyError  # noqa: E402

import db  # noqa: E402
import parsing as P  # noqa: E402
import store  # noqa: E402
from db import employee_scores  # noqa: E402

REPORTS_DIR = os.getenv("REPORTS_DIR", "/app/reports")
DATA_MODE = os.getenv("DATA_MODE", "api")
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(20 * 1024 * 1024)))
SIGNATURES = {".xlsx": b"PK\x03\x04", ".pdf": b"%PDF-"}
engine = db.engine


def _maybe_auto_import():
    """Первый запуск на пустой базе: подгружаем отчёты из AUTO_IMPORT_DIR (в фоне, чтобы не задерживать старт)."""
    folder = os.getenv("AUTO_IMPORT_DIR", "")
    if not folder or not os.path.isdir(folder):
        return
    with engine.connect() as conn:
        if conn.execute(select(db.upload_log.c.id).limit(1)).first():
            return  # данные уже загружались, повторно не импортируем

    def run():
        import importer
        importer.import_directory(engine, folder)

    import threading
    threading.Thread(target=run, daemon=True, name="auto-import").start()


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    if engine is not None:
        with engine.begin() as conn:
            store.seed(conn)
        _maybe_auto_import()
    yield


app = FastAPI(title="Dashboard SC Backend", version="2.0.0", lifespan=lifespan)

# CORS выключен намеренно: фронт и API живут на одном адресе через nginx.
_allowed = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]
if _allowed:
    app.add_middleware(CORSMiddleware, allow_origins=_allowed, allow_credentials=True,
                       allow_methods=["*"], allow_headers=["*"])


class HealthResponse(BaseModel):
    status: str
    database: str
    timestamp: str
    service: str


class EmployeeResponse(BaseModel):
    items: List[Dict[str, Any]]
    total: int


class HistoryResponse(BaseModel):
    employee: str
    history: List[Dict[str, Any]]


class ForecastResponse(BaseModel):
    period: str
    forecast: List[Dict[str, Any]]
    model: str


def _read(fn, empty):
    """Выполняет чтение из БД; без БД возвращает пустой результат."""
    if engine is None:
        return empty
    try:
        with engine.connect() as conn:
            return fn(conn)
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail=f"Database error: {exc}")


def _write(fn):
    if engine is None:
        raise HTTPException(status_code=503, detail="База данных не настроена.")
    try:
        with engine.begin() as conn:
            return fn(conn)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail=f"Database error: {exc}")


# ---------- служебное ----------
@app.get("/api/health", response_model=HealthResponse)
def health():
    ok, state = db.check_db()
    return JSONResponse({"status": "healthy" if ok else "degraded", "database": state,
                         "timestamp": datetime.now(timezone.utc).isoformat(),
                         "service": "dashboard-sc-backend", "data_mode": DATA_MODE},
                        status_code=200 if ok or state == "not_configured" else 503)


@app.get("/api/data-mode")
def data_mode():
    return {"mode": DATA_MODE, "description": "API Mode - data from PostgreSQL"}


@app.get("/api/status")
def status():
    """Когда и что обновлялось последним (для подписи «данные на …» на страницах)."""
    return _read(store.status, {"qc": {}, "collection": {}, "uploads": []})


# ---------- данные для страниц ----------
@app.get("/api/employees", response_model=EmployeeResponse)
def employees():
    def f(conn):
        items = [{"name": s["name"], "active": s["active"]} for s in store.staff_list(conn)["items"] if s["active"]]
        return {"items": items, "total": len(items)}
    return _read(f, {"items": [], "total": 0})


@app.get("/api/history/{employee_name}", response_model=HistoryResponse)
def history(employee_name: str, month: Optional[str] = None):
    def f(conn):
        q = select(employee_scores).where(employee_scores.c.employee_name == employee_name)
        if month:
            q = q.where(employee_scores.c.month == month)
        q = q.order_by(employee_scores.c.month.desc(), employee_scores.c.period.desc())
        return {"employee": employee_name, "history": [{
            "month": r.month, "period": r.period, "tqs": r.tqs, "aht": r.aht,
            "activity_count": r.activity_count, "svp": r.svp_scores or {},
            "tendencies": r.tendencies or "", "recommendations": r.recommendations or ""}
            for r in conn.execute(q)]}
    return _read(f, {"employee": employee_name, "history": []})


@app.get("/api/metrics")
def metrics():
    return _read(store.metrics, {})


@app.get("/api/collection")
def collection():
    return _read(store.collection, {})


@app.get("/api/crm-actions")
def crm_actions():
    return _read(store.crm, {})


@app.get("/api/qc/daily")
def qc_daily(employee: Optional[str] = None, date_from: Optional[str] = None, date_to: Optional[str] = None):
    """По дням и неделям: качество оператора (или всего отдела) с ростом/падением."""
    return _read(lambda c: store.qc_daily(c, employee, date_from, date_to),
                 {"employee": employee, "days": [], "weeks": []})


@app.get("/api/qc/calls")
def qc_calls(employee: str, date: str):
    return _read(lambda c: {"employee": employee, "date": date, "calls": store.qc_calls_for_day(c, employee, date)},
                 {"employee": employee, "date": date, "calls": []})


@app.get("/api/qc/day")
def qc_day(date: str):
    """Сводка по всем операторам за один день (для режима «весь отдел»)."""
    return _read(lambda c: {"date": date, "operators": store.qc_day_summary(c, date)}, {"date": date, "operators": []})


@app.get("/api/trends/forecast", response_model=ForecastResponse)
def forecast():
    return {"period": "current", "forecast": [], "model": "placeholder"}


# ---------- сотрудники ----------
class NameBody(BaseModel):
    name: str


class ActiveBody(BaseModel):
    name: str
    active: bool


class PairBody(BaseModel):
    a: str
    b: str


class MergeBody(BaseModel):
    source: str
    target: str


@app.get("/api/staff")
def staff_list():
    return _read(store.staff_list, {"items": [], "total": 0, "possible_duplicates": []})


@app.post("/api/staff")
def staff_add(body: NameBody):
    return {"name": _write(lambda c: store.add_staff(c, body.name))}


@app.post("/api/staff/active")
def staff_active(body: ActiveBody):
    _write(lambda c: store.set_active(c, body.name, body.active))
    return {"ok": True}


@app.post("/api/staff/not-same")
def staff_not_same(body: PairBody):
    _write(lambda c: store.dismiss_pair(c, body.a, body.b))
    return {"ok": True}


@app.post("/api/staff/merge")
def staff_merge(body: MergeBody):
    _write(lambda c: store.merge_staff(c, body.source, body.target))
    return {"ok": True, "merged_into": body.target}


# ---------- загрузка ----------
def _parse_report_date(value: Optional[str]) -> Optional[dt.date]:
    if not value:
        return None
    d = P.to_date(value)
    if d is None:
        raise HTTPException(status_code=422, detail="Дата отчёта должна быть в формате ГГГГ-ММ-ДД или ДД.ММ.ГГГГ.")
    return d


async def _handle_upload(file: UploadFile, report_date: Optional[str], amount_type: str = "auto"):
    if engine is None:
        raise HTTPException(status_code=503, detail="База данных не настроена.")
    filename = os.path.basename(file.filename or "")
    ext = os.path.splitext(filename)[1].lower()
    if ext not in SIGNATURES:
        raise HTTPException(status_code=415, detail="Поддерживаются только файлы .xlsx и .pdf.")
    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"Файл больше {MAX_UPLOAD_BYTES // (1024 * 1024)} МБ.")
    if not content.startswith(SIGNATURES[ext]):
        raise HTTPException(status_code=415, detail=f"Содержимое файла не похоже на {ext}.")
    rdate = _parse_report_date(report_date)
    if amount_type not in ("auto", "cumulative", "daily"):
        amount_type = "auto"
    try:
        summary = await run_in_threadpool(store.process_upload, engine, content, filename, rdate, amount_type)
    except P.ParseError as exc:
        raise HTTPException(status_code=422, detail={"message": exc.message, "problems": exc.problems})
    except IntegrityError as exc:
        raise HTTPException(status_code=409, detail=f"Конфликт данных при записи: {exc.orig}")
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail=f"Ошибка базы данных: {exc}")
    try:  # архив исходника, не критично
        os.makedirs(REPORTS_DIR, exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        with open(os.path.join(REPORTS_DIR, f"{stamp}_{filename}"), "wb") as fh:
            fh.write(content)
    except OSError:
        pass
    return summary


@app.post("/api/upload")
async def upload(file: UploadFile = File(...), report_date: Optional[str] = Form(None),
        amount_type: str = Form("auto")):
    return await _handle_upload(file, report_date, amount_type)


@app.post("/api/upload/xlsx")
async def upload_xlsx(file: UploadFile = File(...), report_date: Optional[str] = Form(None),
        amount_type: str = Form("auto")):
    return await _handle_upload(file, report_date, amount_type)


@app.post("/api/upload/pdf")
async def upload_pdf(file: UploadFile = File(...), report_date: Optional[str] = Form(None),
        amount_type: str = Form("auto")):
    return await _handle_upload(file, report_date, amount_type)
