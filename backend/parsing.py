"""Разбор Excel-отчётов (оценки QC, взыскание, CRM-действия) и PDF-рекомендаций.

Чистые функции: ничего не пишут в БД, получают файл (путь или BytesIO),
возвращают структуру с строками и предупреждениями. Ошибки формата
поднимаются как ParseError с понятным текстом для тимлида.
"""
from __future__ import annotations

import calendar
import datetime as dt
import functools
import io
import math
import re
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd

SVP_KEYS = ["Приветствие", "Этика", "CRM", "Легенда", "Задолж.",
            "Аргумент.", "Манипул.", "Требования", "Итоги"]
WEIGHTS = [0.05, 0.05, 0.10, 0.15, 0.10, 0.20, 0.10, 0.15, 0.10]

MONTHS_RU = {1: "Январь", 2: "Февраль", 3: "Март", 4: "Апрель", 5: "Май", 6: "Июнь",
             7: "Июль", 8: "Август", 9: "Сентябрь", 10: "Октябрь", 11: "Ноябрь", 12: "Декабрь"}
MONTH_PREFIX = {"янв": 1, "фев": 2, "мар": 3, "апр": 4, "май": 5, "мая": 5, "июн": 6,
                "июл": 7, "авг": 8, "сен": 9, "окт": 10, "ноя": 11, "дек": 12}

OPERATOR_WORDS = ("оператор", "сотрудник", "фио")
CRM_MARKERS = ("обещание", "отказ от оплаты", "заявленный платеж", "тишина", "бросил трубку")
TOTAL_WORDS = ("итоги", "итого", "всего", "total")


class ParseError(Exception):
    def __init__(self, message: str, problems: Optional[List[str]] = None):
        super().__init__(message)
        self.message = message
        self.problems = problems or []


# ---------- helpers ----------
def ru_month_label(month: int, year: int) -> str:
    return f"{MONTHS_RU[month]} {year}"


@functools.lru_cache(maxsize=None)
def month_periods(year: int, month: int) -> Tuple[Tuple[int, int], ...]:
    """Периоды месяца как в отчётах QC: недели пн–вс внутри месяца.
    Неполная неделя в 1–2 дня присоединяется к соседней (01-09.08, 24-31.08; 28-30.09 остаётся отдельно)."""
    last = calendar.monthrange(year, month)[1]
    blocks: List[List[int]] = []
    d = 1
    while d <= last:
        end = min(last, d + (6 - dt.date(year, month, d).weekday()))
        blocks.append([d, end])
        d = end + 1
    if len(blocks) > 1 and blocks[0][1] - blocks[0][0] + 1 <= 2:
        blocks[1][0] = blocks[0][0]
        blocks.pop(0)
    if len(blocks) > 1 and blocks[-1][1] - blocks[-1][0] + 1 <= 2:
        blocks[-2][1] = blocks[-1][1]
        blocks.pop()
    return tuple((a, b) for a, b in blocks)


def week_bucket(day: int, year: int, month: int) -> str:
    for a, b in month_periods(year, month):
        if a <= day <= b:
            return f"{a:02d}-{b:02d}"
    return f"{day:02d}-{day:02d}"


def bucket_range(bucket: str, year: int, month: int) -> Tuple[str, str]:
    a, b = bucket.split("-")
    return f"{year}-{month:02d}-{int(a):02d}", f"{year}-{month:02d}-{int(b):02d}"


def _isnull(v: Any) -> bool:
    if v is None:
        return True
    try:
        return bool(pd.isna(v))
    except (TypeError, ValueError):
        return False


def clean_name(v: Any) -> str:
    if _isnull(v):
        return ""
    return re.sub(r"\s+", " ", str(v).replace("\xa0", " ")).strip()


def to_number(v: Any) -> Optional[float]:
    if _isnull(v) or isinstance(v, (dt.date, dt.datetime, dt.time)):
        return None
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        f = float(v)
        return None if math.isnan(f) else f
    s = str(v).replace("\xa0", "").replace(" ", "").replace(",", ".").rstrip("%")
    try:
        return float(s)
    except ValueError:
        return None


