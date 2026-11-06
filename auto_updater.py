#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
QC Soft Collection Auto Updater
Парсер XLSX/PDF файлов и обновление DASHBOARD_DATA в index.html
"""

import json
import os
import re
import time
import traceback
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean
from typing import Any, Dict, List, Optional

import pandas as pd
import pdfplumber
from sqlalchemy import (JSON, Column, DateTime, Float, Integer, MetaData,
                        String, Table, create_engine, select)
from sqlalchemy.exc import SQLAlchemyError
from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer

SCRIPT_DIR = Path(__file__).parent.resolve()
REPORTS_DIR = SCRIPT_DIR / "reports"
INDEX_HTML_PATH = SCRIPT_DIR / "assets" / "js" / "data.js"
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg2://qc_user:change_me@localhost:5432/qc_dashboard"
)
BACKEND_API_URL = os.getenv("BACKEND_API_URL", "http://localhost:8000")
DATA_MODE = os.getenv("DATA_MODE", "api")
ENABLE_BACKEND_SYNC = os.getenv("ENABLE_BACKEND_SYNC", "1") == "1"

MONTHS_MAP = {
    "01": "Январь", "02": "Февраль", "03": "Март", "04": "Апрель",
    "05": "Май", "06": "Июнь", "07": "Июль", "08": "Август",
    "09": "Сентябрь", "10": "Октябрь", "11": "Ноябрь", "12": "Декабрь"
}


def ru_month_label(mm: str, yyyy: str) -> str:
    """'07', '2026' -> 'Июль 2026'. Falls back to 'MM.YYYY' for a bad month
    number instead of guessing — never silently mislabels data."""
    name = MONTHS_MAP.get(mm)
    return f"{name} {yyyy}" if name else f"{mm}.{yyyy}"

XLSX_SHEET_NAME = "Оценки звонков Soft Collection"
SVP_COLUMNS_INDICES = list(range(6, 15))
TQS_INDEX = 15
DURATION_INDEX = 5
EMPLOYEE_INDEX = 0

SVP_KEYS = [
    "Приветствие",
    "Этика",
    "CRM",
    "Легенда",
    "Задолж.",
    "Аргумент.",
    "Манипул.",
    "Требования",
    "Итоги",
]

NAME_MAP = {
    "Toshtemirov Mukhammadali": "Тоштемиров Мухаммадали",
    "Abdullaeva Sevinch":      "Абдуллаева Севинч",
    "Alkarov Zhamshid":        "Алкаров Жамшид",
    "Bakhromova Nozima":       "Бахромова Нозима",
    "Boborakhmatov Sanyatbek": "Боборахматов Санъатбек",
    "Isakov Davron":           "Исаков Даврон",
    "Kayumova Soniya":         "Каюмова Сония",
    "Kurolboev Zhavokhir":     "Куролбоев Жавохир",
    "Mamaraimov Firdavs":      "Мамараимов Фирдавс",
    "Musaev Khurshid":         "Мусаев Хуршид",
    "Nadrullaeva Rukhsona":    "Надруллаева Рухсона",
    "Nizomiddinov Asliddin":   "Низомиддинов Аслиддин",
    "Rakhimzhonov Nodirzhon":  "Рахимжонов Нодиржон",
    "Sabitova Navruza":        "Сабитова Навруза",
    "Saburov Ogabek":          "Сабуров Оғабек",
    "Tozhiev Shokhrukh":       "Тожиев Шохрух",
    "Khakimov Umid":           "Хакимов Умид",
    "Shamiev Farrukh":         "Шамиев Фаррух",
    "Shoknazarova Sabrina":    "Шохназарова Сабрина",
    "Abduvalieva Zarifa":      "Абдувалиева Зарифа",
    "Komoldinov Diyorbek":     "Комолдинов Диёрбек",
    "Shavkatov Gofur":         "Шавкатов Гофур",
    "Makhmudzhonov Ibrokhim":  "Махмуджонов Иброхим",
    "Mirkamalov Boburzhon":    "Миркамалов Бобуржон",
    "Mirkhamidov Samandar":    "Мирхамидов Самандар",
    "Khasanova Madinabonu":    "Хасанова Мадинабону",
    "Sherkulov Azamat":        "Шеркулов Азамат",
}
for cyr in list(NAME_MAP.values()):
    NAME_MAP[cyr] = cyr


def normalize_name(name: Any) -> str:
    if pd.isna(name):
        return ""
    text = str(name).strip()
    return NAME_MAP.get(text, text)


def parse_score(value: Any) -> float:
    if pd.isna(value):
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip().replace(',', '.')
    if text.endswith('%'):
        text = text[:-1].strip()
    try:
        return float(text)
    except ValueError:
        return 0.0


def parse_duration(value: Any) -> float:
    if pd.isna(value) or value is None:
        return 0.0
    if hasattr(value, 'hour') and hasattr(value, 'minute'):
        hour = float(value.hour)
        minute = float(value.minute)
        second = float(getattr(value, 'second', 0))
        # XLSX often stores MM:SS as HH:MM:00 (e.g. 01:26:00 -> 1:26, 00:51:00 -> 0:51).
        # For call-center AHT we treat any HH:MM:00 as minutes:seconds.
        if second == 0:
            return hour + minute / 60.0
        return hour * 60.0 + minute + second / 60.0
    text = str(value).strip()
    if not text:
        return 0.0
    if ':' in text:
        parts = [p for p in text.split(':') if p.strip()]
        try:
            if len(parts) == 3:
                p0 = float(parts[0])
                p1 = float(parts[1])
                p2 = float(parts[2])
                if p2 == 0:
                    return p0 + p1 / 60.0
                return p0 * 60.0 + p1 + p2 / 60.0
            if len(parts) == 2:
                return float(parts[0]) + float(parts[1]) / 60.0
            return float(parts[0])
        except ValueError:
            return 0.0
    try:
        return float(text)
    except ValueError:
        return 0.0


def format_duration(minutes: float) -> str:
    """Возвращает строку в формате MM:SS (минуты:секунды)."""
    if minutes <= 0:
        return "N/A"
    total_seconds = int(minutes * 60)
    mins = total_seconds // 60
    secs = total_seconds % 60
    return f"{mins:02d}:{secs:02d}"


def extract_month_and_period(filename: str) -> tuple[str, str]:
    # Try format: "13.04.2026 - 19.04.2026"
    match = re.search(r"(\d{2})\.(\d{2})\.(\d{4})\s*-\s*(\d{2})\.(\d{2})\.(\d{4})", filename)
    if match:
        month = ru_month_label(match.group(2), match.group(3))
        period = f"{match.group(1)}-{match.group(4)}"
        return month, period
    
    # Try format: "13-19.04.2026"
    match = re.search(r"(\d{2})-(\d{2})\.(\d{2})\.(\d{4})", filename)
    if match:
        month = ru_month_label(match.group(3), match.group(4))
        period = f"{match.group(1)}-{match.group(2)}"
        return month, period
    
    return "Неизвестно", "Неизвестно"


def ensure_employee_period(data: Dict[str, Any], employee: str, month: str, period: str) -> Dict[str, Any]:
    if employee not in data:
        data[employee] = {"months": {}}
    if month not in data[employee]["months"]:
        data[employee]["months"][month] = {"periods": []}
    periods = data[employee]["months"][month]["periods"]
    for item in periods:
        if item["period"] == period:
            return item
    placeholder = {
        "period": period,
        "tqs": 0.0,
        "aht": "N/A",
        "svp": {key: 1.0 for key in SVP_KEYS},
        "raw_scores": {key: [] for key in SVP_KEYS},
        "tendencies": "",
        "rec": "",
        "_tqs_values": [],
        "_durations": [],
        "_activity_count": 0,
    }
    periods.append(placeholder)
    periods.sort(key=lambda item: item["period"])
    return placeholder


def read_xlsx_files() -> Dict[str, Any]:
    data: Dict[str, Any] = {}
    if not REPORTS_DIR.exists():
        print(f"[WARNING] reports directory not found: {REPORTS_DIR}")
        return data
    xlsx_files = sorted(REPORTS_DIR.glob("*.xlsx"))
    if not xlsx_files:
        print(f"[WARNING] no XLSX files found in {REPORTS_DIR}")
        return data
    print(f"[INFO] found {len(xlsx_files)} XLSX files")
    for xlsx_file in xlsx_files:
        # Collection (взыскание) and CRM-actions reports live in the same
        # reports/ folder but have completely different structures — skip
        # them quietly here instead of letting the QC-format parse below
        # fail noisily.
        try:
            preview_cols = list(pd.read_excel(xlsx_file, engine="openpyxl", header=0, nrows=0).columns)
            if looks_like_collection_report(preview_cols):
                print(f"[INFO] {xlsx_file.name} looks like a collection (взыскание) report, skipping in QC parser")
                continue
            if looks_like_crm_report(preview_cols):
                print(f"[INFO] {xlsx_file.name} looks like a CRM-actions report, skipping in QC parser")
                continue
        except Exception:
            pass  # fall through to the normal QC parse attempt below; its own error handling covers this

        month, period = extract_month_and_period(xlsx_file.name)
        if month == "Неизвестно":
            print(f"[WARNING] could not parse month from {xlsx_file.name}")
        try:
            df = pd.read_excel(xlsx_file, sheet_name=XLSX_SHEET_NAME, engine="openpyxl", header=2)
        except Exception as exc:
            print(f"[ERROR] failed to read {xlsx_file.name}: {exc}")
            continue
        if df.shape[1] < max(SVP_COLUMNS_INDICES) + 1:
            print(f"[WARNING] unexpected XLSX format {xlsx_file.name}; columns={df.shape[1]}")
            continue
        for _, row in df.iterrows():
            employee = normalize_name(row.iloc[EMPLOYEE_INDEX])
            if not employee:
                continue
            entry = ensure_employee_period(data, employee, month, period)
            tqs = parse_score(row.iloc[TQS_INDEX])
            duration = parse_duration(row.iloc[DURATION_INDEX])
            svp_values = [parse_score(row.iloc[idx]) for idx in SVP_COLUMNS_INDICES]
            entry["_tqs_values"].append(tqs)
            entry["_durations"].append(duration)
            entry["_activity_count"] += 1
            for key, value in zip(SVP_KEYS, svp_values):
                entry["raw_scores"][key].append(value)
        print(f"[INFO] {xlsx_file.name} loaded")
    # finalize aggregates
    for employee, employee_data in data.items():
        for month, month_data in employee_data["months"].items():
            for period_item in month_data["periods"]:
                if period_item["_tqs_values"]:
                    period_item["tqs"] = round(mean(period_item["_tqs_values"]), 2)
                if period_item["_durations"]:
                    period_item["aht"] = format_duration(mean(period_item["_durations"]))
                if period_item.get("_activity_count") is None:
                    period_item["_activity_count"] = len(period_item["_tqs_values"])
                period_item["activity_count"] = period_item.get("_activity_count", len(period_item["_tqs_values"]))
                for key in SVP_KEYS:
                    if period_item["raw_scores"][key]:
                        period_item["svp"][key] = round(mean(period_item["raw_scores"][key]), 2)
                period_item.pop("_tqs_values", None)
                period_item.pop("_durations", None)
                period_item.pop("_activity_count", None)
    
    # Сортировка месяцев по календарному порядку для каждого сотрудника
    MONTH_ORDER = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 
                   'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
    for employee, employee_data in data.items():
        if 'months' in employee_data:
            sorted_months = dict(sorted(
                employee_data['months'].items(),
                key=lambda item: (
                    MONTH_ORDER.index(item[0].split(' ')[0]) if item[0].split(' ')[0] in MONTH_ORDER else 999,
                    -int(item[0].split(' ')[1]) if len(item[0].split(' ')) > 1 and item[0].split(' ')[1].isdigit() else 0
                )
            ))
            employee_data['months'] = sorted_months
    
    return data


# ========== Collection (взыскание) daily reports ==========
# Separate, independent pipeline from the QC xlsx report above — different
# file structure, different cadence (daily, cumulative-for-month snapshots
# vs. weekly/monthly QC scoring). Auto-detected by column headers so the
# person uploading doesn't need to name files in any special way, though
# including a date in the filename (any of DD.MM.YYYY / DD-MM-YYYY /
# YYYY-MM-DD) is strongly recommended for reliable trend tracking — without
# it we fall back to the file's last-modified date, which is a best guess.

COLLECTION_HEADER_MARKERS = ["сбор", "взыскан"]  # substring match, case-insensitive
DATE_PATTERNS = [
    (re.compile(r"(\d{2})\.(\d{2})\.(\d{4})"), lambda m: f"{m.group(3)}-{m.group(2)}-{m.group(1)}"),   # DD.MM.YYYY
    (re.compile(r"(\d{2})-(\d{2})-(\d{4})"), lambda m: f"{m.group(3)}-{m.group(2)}-{m.group(1)}"),      # DD-MM-YYYY
    (re.compile(r"(\d{4})-(\d{2})-(\d{2})"), lambda m: f"{m.group(1)}-{m.group(2)}-{m.group(3)}"),      # YYYY-MM-DD
]


def extract_report_date(filename: str, fallback_mtime: float) -> str:
    """Best-effort date extraction from a filename; falls back to the file's
    last-modified date (logged clearly) if no date pattern is found."""
    for pattern, to_iso in DATE_PATTERNS:
        match = pattern.search(filename)
        if match:
            iso = to_iso(match)
            try:
                datetime.strptime(iso, "%Y-%m-%d")  # validates real calendar date
                return iso
            except ValueError:
                continue
    fallback = datetime.fromtimestamp(fallback_mtime).strftime("%Y-%m-%d")
    print(f"[WARNING] no date found in filename '{filename}', using file date {fallback} instead — "
          f"include a date like DD.MM.YYYY in the filename for reliable trend tracking.")
    return fallback


def looks_like_collection_report(columns: List[str]) -> bool:
    joined = " ".join(str(c).lower() for c in columns)
    return any(marker in joined for marker in COLLECTION_HEADER_MARKERS)


def _find_column(columns: List[str], *substrings: str) -> Optional[int]:
    for i, col in enumerate(columns):
        col_lower = str(col).lower()
        if all(s.lower() in col_lower for s in substrings):
            return i
    return None


def _find_first_column(columns: List[str], *candidates: str) -> Optional[int]:
    """Tries each single-word candidate in order, returns the first match.

    NOT the same as `_find_column(columns, *candidates) or _find_column(...)`
    — that pattern is broken whenever the matching column is at index 0,
    since `0 or X` evaluates to X in Python (0 is falsy). Found this the
    hard way: it silently broke name-column detection whenever "Оператор"
    happened to be the first column. This helper checks `is not None`
    explicitly instead.
    """
    for candidate in candidates:
        idx = _find_column(columns, candidate)
        if idx is not None:
            return idx
    return None


def read_collection_files() -> List[Dict[str, Any]]:
    """Parse every XLSX in reports/ that looks like a daily collection
    (взыскание) report. Returns a flat list of row dicts ready for DB write.
    QC-format xlsx files are silently skipped (they don't match the header
    markers), so both report types can live in the same reports/ folder."""
    rows_out: List[Dict[str, Any]] = []
    if not REPORTS_DIR.exists():
        return rows_out

    for xlsx_file in sorted(REPORTS_DIR.glob("*.xlsx")):
        try:
            preview = pd.read_excel(xlsx_file, engine="openpyxl", header=0, nrows=0)
        except Exception as exc:
            print(f"[ERROR] failed to preview {xlsx_file.name}: {exc}")
            continue

        columns = list(preview.columns)
        if not looks_like_collection_report(columns):
            continue  # not a collection report — read_xlsx_files() will (try to) handle it

        try:
            df = pd.read_excel(xlsx_file, engine="openpyxl", header=0)
        except Exception as exc:
            print(f"[ERROR] failed to read collection report {xlsx_file.name}: {exc}")
            continue

        name_idx = _find_first_column(columns, "оператор", "сотрудник")
        collected_idx = _find_column(columns, "сбор")
        plan_idx = _find_column(columns, "план")
        if name_idx is None or collected_idx is None:
            print(f"[WARNING] {xlsx_file.name} looks like a collection report but is missing "
                  f"'Оператор'/'Сбор' columns — skipping. Columns found: {columns}")
            continue

        report_date = extract_report_date(xlsx_file.name, xlsx_file.stat().st_mtime)
        year, month_num, _ = report_date.split("-")
        month_label = ru_month_label(month_num, year)

        for _, row in df.iterrows():
            employee = normalize_name(row.iloc[name_idx])
            if not employee:
                continue
            collected = parse_score(row.iloc[collected_idx])
            plan = parse_score(row.iloc[plan_idx]) if plan_idx is not None else 0.0
            rows_out.append({
                "employee_name": employee,
                "report_date": report_date,
                "month_label": month_label,
                "collected_amount": collected,
                "plan_amount": plan,
            })
        print(f"[INFO] {xlsx_file.name} loaded as collection report (date={report_date}, {len(df)} rows)")

    return rows_out


def write_collection_data_to_db(rows: List[Dict[str, Any]]) -> None:
    """Upsert daily collection snapshots into Postgres, one row per
    (employee_name, report_date) — re-uploading the same day overwrites
    that day's numbers rather than duplicating them."""
    if not rows:
        return
    try:
        engine = get_db_engine()
        metadata = MetaData()
        collection_scores = Table(
            "collection_scores",
            metadata,
            Column("id", Integer, primary_key=True, autoincrement=True),
            Column("employee_name", String(255), nullable=False),
            Column("report_date", String(10), nullable=False),
            Column("month_label", String(50), nullable=False),
            Column("collected_amount", Float, default=0.0),
            Column("plan_amount", Float, default=0.0),
            Column("created_at", DateTime),
            Column("updated_at", DateTime),
            extend_existing=True,
        )
        metadata.create_all(engine, checkfirst=True)

        with engine.begin() as conn:
            for row in rows:
                select_stmt = select(collection_scores.c.id).where(
                    collection_scores.c.employee_name == row["employee_name"],
                    collection_scores.c.report_date == row["report_date"],
                )
                existing = conn.execute(select_stmt).first()
                payload = dict(row, updated_at=datetime.now(timezone.utc))
                if existing:
                    conn.execute(
                        collection_scores.update()
                        .where(collection_scores.c.id == existing[0])
                        .values(**payload)
                    )
                else:
                    payload["created_at"] = datetime.now(timezone.utc)
                    conn.execute(collection_scores.insert().values(**payload))
        print(f"[INFO] collection data written to PostgreSQL ({len(rows)} rows)")
    except SQLAlchemyError as exc:
        print(f"[ERROR] Could not write collection data to DB: {exc}")
    except Exception as exc:
        print(f"[ERROR] Unexpected collection DB write failure: {exc}")


