import os
import json
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, HTMLResponse
from pydantic import BaseModel
from sqlalchemy import text, create_engine, MetaData, Table, Column, Integer, String, Float, DateTime, JSON, select
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError

# Configuration
DATABASE_URL = os.getenv("DATABASE_URL", "")
REPORTS_DIR = os.getenv("REPORTS_DIR", "/app/reports")
DATA_MODE = os.getenv("DATA_MODE", "api")

# Upload safety limits
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(20 * 1024 * 1024)))  # 20 MB default
# Magic-byte signatures so a renamed .exe can't sneak in as ".xlsx"/".pdf".
XLSX_SIGNATURE = b"PK\x03\x04"  # xlsx is a zip archive
PDF_SIGNATURE = b"%PDF-"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize database tables on startup (modern replacement for on_event)."""
    init_db()
    yield


app = FastAPI(title="Dashboard SC Backend", version="1.0.0", lifespan=lifespan)

# CORS: intentionally NOT enabled. Frontend and backend are served from the
# same origin through nginx's /api/ proxy (see nginx.conf), so the browser
# never needs cross-origin permission for the dashboard to work. Leaving
# CORS open (allow_origins=["*"]) would let any other website's JavaScript
# call this API on a visitor's behalf. If a legitimate external origin ever
# needs access, set ALLOWED_ORIGINS (comma-separated) explicitly — never "*".
_allowed_origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]
if _allowed_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# Database setup
engine = create_engine(DATABASE_URL, pool_pre_ping=True) if DATABASE_URL else None

# Database models
metadata = MetaData()

employee_scores = Table(
    "employee_scores",
    metadata,
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
    "employees",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("name", String(255), unique=True, nullable=False),
    Column("created_at", DateTime, default=datetime.utcnow),
)

# One row per (employee, report_date) — a daily snapshot of month-to-date
# collection progress, as uploaded from the team-lead's daily Excel report.
# `collected_amount` / `plan_amount` are cumulative for the month as of
# report_date (matches how the source report is structured), not a daily
# delta — deltas/trend are computed at query time by comparing consecutive
# report_date rows for the same employee.
collection_scores = Table(
    "collection_scores",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("employee_name", String(255), nullable=False),
    Column("report_date", String(10), nullable=False),  # ISO "YYYY-MM-DD"
    Column("month_label", String(50), nullable=False),   # e.g. "Июль 2026"
    Column("collected_amount", Float, default=0.0),
    Column("plan_amount", Float, default=0.0),
    Column("created_at", DateTime, default=datetime.utcnow),
    Column("updated_at", DateTime, default=datetime.utcnow, onupdate=datetime.utcnow),
)

# One row per (employee, month) — a monthly snapshot of CRM action-type
# counts, as uploaded from a pivoted Excel report (one row per operator,
# one column per action type: "Обещание платежа", "Отказ от оплаты", etc.).
# `actions` stores the full breakdown as JSON since the exact set of action
# types can vary between exports — no fixed column list to maintain here.
crm_actions = Table(
    "crm_actions",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("employee_name", String(255), nullable=False),
    Column("month_label", String(50), nullable=False),  # e.g. "Июль 2026"
    Column("actions", JSON, default=dict),               # {"Обещание платежа": 489, ...}
    Column("total_actions", Integer, default=0),
    Column("created_at", DateTime, default=datetime.utcnow),
    Column("updated_at", DateTime, default=datetime.utcnow, onupdate=datetime.utcnow),
)


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


def check_db() -> tuple[bool, str]:
    """Check database connection status."""
    if engine is None:
        return False, "not_configured"
    try:
        with Session(engine) as session:
            session.execute(text("SELECT 1"))
        return True, "connected"
    except SQLAlchemyError:
        return False, "error"


def init_db():
    """Initialize database tables."""
    if engine:
        metadata.create_all(engine, checkfirst=True)


@app.get("/api/health", response_model=HealthResponse)
def health():
    """Health check endpoint."""
    ok, db_state = check_db()
    status_code = 200 if ok or db_state == "not_configured" else 503
    return JSONResponse(
        {
            "status": "healthy" if ok else "degraded",
            "database": db_state,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "service": "dashboard-sc-backend",
            "data_mode": DATA_MODE,
        },
        status_code=status_code,
    )


@app.get("/api/employees", response_model=EmployeeResponse)
def employees():
    """Get list of all employees."""
    if not engine:
        return {"items": [], "total": 0}
    
    try:
        with Session(engine) as session:
            # Get unique employee names from scores table
            stmt = select(employee_scores.c.employee_name).distinct()
            result = session.execute(stmt)
            names = [row[0] for row in result if row[0]]
            
            return {"items": [{"name": name} for name in sorted(names)], "total": len(names)}
    except SQLAlchemyError as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@app.get("/api/history/{employee_name}", response_model=HistoryResponse)
def history(employee_name: str, month: Optional[str] = None):
    """Get history for specific employee."""
    if not engine:
        return {"employee": employee_name, "history": []}
    
    try:
        with Session(engine) as session:
            # Build query
            stmt = select(employee_scores).where(employee_scores.c.employee_name == employee_name)
            
            if month:
                stmt = stmt.where(employee_scores.c.month == month)
            
            # Order by month and period
            stmt = stmt.order_by(employee_scores.c.month.desc(), employee_scores.c.period.desc())
            
            result = session.execute(stmt)
            rows = result.fetchall()
            
            history_data = []
            for row in rows:
                history_data.append({
                    "month": row.month,
                    "period": row.period,
                    "tqs": row.tqs,
                    "aht": row.aht,
                    "activity_count": row.activity_count,
                    "svp": row.svp_scores or {},
                    "tendencies": row.tendencies or "",
                    "recommendations": row.recommendations or "",
                })
            
            return {"employee": employee_name, "history": history_data}
    except SQLAlchemyError as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@app.get("/api/metrics")
def get_metrics():
    """Get all dashboard metrics in DASHBOARD_DATA format."""
    if not engine:
        return {}
    
    try:
        with Session(engine) as session:
            # Get all data grouped by employee
            stmt = select(employee_scores).order_by(
                employee_scores.c.employee_name,
                employee_scores.c.month.desc(),
                employee_scores.c.period.desc()
            )
            
            result = session.execute(stmt)
            rows = result.fetchall()
            
            # Build DASHBOARD_DATA structure
            dashboard_data = {}
            
            for row in rows:
                employee = row.employee_name
                month = row.month
                period = row.period
                
                if employee not in dashboard_data:
                    dashboard_data[employee] = {"months": {}}
                
                if month not in dashboard_data[employee]["months"]:
                    dashboard_data[employee]["months"][month] = {"periods": []}
                
                period_data = {
                    "period": period,
                    "tqs": row.tqs or 0.0,
                    "aht": row.aht or "N/A",
                    "svp": row.svp_scores or {},
                    "raw_scores": row.raw_scores or {},
                    "tendencies": row.tendencies or "",
                    "rec": row.recommendations or "",
                    "activity_count": row.activity_count or 0,
                }
                
                dashboard_data[employee]["months"][month]["periods"].append(period_data)
            
            # Sort periods within each month
            for employee_data in dashboard_data.values():
                for month_data in employee_data["months"].values():
                    month_data["periods"].sort(key=lambda x: x["period"])
            
            return dashboard_data
    except SQLAlchemyError as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@app.get("/api/collection")
def get_collection():
    """Get all collection (взыскание) daily snapshots, grouped by employee.

    Shape: { "Имя": { "daily": [ {date, month_label, collected, plan}, ... ] } }
    `daily` is sorted ascending by date so the frontend can diff consecutive
    entries for trend arrows without re-sorting.
    """
    if not engine:
        return {}

    try:
        with Session(engine) as session:
            stmt = select(collection_scores).order_by(
                collection_scores.c.employee_name,
                collection_scores.c.report_date.asc(),
            )
            rows = session.execute(stmt).fetchall()

            data: Dict[str, Any] = {}
            for row in rows:
                emp = data.setdefault(row.employee_name, {"daily": []})
                emp["daily"].append({
                    "date": row.report_date,
                    "month_label": row.month_label,
                    "collected": row.collected_amount or 0.0,
                    "plan": row.plan_amount or 0.0,
                })
            return data
    except SQLAlchemyError as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@app.get("/api/crm-actions")
def get_crm_actions():
    """Get all CRM action-type breakdowns, grouped by employee then month.

    Shape: { "Имя": { "Месяц 2026": { actions: {тип: count, ...}, total: N } } }
    """
    if not engine:
        return {}

    try:
        with Session(engine) as session:
            stmt = select(crm_actions).order_by(
                crm_actions.c.employee_name,
                crm_actions.c.month_label,
            )
            rows = session.execute(stmt).fetchall()

            data: Dict[str, Any] = {}
            for row in rows:
                emp = data.setdefault(row.employee_name, {})
                emp[row.month_label] = {
                    "actions": row.actions or {},
                    "total": row.total_actions or 0,
                }
            return data
    except SQLAlchemyError as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@app.get("/api/trends/forecast", response_model=ForecastResponse)
def forecast():
    """Get forecast data (placeholder for future ML implementation)."""
    return {"period": "current", "forecast": [], "model": "placeholder"}


async def _save_upload_safely(file: UploadFile, expected_ext: str, signature: bytes) -> str:
    """Shared, hardened upload handler for both xlsx and pdf.

    Validates extension AND real file signature (magic bytes) — a renamed
    malicious file with a fake ".xlsx"/".pdf" extension gets rejected — and
    enforces MAX_UPLOAD_BYTES so nobody can fill the disk with one request.
    """
    if not file.filename or not file.filename.lower().endswith(expected_ext):
        raise HTTPException(status_code=400, detail=f"Only {expected_ext.upper()} files are allowed")

    if not REPORTS_DIR or not os.path.exists(REPORTS_DIR):
        raise HTTPException(status_code=500, detail="Reports directory not configured")

    # Reject path traversal / weird filenames (e.g. "../../etc/passwd.xlsx").
    safe_name = os.path.basename(file.filename)
    if not safe_name or safe_name != file.filename.strip():
        raise HTTPException(status_code=400, detail="Invalid filename")

    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"File exceeds {MAX_UPLOAD_BYTES // (1024*1024)}MB limit")
    if not content.startswith(signature):
        raise HTTPException(status_code=400, detail=f"File content does not look like a valid {expected_ext.upper()}")

    file_path = os.path.join(REPORTS_DIR, safe_name)
    try:
        with open(file_path, "wb") as buffer:
            buffer.write(content)
        return file_path
    except OSError as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")


@app.post("/api/upload/xlsx")
async def upload_xlsx(file: UploadFile = File(...)):
    """Upload an XLSX report. The `updater` service watches REPORTS_DIR and
    ingests new files automatically — this endpoint only needs to save the
    file safely, no separate "trigger processing" step is needed."""
    path = await _save_upload_safely(file, ".xlsx", XLSX_SIGNATURE)
    return {"status": "success", "message": f"File {os.path.basename(path)} saved, will be processed automatically", "path": path}


@app.post("/api/upload/pdf")
async def upload_pdf(file: UploadFile = File(...)):
    """Upload a PDF report. See upload_xlsx docstring — processing is automatic."""
    path = await _save_upload_safely(file, ".pdf", PDF_SIGNATURE)
    return {"status": "success", "message": f"File {os.path.basename(path)} saved, will be processed automatically", "path": path}


@app.get("/api/data-mode")
def get_data_mode():
    """Get current data mode."""
    return {"mode": DATA_MODE, "description": "API Mode - data from PostgreSQL"}


if __name__ == "__main__":
    import uvicorn
    # 0.0.0.0 is intentional and safe here: this process only runs inside the
    # `backend` Docker container, which has NO port mapping to the host/internet
    # (see docker-compose.yml) — it's reachable only from other containers on
    # qc_network (nginx, updater). Binding to 127.0.0.1 would break that.
    uvicorn.run(app, host="0.0.0.0", port=8000)  # nosec B104