def to_date(v: Any) -> Optional[dt.date]:
    if _isnull(v):
        return None
    if isinstance(v, dt.datetime):
        return v.date()
    if isinstance(v, dt.date):
        return v
    if isinstance(v, (int, float)) and 30000 < float(v) < 80000:  # excel serial
        return (dt.datetime(1899, 12, 30) + dt.timedelta(days=int(v))).date()
    s = str(v).strip()
    for fmt in ("%Y-%m-%d", "%d.%m.%Y", "%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d %H:%M:%S"):
        try:
            return dt.datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def duration_minutes(v: Any) -> float:
    """Длительность как в старом апдейтере: ячейка 00:53:00 значит 0:53 (мин:сек)."""
    if _isnull(v):
        return 0.0
    if isinstance(v, dt.timedelta):
        return v.total_seconds() / 3600.0
    if isinstance(v, (dt.time, dt.datetime)):
        h, m, s = float(v.hour), float(v.minute), float(getattr(v, "second", 0))
        return h + m / 60.0 if s == 0 else h * 60.0 + m + s / 60.0
    if isinstance(v, (int, float)):
        f = float(v)
        return f * 24.0 if 0 < f < 1 else f
    parts = [p for p in str(v).strip().split(":") if p.strip()]
    try:
        nums = [float(p) for p in parts]
    except ValueError:
        return 0.0
    if len(nums) == 3:
        return nums[0] + nums[1] / 60.0 if nums[2] == 0 else nums[0] * 60 + nums[1] + nums[2] / 60
    if len(nums) == 2:
        return nums[0] + nums[1] / 60.0
    return nums[0] if nums else 0.0


def format_mmss(minutes: float) -> str:
    if minutes <= 0:
        return "N/A"
    total = int(minutes * 60)
    return f"{total // 60:02d}:{total % 60:02d}"


def _low(v: Any) -> str:
    return clean_name(v).lower()


def _read_sheets(source: Any) -> Dict[str, pd.DataFrame]:
    try:
        return pd.read_excel(source, sheet_name=None, header=None, dtype=object, engine="openpyxl")
    except Exception as exc:  # битый/не-xlsx файл
        raise ParseError("Не удалось открыть файл как Excel (.xlsx). Проверьте, что файл не повреждён.",
                         [str(exc)[:200]])


def _find_header_row(df: pd.DataFrame, test) -> Optional[int]:
    for i in range(min(len(df), 15)):
        cells = [_low(c) for c in df.iloc[i].tolist()]
        if test(cells):
            return i
    return None


# ---------- QC ----------
def _qc_test(cells: List[str]) -> bool:
    joined = " ".join(cells)
    return "итоги" in cells and "аргумент" in joined and "манипул" in joined


def _col(cells: List[str], *keys: str) -> Optional[int]:
    for i, c in enumerate(cells):
        if any(k in c for k in keys):
            return i
    return None