# ========== CRM actions (CRM-действия) monthly reports ==========
# Third independent pipeline, same auto-detection philosophy as collection
# reports above. Source format (confirmed with the person uploading):
# one row per operator, one column per action type with a count —
# already pivoted, no per-call aggregation needed on our side.
# Uploaded monthly (not daily), so there's no report_date to track —
# just employee_name + month_label + the full {action_type: count} map.

CRM_HEADER_MARKERS = ["обещание", "отказ от оплаты", "заявленный платеж", "тишина", "бросил трубку"]
# Columns that identify the operator, not an action type
CRM_NAME_MARKERS = ["оператор", "сотрудник", "фио"]


def looks_like_crm_report(columns: List[str]) -> bool:
    joined = " ".join(str(c).lower() for c in columns)
    # require at least 2 known action-type markers, not just 1 — reduces
    # false positives from unrelated reports that happen to share a word
    hits = sum(1 for marker in CRM_HEADER_MARKERS if marker in joined)
    return hits >= 2


def extract_report_month(filename: str, fallback_mtime: float) -> tuple[str, str]:
    """Returns (month_label, sort_key) e.g. ('Август 2026', '2026-08').
    Tries DD.MM.YYYY / MM.YYYY / YYYY-MM patterns in the filename first,
    falls back to the file's last-modified month with a warning."""
    m = re.search(r"(\d{2})\.(\d{2})\.(\d{4})", filename)  # DD.MM.YYYY
    if m:
        return ru_month_label(m.group(2), m.group(3)), f"{m.group(3)}-{m.group(2)}"
    m = re.search(r"(?<!\d)(\d{2})\.(\d{4})(?!\d)", filename)  # MM.YYYY
    if m:
        return ru_month_label(m.group(1), m.group(2)), f"{m.group(2)}-{m.group(1)}"
    m = re.search(r"(\d{4})-(\d{2})(?!\d)", filename)  # YYYY-MM
    if m:
        return ru_month_label(m.group(2), m.group(1)), f"{m.group(1)}-{m.group(2)}"
    fallback = datetime.fromtimestamp(fallback_mtime)
    label = ru_month_label(f"{fallback.month:02d}", str(fallback.year))
    print(f"[WARNING] no month found in filename '{filename}', using file date ({label}) instead — "
          f"include a month like MM.YYYY in the filename for reliability.")
    return label, f"{fallback.year}-{fallback.month:02d}"


def read_crm_actions_files() -> List[Dict[str, Any]]:
    """Parse every XLSX in reports/ that looks like a CRM-actions report.
    One row per (employee_name, month_label) in the output, with the full
    action-type breakdown as a dict. QC and collection parsers already
    skip these files (different header markers), so all three formats can
    coexist in the same reports/ folder."""
    rows_out: List[Dict[str, Any]] = []
    if not REPORTS_DIR.exists():
        return rows_out

    for xlsx_file in sorted(REPORTS_DIR.glob("*.xlsx")):
        try:
            preview = pd.read_excel(xlsx_file, engine="openpyxl", header=0, nrows=0)
        except Exception as exc:
            print(f"[ERROR] failed to preview {xlsx_file.name}: {exc}")
            continue

        columns = list(preview.columns)
        if not looks_like_crm_report(columns):
            continue

        try:
            df = pd.read_excel(xlsx_file, engine="openpyxl", header=0)
        except Exception as exc:
            print(f"[ERROR] failed to read CRM-actions report {xlsx_file.name}: {exc}")
            continue

        name_idx = _find_first_column(columns, "оператор", "сотрудник", "фио")
        if name_idx is None:
            print(f"[WARNING] {xlsx_file.name} looks like a CRM-actions report but has no "
                  f"'Оператор'/'Сотрудник'/'ФИО' column — skipping. Columns found: {columns}")
            continue

        # Every other column is treated as an action type with a numeric count
        action_cols = [(i, str(c)) for i, c in enumerate(columns)
                        if i != name_idx and str(c).lower() not in CRM_NAME_MARKERS]

        month_label, _ = extract_report_month(xlsx_file.name, xlsx_file.stat().st_mtime)

        for _, row in df.iterrows():
            employee = normalize_name(row.iloc[name_idx])
            if not employee:
                continue
            actions = {}
            total = 0
            for col_idx, col_name in action_cols:
                count = int(parse_score(row.iloc[col_idx]) or 0)
                if count:
                    actions[col_name] = count
                    total += count
            if not actions:
                continue
            rows_out.append({
                "employee_name": employee,
                "month_label": month_label,
                "actions": actions,
                "total_actions": total,
            })
        print(f"[INFO] {xlsx_file.name} loaded as CRM-actions report (month={month_label}, {len(df)} rows)")

    return rows_out