def parse_qc(df: pd.DataFrame, sheet: str) -> Dict[str, Any]:
    h = _find_header_row(df, _qc_test)
    cells = [_low(c) for c in df.iloc[h].tolist()]
    tqs_col = cells.index("итоги")
    name_col = _col(cells, "фио", "сотрудник", "оператор")
    date_col = _col(cells, "дата звонка")
    listen_col = _col(cells, "дата прослуш")
    dur_col = _col(cells, "длительность")
    type_col = _col(cells, "тип звонка")
    client_col = _col(cells, "номер клиента")
    comment_col = next((i for i, c in enumerate(cells) if c.startswith("комментар")), None)
    problems = []
    if name_col is None:
        problems.append("нет колонки «ФИО Сотрудника»")
    if date_col is None and listen_col is None:
        problems.append("нет колонки «Дата звонка» (или «Дата прослушки»)")
    if tqs_col < 9:
        problems.append("перед колонкой «Итоги» должно быть 9 колонок с критериями")
    if problems:
        raise ParseError("Файл похож на оценки звонков, но структура не подходит.", problems)
    crit_cols = list(range(tqs_col - 9, tqs_col))

    rows, skipped, mismatch = [], [], 0
    for i in range(h + 1, len(df)):
        r = df.iloc[i].tolist()
        name = clean_name(r[name_col])
        if not name:
            continue  # служебные строки с весами и пустые строки
        d = to_date(r[date_col]) if date_col is not None else None
        if d is None and listen_col is not None:
            d = to_date(r[listen_col])
        if d is None:
            skipped.append(f"строка {i + 1}: нет даты звонка")
            continue
        scores = [to_number(r[c]) for c in crit_cols]
        if any(s is None for s in scores):
            skipped.append(f"строка {i + 1}: не заполнены критерии")
            continue
        if any(s < 0 or s > 1 for s in scores):
            skipped.append(f"строка {i + 1}: оценка вне диапазона 0–1")
            continue
        calc = sum(s * w for s, w in zip(scores, WEIGHTS))
        tqs = to_number(r[tqs_col])
        if tqs is None:
            tqs = round(calc, 4)
        elif abs(tqs - calc) > 0.02:
            mismatch += 1
        client = ""
        if client_col is not None and not _isnull(r[client_col]):
            client = str(r[client_col]).strip()
        if client.endswith(".0"):
            client = client[:-2]
        rows.append({
            "employee": name,
            "call_date": d.isoformat(),
            "listen_date": (to_date(r[listen_col]).isoformat() if listen_col is not None and to_date(r[listen_col]) else None),
            "client": client,
            "call_type": clean_name(r[type_col]) if type_col is not None else "",
            "duration_min": duration_minutes(r[dur_col]) if dur_col is not None else 0.0,
            "scores": dict(zip(SVP_KEYS, scores)),
            "tqs": float(tqs),
            "comment": clean_name(r[comment_col]) if comment_col is not None else "",
        })
    if not rows:
        raise ParseError("В файле не найдено ни одного корректного оцененного звонка.", skipped[:10])
    warnings = []
    by_month: Dict[str, int] = {}
    for r in rows:
        by_month[r["call_date"][:7]] = by_month.get(r["call_date"][:7], 0) + 1
    if len(by_month) > 1:
        main = max(by_month, key=by_month.get)
        stray = {m: n for m, n in by_month.items() if m != main}
        warnings.append("Есть звонки с датой вне основного месяца файла (" + main[5:] + "." + main[:4] + "): "
                        + ", ".join(f"{m[5:]}.{m[:4]} — {n} шт." for m, n in sorted(stray.items()))
                        + ". Они записаны в свои месяцы по дате звонка.")
    if skipped:
        warnings.append(f"Пропущено строк: {len(skipped)} (первые: {'; '.join(skipped[:3])})")
    if mismatch:
        warnings.append(f"В {mismatch} строках «Итоги» не совпадают с взвешенной суммой критериев (больше 2 п.п.). Данные загружены как в файле.")
    return {"kind": "qc", "sheet": sheet, "rows": rows, "skipped": len(skipped), "warnings": warnings}


# ---------- CRM ----------
def _crm_test(cells: List[str]) -> bool:
    joined = " ".join(cells)
    return sum(1 for m in CRM_MARKERS if m in joined) >= 2