def write_crm_actions_to_db(rows: List[Dict[str, Any]]) -> None:
    """Upsert monthly CRM-action breakdowns into Postgres, one row per
    (employee_name, month_label) — re-uploading the same month overwrites
    it rather than duplicating."""
    if not rows:
        return
    try:
        engine = get_db_engine()
        metadata = MetaData()
        crm_actions = Table(
            "crm_actions",
            metadata,
            Column("id", Integer, primary_key=True, autoincrement=True),
            Column("employee_name", String(255), nullable=False),
            Column("month_label", String(50), nullable=False),
            Column("actions", JSON, default=dict),
            Column("total_actions", Integer, default=0),
            Column("created_at", DateTime),
            Column("updated_at", DateTime),
            extend_existing=True,
        )
        metadata.create_all(engine, checkfirst=True)

        with engine.begin() as conn:
            for row in rows:
                select_stmt = select(crm_actions.c.id).where(
                    crm_actions.c.employee_name == row["employee_name"],
                    crm_actions.c.month_label == row["month_label"],
                )
                existing = conn.execute(select_stmt).first()
                payload = dict(row, updated_at=datetime.now(timezone.utc))
                if existing:
                    conn.execute(
                        crm_actions.update()
                        .where(crm_actions.c.id == existing[0])
                        .values(**payload)
                    )
                else:
                    payload["created_at"] = datetime.now(timezone.utc)
                    conn.execute(crm_actions.insert().values(**payload))
        print(f"[INFO] CRM-actions data written to PostgreSQL ({len(rows)} rows)")
    except SQLAlchemyError as exc:
        print(f"[ERROR] Could not write CRM-actions data to DB: {exc}")
    except Exception as exc:
        print(f"[ERROR] Unexpected CRM-actions DB write failure: {exc}")


def extract_pdf_sections(text: str) -> List[str]:
    parts = re.split(r"Отчет\s+по\s+сотруднику\s*[:：]", text, flags=re.IGNORECASE)
    return [part.strip() for part in parts if part.strip()]


def extract_section_text(block: str, key: str) -> str:
    # Find the line with the key
    pattern = re.search(fr"{re.escape(key)}\s*[:：]?\s*", block, flags=re.IGNORECASE)
    if not pattern:
        return ""
    
    # Get everything after the key
    start_pos = pattern.end()
    remaining = block[start_pos:]
    
    # If this is "Рекомендации", capture everything until paragraph break or end
    if "рекомендаци" in key.lower():
        # Stop at double newline (paragraph break) - this is where recommendations end
        match_break = re.search(r"\n\s*\n", remaining)
        if match_break:
            text = remaining[:match_break.start()]
        else:
            text = remaining
    else:
        # For other sections, just take until end of line (existing behavior)
        match_newline = re.search(r"\n", remaining)
        if match_newline:
            text = remaining[:match_newline.start()]
        else:
            text = remaining
    
    return text.strip().replace("\n", " ").replace("\r", " ")


def read_pdf_files(data: Dict[str, Any]) -> None:
    if not REPORTS_DIR.exists():
        return
    pdf_files = sorted(REPORTS_DIR.glob("*.pdf"))
    if not pdf_files:
        return
    print(f"[INFO] found {len(pdf_files)} PDF files")
    for pdf_file in pdf_files:
        month, period = extract_month_and_period(pdf_file.name)
        print(f"[INFO] parsing PDF: {pdf_file.name}")
        try:
            with pdfplumber.open(pdf_file) as pdf:
                text = "\n".join(page.extract_text() or "" for page in pdf.pages)
        except Exception as exc:
            print(f"[ERROR] failed to open PDF {pdf_file.name}: {exc}")
            continue
        sections = extract_pdf_sections(text)
        for section in sections:
            lines = [line.strip() for line in section.splitlines() if line.strip()]
            if not lines:
                continue
            employee = normalize_name(lines[0])
            if not employee:
                continue
            entry = ensure_employee_period(data, employee, month, period)
            entry["tendencies"] = extract_section_text(section, "Тенденции") or entry["tendencies"]
            entry["rec"] = extract_section_text(section, "Рекомендации") or entry["rec"]
    return