def parse_crm(df: pd.DataFrame, sheet: str, month: Tuple[int, int]) -> Dict[str, Any]:
    h = _find_header_row(df, _crm_test)
    head = [clean_name(c) for c in df.iloc[h].tolist()]
    low = [c.lower() for c in head]
    name_col = next((i for i, c in enumerate(low) if any(w in c for w in OPERATOR_WORDS)), None)
    if name_col is None:
        raise ParseError("Файл похож на CRM-действия, но нет колонки «Оператор» / «Сотрудник» / «ФИО».")
    action_cols = [(i, head[i]) for i in range(len(head)) if i != name_col and head[i]]
    rows = []
    for i in range(h + 1, len(df)):
        r = df.iloc[i].tolist()
        name = clean_name(r[name_col])
        if not name or name.lower() in TOTAL_WORDS:
            continue
        actions, total = {}, 0
        for ci, cname in action_cols:
            n = to_number(r[ci])
            if n:
                actions[cname] = int(n)
                total += int(n)
        if actions:
            rows.append({"employee": name, "month_label": ru_month_label(month[1], month[0]),
                         "actions": actions, "total": total})
    if not rows:
        raise ParseError("В файле CRM-действий нет строк с данными.")
    return {"kind": "crm", "sheet": sheet, "rows": rows, "skipped": 0, "warnings": []}


# ---------- Collection ----------
COLLECTED_KEYS = ("собран", "сбор", "взыскан", "факт", "сумма")
CUM_KEYS = ("с начала", "накоп", "нарастающ", "за месяц", "mtd")
DAILY_KEYS = ("за день", "за сутки", "дневн", "в день", "ежедневн")


def _collection_header(df: pd.DataFrame) -> Optional[int]:
    return _find_header_row(df, lambda cells: any(any(w in c for w in OPERATOR_WORDS) for c in cells))


def _infer_cumulative(points: Dict[Tuple[str, str], List[Tuple[str, float]]]) -> bool:
    """Если у операторов суммы по датам почти всегда не убывают — это накопленные с начала месяца."""
    cum = day = 0
    for pts in points.values():
        if len(pts) < 3:
            continue
        vals = [v for _, v in sorted(pts)]
        if all(b >= a for a, b in zip(vals, vals[1:])):
            cum += 1
        else:
            day += 1
    return cum >= day