def clean_data(data: Dict[str, Any]) -> Dict[str, Any]:
    """Удаляет мусорные записи из собранных данных."""
    cleaned: Dict[str, Any] = {}
    for employee, emp_data in data.items():
        if not employee or str(employee).strip() == "":
            continue
        clean_months: Dict[str, Any] = {}
        for month, month_data in emp_data.get("months", {}).items():
            if month == "Неизвестно":
                continue
            clean_periods: List[Dict[str, Any]] = []
            for period in month_data.get("periods", []):
                if period.get("period") == "Неизвестно":
                    continue
                if period.get("tqs", 0) == 0 and not period.get("_tqs_values"):
                    continue
                period.pop("_tqs_values", None)
                period.pop("_durations", None)
                period.pop("_activity_count", None)
                clean_periods.append(period)
            if clean_periods:
                clean_months[month] = {"periods": clean_periods}
        if clean_months:
            cleaned[employee] = {"months": clean_months}
    return cleaned


def update_index_html(new_data: Dict[str, Any]) -> bool:
    if not INDEX_HTML_PATH.exists():
        print(f"[ERROR] index.html not found at {INDEX_HTML_PATH}")
        return False
    content = INDEX_HTML_PATH.read_text(encoding="utf-8")
    payload = json.dumps(new_data, ensure_ascii=False, indent=2)
    replacement = f"// --- DATA START ---\nconst DASHBOARD_DATA = {payload};\n// --- DATA END ---"
    pattern = re.compile(r"// --- DATA START ---.*?// --- DATA END ---", flags=re.DOTALL)
    if not pattern.search(content):
        print("[ERROR] data markers not found in index.html")
        return False
    updated = pattern.sub(replacement, content)
    INDEX_HTML_PATH.write_text(updated, encoding="utf-8")
    print(f"[INFO] dashboard data updated in {INDEX_HTML_PATH.name}")
    return True


def get_db_engine():
    """Create database engine for PostgreSQL."""
    return create_engine(DATABASE_URL, pool_pre_ping=True, future=True)


def _build_multipart_body(field_name: str, filename: str, content: bytes, content_type: str) -> tuple[str, bytes]:
    boundary = "----WebKitFormBoundary" + uuid.uuid4().hex
    body_lines = [
        f"--{boundary}",
        f"Content-Disposition: form-data; name=\"{field_name}\"; filename=\"{filename}\"",
        f"Content-Type: {content_type}",
        "",
    ]
    body = "\r\n".join(body_lines).encode("utf-8") + b"\r\n" + content + b"\r\n" + f"--{boundary}--\r\n".encode("utf-8")
    return boundary, body


def _upload_file_to_backend(file_path: Path) -> None:
    if not BACKEND_API_URL:
        return
    file_type = file_path.suffix.lower()
    if file_type == ".xlsx":
        endpoint = "upload/xlsx"
        content_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    elif file_type == ".pdf":
        endpoint = "upload/pdf"
        content_type = "application/pdf"
    else:
        return

    url = f"{BACKEND_API_URL.rstrip('/')}/api/{endpoint}"
    try:
        with file_path.open("rb") as f:
            content = f.read()
        boundary, body = _build_multipart_body("file", file_path.name, content, content_type)
        request = urllib.request.Request(
            url,
            data=body,
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
            method="POST"
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            response_text = response.read().decode("utf-8", errors="replace")
            print(f"[INFO] uploaded {file_path.name} to backend: {response_text[:200]}")
    except urllib.error.HTTPError as exc:
        print(f"[ERROR] backend upload failed {file_path.name}: {exc.code} {exc.reason}")
    except urllib.error.URLError as exc:
        print(f"[ERROR] backend upload failed {file_path.name}: {exc}")
    except Exception as exc:
        print(f"[ERROR] unexpected backend upload error for {file_path.name}: {exc}")


def sync_reports_to_backend() -> None:
    """LEGACY / opt-in only — DO NOT call this from refresh_dashboard().

    Historically this re-uploaded every local report file to the backend's
    /api/upload/* endpoints over HTTP, for setups where `updater` and
    `backend` did NOT share a filesystem (e.g. backend on a different host).

    In the current docker-compose.yml, `updater` and `backend` both bind-mount
    the SAME `reports/` directory. If this function runs from inside the
    watchdog-triggered refresh_dashboard(), it creates an infinite loop:
    re-uploading a file -> backend writes it back into reports/ -> that write
    triggers the watchdog -> refresh_dashboard() runs again -> re-uploads
    again -> forever. That loop would burn CPU/network nonstop in production.

    Only call this manually / from a cron job, and only if BACKEND_API_URL
    genuinely points at a backend with a separate, non-shared reports folder.
    """
    if not BACKEND_API_URL:
        return
    if not REPORTS_DIR.exists():
        return

    for file_path in sorted(REPORTS_DIR.glob("*.xlsx")) + sorted(REPORTS_DIR.glob("*.pdf")):
        _upload_file_to_backend(file_path)


def write_dashboard_data_to_db(data: Dict[str, Any]) -> None:
    """Save aggregated dashboard metrics into PostgreSQL."""
    try:
        engine = get_db_engine()
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
            Column("created_at", DateTime),
            Column("updated_at", DateTime),
            extend_existing=True,
        )
        metadata.create_all(engine, checkfirst=True)

        with engine.begin() as conn:
            for employee_name, employee_data in data.items():
                for month, month_data in employee_data["months"].items():
                    for period_item in month_data["periods"]:
                        row = {
                            "employee_name": employee_name,
                            "month": month,
                            "period": period_item["period"],
                            "tqs": float(period_item["tqs"] or 0.0),
                            "aht": str(period_item["aht"]),
                            "activity_count": int(period_item.get("activity_count", 0)),
                            "svp_scores": period_item.get("svp", {}),
                            "raw_scores": period_item.get("raw_scores", {}),
                            "tendencies": period_item.get("tendencies", ""),
                            "recommendations": period_item.get("rec", ""),
                            "updated_at": datetime.now(timezone.utc),
                        }
                        select_stmt = select(employee_scores.c.id).where(
                            employee_scores.c.employee_name == employee_name,
                            employee_scores.c.month == month,
                            employee_scores.c.period == period_item["period"],
                        )
                        existing = conn.execute(select_stmt).first()
                        if existing:
                            update_stmt = (
                                employee_scores.update()
                                .where(employee_scores.c.id == existing[0])
                                .values(**row)
                            )
                            conn.execute(update_stmt)
                        else:
                            row["created_at"] = datetime.now(timezone.utc)
                            conn.execute(employee_scores.insert().values(**row))
        print("[INFO] dashboard data written to PostgreSQL")
    except SQLAlchemyError as exc:
        print(f"[ERROR] Could not write dashboard data to DB: {exc}")
    except Exception as exc:
        print(f"[ERROR] Unexpected DB write failure: {exc}")