def parse_collection(df: pd.DataFrame, sheet: str, report_date: Optional[dt.date], amount_type: str = "auto") -> Dict[str, Any]:
    h = _collection_header(df)
    if h is None:
        raise ParseError("Не нашёл колонку «Оператор». Нужны колонки: Оператор, Дата, Собрано, План.")
    head = [_low(c) for c in df.iloc[h].tolist()]
    name_col = next(i for i, c in enumerate(head) if any(w in c for w in OPERATOR_WORDS))
    plan_col = next((i for i, c in enumerate(head) if "план" in c), None)
    date_col = next((i for i, c in enumerate(head) if c.startswith("дата") and i != name_col), None)
    used = {name_col, plan_col, date_col}
    cum_col = next((i for i, c in enumerate(head) if i not in used and any(k in c for k in CUM_KEYS)), None)
    used.add(cum_col)
    day_col = next((i for i, c in enumerate(head) if i not in used and any(k in c for k in DAILY_KEYS)), None)
    used.add(day_col)
    gen_col = next((i for i, c in enumerate(head) if i not in used and any(k in c for k in COLLECTED_KEYS)), None)
    body = df.iloc[h + 1:]
    if cum_col is None and day_col is None and gen_col is None:  # выгрузка вроде Qlik: оператор + одна колонка с суммами
        numeric = [i for i in range(df.shape[1]) if i not in used
                   and sum(to_number(v) is not None for v in body.iloc[:, i].tolist()) >= 2]
        if len(numeric) == 1:
            gen_col = numeric[0]
        else:
            raise ParseError("Не понял, в какой колонке сумма сбора. Назовите её «Собрано» (накопленная с начала месяца) "
                             "или «За день».", [f"найденные колонки: {[c for c in head if c]}"])
    warnings: List[str] = []
    if date_col is None and report_date is None:
        report_date = dt.date.today()
        warnings.append(f"В файле нет колонки «Дата», дата не указана. Взята сегодняшняя дата {report_date.strftime('%d.%m.%Y')}.")
    raw = []
    skipped = 0
    for i in range(h + 1, len(df)):
        r = df.iloc[i].tolist()
        name = clean_name(r[name_col])
        if not name or name.lower() in TOTAL_WORDS:
            continue
        d = to_date(r[date_col]) if date_col is not None else report_date
        cum_v = to_number(r[cum_col]) if cum_col is not None else None
        day_v = to_number(r[day_col]) if day_col is not None else None
        gen_v = to_number(r[gen_col]) if gen_col is not None else None
        if d is None or (cum_v is None and day_v is None and gen_v is None):
            skipped += 1
            continue
        plan = to_number(r[plan_col]) if plan_col is not None else None
        raw.append({"employee": name, "date": d, "cum": cum_v, "day": day_v, "gen": gen_v, "plan": plan or 0.0})
    if not raw:
        raise ParseError("В файле взыскания не найдено ни одной строки с суммой.")
    gen_is_cum = True
    if gen_col is not None:
        if amount_type == "daily":
            gen_is_cum = False
        elif amount_type == "cumulative":
            gen_is_cum = True
        else:
            pts: Dict[Tuple[str, str], List[Tuple[str, float]]] = {}
            for x in raw:
                if x["gen"] is not None:
                    pts.setdefault((x["employee"], x["date"].strftime("%Y-%m")), []).append((x["date"].isoformat(), x["gen"]))
            gen_is_cum = _infer_cumulative(pts)
            warnings.append("Суммы в колонке «" + clean_name(df.iloc[h, gen_col]) + "» определены автоматически как "
                            + ("накопленные с начала месяца" if gen_is_cum else "за один день")
                            + ". Если это не так, выберите тип сумм в окне загрузки и загрузите файл снова.")
    rows = []
    for x in raw:
        collected = x["cum"] if x["cum"] is not None else (x["gen"] if gen_col is not None and gen_is_cum else None)
        daily = x["day"] if x["day"] is not None else (x["gen"] if gen_col is not None and not gen_is_cum else None)
        d = x["date"]
        rows.append({"employee": x["employee"], "report_date": d.isoformat(), "month_label": ru_month_label(d.month, d.year),
                     "collected": collected, "daily": daily, "plan": x["plan"]})
    if skipped:
        warnings.append(f"Пропущено строк без суммы или даты: {skipped}")
    if plan_col is None:
        warnings.append("Колонки «План» нет: процент выполнения плана считаться не будет.")
    return {"kind": "collection", "sheet": sheet, "rows": rows, "skipped": skipped, "warnings": warnings}


# ---------- dispatcher ----------
def parse_excel(source: Any, filename: str = "", report_date: Optional[dt.date] = None,
                amount_type: str = "auto") -> Dict[str, Any]:
    sheets = _read_sheets(source)
    for name, df in sheets.items():
        if df.empty:
            continue
        if _find_header_row(df, _qc_test) is not None:
            return parse_qc(df, name)
    for name, df in sheets.items():
        if df.empty:
            continue
        if _find_header_row(df, _crm_test) is not None:
            month = _month_for_crm(filename, report_date)
            res = parse_crm(df, name, month)
            if report_date is None and not _month_in_name(filename):
                res["warnings"].append(f"Месяц не указан, взят текущий: {res['rows'][0]['month_label']}.")
            return res
    for name, df in sheets.items():
        if df.empty:
            continue
        if _collection_header(df) is not None:
            return parse_collection(df, name, report_date, amount_type)
    raise ParseError("Не удалось определить тип отчёта. Поддерживаются: оценки звонков (QC), "
                     "взыскание (Оператор, Дата, Собрано, План), CRM-действия.")


def _month_in_name(filename: str) -> Optional[Tuple[int, int]]:
    m = re.search(r"(?<!\d)(\d{2})\.(\d{2})\.(\d{4})", filename)
    if m:
        return int(m.group(3)), int(m.group(2))
    m = re.search(r"(?<!\d)(\d{2})\.(\d{4})(?!\d)", filename)
    if m:
        return int(m.group(2)), int(m.group(1))
    m = re.search(r"(\d{4})-(\d{2})(?!\d)", filename)
    if m:
        return int(m.group(1)), int(m.group(2))
    return None


def _month_for_crm(filename: str, report_date: Optional[dt.date]) -> Tuple[int, int]:
    if report_date:
        return report_date.year, report_date.month
    found = _month_in_name(filename)
    if found:
        return found
    t = dt.date.today()
    return t.year, t.month


# ---------- PDF ----------
PDF_SPLIT = re.compile(r"Отч[её]т\s+по\s+сотруднику\s*[:：]", re.IGNORECASE)
_MARK = re.compile(r"^(?:[•◦▪●]|o)\s+(.*)$")
_LONE = re.compile(r"^[•◦▪●]$")


def pdf_period_from_text(text: str) -> Optional[Tuple[int, int, int, int]]:
    """-> (год, месяц, день начала, день конца) из строки «за период: 01–09.08.2026»."""
    m = re.search(r"за\s+период\s*[:：]?\s*(\d{2})\s*[–—-]\s*(\d{2})\.(\d{2})\.(\d{4})", text, flags=re.IGNORECASE)
    if m:
        return int(m.group(4)), int(m.group(3)), int(m.group(1)), int(m.group(2))
    return None


def pdf_period_from_name(filename: str) -> Optional[Tuple[int, int, int, int]]:
    """-> (год, месяц, день начала, день конца) из имени файла: 13.04.2026 - 19.04.2026, 13-19.04.2026, 10_16_08_2026."""
    m = re.search(r"(\d{2})\.(\d{2})\.(\d{4})\s*-\s*(\d{2})\.(\d{2})\.(\d{4})", filename)
    if m:
        return int(m.group(3)), int(m.group(2)), int(m.group(1)), int(m.group(4))
    m = re.search(r"(?<!\d)(\d{2})[-_](\d{2})[._-](\d{2})[._](\d{4})", filename)
    if m:
        return int(m.group(4)), int(m.group(3)), int(m.group(1)), int(m.group(2))
    return None


def _bullets(text: str) -> str:
    items: List[str] = []
    for ln in text.splitlines():
        ln = ln.strip()
        if not ln or _LONE.match(ln):
            continue
        m = _MARK.match(ln)
        if m:
            items.append(m.group(1).strip())
        elif items:
            items[-1] += " " + ln
        else:
            items.append(ln)
    return "\n".join("• " + i for i in items)


def parse_pdf_text(text: str) -> List[Dict[str, str]]:
    out = []
    for part in PDF_SPLIT.split(text)[1:]:
        lines = [ln for ln in part.splitlines()]
        first = next((i for i, ln in enumerate(lines) if ln.strip()), None)
        if first is None:
            continue
        name = clean_name(lines[first])
        body = "\n".join(lines[first + 1:])
        for marker in ("Сводная таблица баллов", "Средний балл по сотрудникам за период"):
            idx = body.find(marker)
            if idx != -1:
                body = body[:idx]
        tend = re.search(r"Тенденции[^\n]*\n(.*?)(?=\n\s*3\.\s*Рекомендации|\Z)", body, flags=re.S)
        rec = re.search(r"Рекомендации для Лида[^\n]*\n(.*)\Z", body, flags=re.S)
        out.append({"employee": name, "tendencies": _bullets(tend.group(1)) if tend else "",
                    "rec": _bullets(rec.group(1)) if rec else ""})
    return out


def parse_pdf(content: bytes) -> Dict[str, Any]:
    import pdfplumber
    try:
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            text = "\n".join(p.extract_text() or "" for p in pdf.pages)
    except Exception as exc:
        raise ParseError("Не удалось прочитать PDF.", [str(exc)[:200]])
    items = parse_pdf_text(text)
    if not items:
        raise ParseError("В PDF не найдены разделы «Отчёт по сотруднику». Загружаются только еженедельные (промежуточные) отчёты по сотрудникам; "
                         "итоговые месячные документы не разбираются.")
    return {"items": items, "period": pdf_period_from_text(text)}