def refresh_dashboard() -> None:
    """
    Обновляет данные дашборда:
      1. Парсит XLSX/PDF из reports/ (QC-оценки), XLSX-отчёты по взысканию
         и XLSX-отчёты по CRM-действиям — три независимых, автоматически
         распознаваемых формата (см. read_collection_files(),
         read_crm_actions_files()).
      2. Всегда обновляет assets/js/data.js (резервная копия для фронтенда,
         на случай если API временно недоступен).
      3. Если DATA_MODE=api или ENABLE_BACKEND_SYNC=1 — пишет агрегаты
         напрямую в PostgreSQL через SQLAlchemy (без HTTP, без файловых
         операций — безопасно вызывать из обработчика watchdog).

    ВАЖНО: намеренно НЕ вызывает sync_reports_to_backend() здесь — это
    вызвало бы бесконечный цикл (см. docstring этой функции). updater и
    backend делят один и тот же том reports/, поэтому HTTP-реаплоад не нужен.
    """
    try:
        print(f"[INFO] refresh_dashboard | DATA_MODE={DATA_MODE} | ENABLE_BACKEND_SYNC={ENABLE_BACKEND_SYNC}")
        data = read_xlsx_files()
        read_pdf_files(data)
        data = clean_data(data)

        collection_rows = read_collection_files()
        crm_rows = read_crm_actions_files()

        if not data and not collection_rows and not crm_rows:
            print("[WARNING] no dashboard data generated (no QC, collection, or CRM-actions reports found)")
            return

        if data:
            # Всегда обновляем data.js — резервная копия на случай недоступности API
            update_index_html(data)

            # Запись в PostgreSQL: всегда при API Mode; при Static Mode — если ENABLE_BACKEND_SYNC=1
            if DATA_MODE == "api" or ENABLE_BACKEND_SYNC:
                write_dashboard_data_to_db(data)
            else:
                print("[INFO] ENABLE_BACKEND_SYNC=0: пропускаем запись QC-данных в БД")

        if collection_rows:
            if DATA_MODE == "api" or ENABLE_BACKEND_SYNC:
                write_collection_data_to_db(collection_rows)
            else:
                print("[INFO] ENABLE_BACKEND_SYNC=0: пропускаем запись данных взыскания в БД")

        if crm_rows:
            if DATA_MODE == "api" or ENABLE_BACKEND_SYNC:
                write_crm_actions_to_db(crm_rows)
            else:
                print("[INFO] ENABLE_BACKEND_SYNC=0: пропускаем запись CRM-действий в БД")

    except Exception:
        print("[ERROR] failed to refresh dashboard")
        traceback.print_exc()


class ReportsHandler(FileSystemEventHandler):
    def on_created(self, event):
        if event.is_directory:
            return
        if event.src_path.lower().endswith(".xlsx") or event.src_path.lower().endswith(".pdf"):
            print(f"[INFO] detected new file: {event.src_path}")
            time.sleep(1.5)
            refresh_dashboard()

    def on_modified(self, event):
        if event.is_directory:
            return
        if event.src_path.lower().endswith(".xlsx") or event.src_path.lower().endswith(".pdf"):
            print(f"[INFO] detected modified file: {event.src_path}")
            time.sleep(1.5)
            refresh_dashboard()


def main() -> None:
    refresh_dashboard()
    observer = Observer()
    observer.schedule(ReportsHandler(), str(REPORTS_DIR), recursive=False)
    observer.start()
    print(f"[INFO] watching {REPORTS_DIR} for XLSX/PDF updates...")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
    observer.join()


if __name__ == "__main__":
    main()
