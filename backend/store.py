"""Запись данных в БД, сотрудники и их имена, выборки для API."""
from __future__ import annotations

import datetime as dt
import io
import re
from collections import defaultdict
from difflib import SequenceMatcher
from statistics import mean
from typing import Any, Dict, List, Optional, Set, Tuple

from sqlalchemy import delete, insert, select, update

import parsing as P
from db import (collection_scores, crm_actions, employee_info, employee_scores, name_aliases,
                not_same, qc_calls, staff, upload_log)

# латиница из старого апдейтера -> кириллица
LEGACY_NAME_MAP = {
    "Toshtemirov Mukhammadali": "Тоштемиров Мухаммадали", "Abdullaeva Sevinch": "Абдуллаева Севинч",
    "Alkarov Zhamshid": "Алкаров Жамшид", "Bakhromova Nozima": "Бахромова Нозима",
    "Boborakhmatov Sanyatbek": "Боборахматов Санъатбек", "Isakov Davron": "Исаков Даврон",
    "Kayumova Soniya": "Каюмова Сония", "Kurolboev Zhavokhir": "Куролбоев Жавохир",
    "Mamaraimov Firdavs": "Мамараимов Фирдавс", "Musaev Khurshid": "Мусаев Хуршид",
    "Nadrullaeva Rukhsona": "Надруллаева Рухсона", "Nizomiddinov Asliddin": "Низомиддинов Аслиддин",
    "Rakhimzhonov Nodirzhon": "Рахимжонов Нодиржон", "Sabitova Navruza": "Сабитова Навруза",
    "Saburov Ogabek": "Сабуров Оғабек", "Tozhiev Shokhrukh": "Тожиев Шохрух",
    "Khakimov Umid": "Хакимов Умид", "Shamiev Farrukh": "Шамиев Фаррух",
    "Shoknazarova Sabrina": "Шохназарова Сабрина", "Abduvalieva Zarifa": "Абдувалиева Зарифа",
    "Komoldinov Diyorbek": "Комолдинов Диёрбек", "Shavkatov Gofur": "Шавкатов Гофур",
    "Makhmudzhonov Ibrokhim": "Махмуджонов Иброхим", "Mirkamalov Boburzhon": "Миркамалов Бобуржон",
    "Mirkhamidov Samandar": "Мирхамидов Самандар", "Khasanova Madinabonu": "Хасанова Мадинабону",
    "Sherkulov Azamat": "Шеркулов Азамат",
}
_FOLD = str.maketrans({"ё": "е", "ғ": "г", "қ": "к", "ў": "у", "ҳ": "х", "ъ": "", "ь": "",
                       "'": "", "’": "", "ʼ": "", "`": ""})
SIM_THRESHOLD = 0.85
FLAT = 0.01  # изменение TQS меньше 1 п.п. считаем «без изменений»


def now():
    return dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)


def name_key(name: str) -> str:
    return re.sub(r"\s+", " ", P.clean_name(name).lower().translate(_FOLD)).strip()


def similarity(ka: str, kb: str) -> float:
    """0 — разные люди; иначе похожесть. Одинаковые ключи сюда не попадают."""
    ta, tb = ka.split(), kb.split()
    if len(ta) < 2 or len(tb) < 2:
        return 0.0
    if ta[0] == tb[1] and ta[1] == tb[0]:
        return 0.95
    s = SequenceMatcher(None, ta[0], tb[0]).ratio()
    f1, f2 = ta[1], tb[1]
    prefix = f1 == f2 or (min(len(f1), len(f2)) >= 3 and (f1.startswith(f2) or f2.startswith(f1)))
    fr = SequenceMatcher(None, f1, f2).ratio()
    if s >= SIM_THRESHOLD and (prefix or fr >= 0.9):
        return (s + (1.0 if prefix else fr)) / 2
    return 0.0


class Names:
    """Приводит имя из файла к имени из списка сотрудников; новых добавляет."""

    def __init__(self, conn):
        self.conn = conn
        self.staff: Dict[str, Dict[str, Any]] = {}       # key -> {name, active}
        for r in conn.execute(select(staff.c.name, staff.c.active)):
            self.staff[name_key(r.name)] = {"name": r.name, "active": bool(r.active)}
        self.alias = {r.alias_key: r.canonical for r in conn.execute(select(name_aliases))}
        self.not_same = {frozenset((name_key(r.name_a), name_key(r.name_b)))
                         for r in conn.execute(select(not_same))}
        self.cache: Dict[str, str] = {}
        self.new: List[str] = []
        self.suspects: List[Dict[str, str]] = []
        self.inactive: Set[str] = set()

    def find(self, raw: str) -> Optional[str]:
        key = name_key(raw)
        if key in self.alias:
            return self.alias[key]
        if key in self.staff:
            return self.staff[key]["name"]
        return None

    def resolve(self, raw: str) -> str:
        if raw in self.cache:
            return self.cache[raw]
        found = self.find(raw)
        if found is None:
            found = P.clean_name(raw)
            key = name_key(found)
            best, best_s = None, 0.0
            for k, v in self.staff.items():
                if frozenset((key, k)) in self.not_same:
                    continue
                s = similarity(key, k)
                if s > best_s:
                    best, best_s = v["name"], s
            self.conn.execute(insert(staff).values(name=found, active=True, created_at=now()))
            self.staff[key] = {"name": found, "active": True}
            self.new.append(found)
            if best:
                self.suspects.append({"name": found, "similar_to": best})
        if not self.staff.get(name_key(found), {"active": True})["active"]:
            self.inactive.add(found)
        self.cache[raw] = found
        return found


def seed(conn):
    """Идемпотентно: заполняет список сотрудников из уже имеющихся данных и старой латиницы."""
    have = {r.name for r in conn.execute(select(staff.c.name))}
    found: Set[str] = set()
    for tbl, col in ((employee_scores, "employee_name"), (collection_scores, "employee_name"),
                     (crm_actions, "employee_name"), (qc_calls, "employee_name")):
        for r in conn.execute(select(tbl.c[col]).distinct()):
            if r[0] and "Промежуточный" not in r[0]:
                found.add(P.clean_name(r[0]))
    for n in sorted(found - have):
        conn.execute(insert(staff).values(name=n, active=True, created_at=now()))
    have_alias = {r.alias_key for r in conn.execute(select(name_aliases.c.alias_key))}
    for lat, cyr in LEGACY_NAME_MAP.items():
        k = name_key(lat)
        if k not in have_alias:
            conn.execute(insert(name_aliases).values(alias_key=k, canonical=cyr))


# ---------- запись ----------
def _month_year(iso: str) -> Tuple[int, int]:
    d = dt.date.fromisoformat(iso)
    return d.year, d.month


def recompute_scores(conn, touched: Set[Tuple[str, int, int, str]]):
    """Пересчитывает агрегаты employee_scores (то, что читают страницы) по оценённым звонкам."""
    for emp, y, m, bucket in touched:
        a, b = P.bucket_range(bucket, y, m)
        calls = conn.execute(select(qc_calls).where(
            qc_calls.c.employee_name == emp, qc_calls.c.call_date >= a, qc_calls.c.call_date <= b
        ).order_by(qc_calls.c.call_date, qc_calls.c.id)).fetchall()
        if not calls:
            continue
        label = P.ru_month_label(m, y)
        vals = dict(
            tqs=round(mean(c.tqs for c in calls), 4),
            aht=P.format_mmss(mean(c.duration_min or 0 for c in calls)),
            activity_count=len(calls),
            svp_scores={k: round(mean(c.scores[k] for c in calls), 4) for k in P.SVP_KEYS},
            raw_scores={k: [c.scores[k] for c in calls] for k in P.SVP_KEYS},
            updated_at=now(),
        )
        ex = conn.execute(select(employee_scores.c.id).where(
            employee_scores.c.employee_name == emp, employee_scores.c.month == label,
            employee_scores.c.period == bucket)).first()
        if ex:
            conn.execute(update(employee_scores).where(employee_scores.c.id == ex[0]).values(**vals))
        else:
            conn.execute(insert(employee_scores).values(
                employee_name=emp, month=label, period=bucket, tendencies="", recommendations="",
                created_at=now(), **vals))


def save_qc(conn, parsed, filename) -> Dict[str, Any]:
    names = Names(conn)
    counter: Dict[Tuple, int] = defaultdict(int)
    prepared = []
    for r in parsed["rows"]:
        emp = names.resolve(r["employee"])
        k = (emp, r["call_date"], r["client"])
        prepared.append((emp, counter[k], r))
        counter[k] += 1
    emps = {p[0] for p in prepared}
    existing = {(x.employee_name, x.call_date, x.client, x.seq): x.id for x in conn.execute(
        select(qc_calls.c.id, qc_calls.c.employee_name, qc_calls.c.call_date, qc_calls.c.client,
               qc_calls.c.seq).where(qc_calls.c.employee_name.in_(emps)))}
    new_rows, updated, touched = [], 0, set()
    for emp, seq, r in prepared:
        vals = dict(employee_name=emp, call_date=r["call_date"], listen_date=r["listen_date"],
                    client=r["client"], seq=seq, call_type=r["call_type"], duration_min=r["duration_min"],
                    scores=r["scores"], tqs=r["tqs"], comment=r["comment"], source_file=filename,
                    updated_at=now())
        key = (emp, r["call_date"], r["client"], seq)
        if key in existing:
            conn.execute(update(qc_calls).where(qc_calls.c.id == existing[key]).values(**vals))
            updated += 1
        else:
            new_rows.append(dict(vals, created_at=now()))
        d = dt.date.fromisoformat(r["call_date"])
        touched.add((emp, d.year, d.month, P.week_bucket(d.day, d.year, d.month)))
    if new_rows:
        conn.execute(insert(qc_calls), new_rows)
    recompute_scores(conn, touched)
    dates = sorted(r["call_date"] for r in parsed["rows"])
    periods = sorted({f"{P.ru_month_label(m, y)} · {b}" for _, y, m, b in touched})
    return _summary("qc", filename, names, parsed, saved=len(new_rows), updated=updated,
                    operators=len(emps), date_from=dates[0], date_to=dates[-1], periods=periods)


def save_collection(conn, parsed, filename) -> Dict[str, Any]:
    names = Names(conn)
    latest: Dict[Tuple[str, str], Dict[str, Any]] = {}
    for r in parsed["rows"]:
        key = (names.resolve(r["employee"]), r["report_date"])
        prev = latest.get(key)
        if prev:  # две строки за один день у одного оператора: последние непустые значения побеждают
            r = dict(r, collected=r["collected"] if r["collected"] is not None else prev["collected"],
                     daily=r["daily"] if r["daily"] is not None else prev["daily"])
        latest[key] = r
    emps = {k[0] for k in latest}
    existing = {(x.employee_name, x.report_date): x.id for x in conn.execute(
        select(collection_scores.c.id, collection_scores.c.employee_name,
               collection_scores.c.report_date).where(collection_scores.c.employee_name.in_(emps)))}
    new_rows, updated = [], 0
    for (emp, d), r in latest.items():
        vals = dict(employee_name=emp, report_date=d, month_label=r["month_label"],
                    plan_amount=r["plan"], updated_at=now())
        if r["collected"] is not None:
            vals["collected_amount"] = r["collected"]
        if r["daily"] is not None:
            vals["daily_amount"] = r["daily"]
        if (emp, d) in existing:
            conn.execute(update(collection_scores).where(collection_scores.c.id == existing[(emp, d)]).values(**vals))
            updated += 1
        else:
            new_rows.append(dict(vals, created_at=now()))
    if new_rows:
        conn.execute(insert(collection_scores), [dict({"collected_amount": None, "daily_amount": None}, **v) for v in new_rows])
    dates = sorted(k[1] for k in latest)
    return _summary("collection", filename, names, parsed, saved=len(new_rows), updated=updated,
                    operators=len(emps), date_from=dates[0], date_to=dates[-1])


def save_crm(conn, parsed, filename) -> Dict[str, Any]:
    names = Names(conn)
    saved = updated = 0
    for r in parsed["rows"]:
        emp = names.resolve(r["employee"])
        ex = conn.execute(select(crm_actions.c.id).where(
            crm_actions.c.employee_name == emp, crm_actions.c.month_label == r["month_label"])).first()
        vals = dict(actions=r["actions"], total_actions=r["total"], updated_at=now())
        if ex:
            conn.execute(update(crm_actions).where(crm_actions.c.id == ex[0]).values(**vals))
            updated += 1
        else:
            conn.execute(insert(crm_actions).values(employee_name=emp, month_label=r["month_label"],
                                                    created_at=now(), **vals))
            saved += 1
    return _summary("crm", filename, names, parsed, saved=saved, updated=updated,
                    operators=len({r["employee"] for r in parsed["rows"]}),
                    month=parsed["rows"][0]["month_label"])


def save_pdf(conn, parsed_pdf, filename) -> Dict[str, Any]:
    items = parsed_pdf["items"]
    period = parsed_pdf.get("period") or P.pdf_period_from_name(filename)
    if not period:
        raise P.ParseError("Не удалось определить период отчёта: в PDF нет строки «за период: ДД–ДД.ММ.ГГГГ», "
                           "а в имени файла нет дат.")
    y, m, start, end = period
    label = P.ru_month_label(m, y)
    wanted = f"{start:02d}-{end:02d}"
    names = Names(conn)
    done, unmatched = 0, []
    for it in items:
        emp = names.find(it["employee"])
        if not emp:
            unmatched.append(it["employee"])
            continue
        rows = conn.execute(select(employee_scores.c.id, employee_scores.c.period).where(
            employee_scores.c.employee_name == emp, employee_scores.c.month == label)).fetchall()
        if not rows:
            unmatched.append(f"{it['employee']} (нет оценок за {label})")
            continue
        exact = [r for r in rows if r.period == wanted]
        best = exact[0] if exact else min(rows, key=lambda r: abs(int(r.period.split("-")[0]) - start))
        vals = {}
        if it["tendencies"]:
            vals["tendencies"] = it["tendencies"]
        if it["rec"]:
            vals["recommendations"] = it["rec"]
        if vals:
            conn.execute(update(employee_scores).where(employee_scores.c.id == best.id).values(**vals))
            done += 1
    warnings = [f"Не привязано к оценкам ({len(unmatched)}): {', '.join(unmatched[:6])}"
                + (" и др." if len(unmatched) > 6 else "")] if unmatched else []
    return {"kind": "pdf", "filename": filename, "rows_read": len(items), "rows_saved": done,
            "rows_updated": 0, "operators": done, "new_operators": [], "possible_duplicates": [],
            "warnings": warnings,
            "message": f"PDF за {wanted}.{m:02d}.{y}: рекомендации и тенденции добавлены {done} сотрудникам."
                       + (" Сначала загрузите Excel с оценками за этот месяц." if done == 0 else "")}


def _summary(kind, filename, names: Names, parsed, saved, updated, operators, **extra):
    warnings = list(parsed.get("warnings", []))
    if names.inactive:
        warnings.append("Неактивные сотрудники (данные загружены, но в рейтинге не показаны): "
                        + ", ".join(sorted(names.inactive)))
    s = {"kind": kind, "filename": filename, "rows_read": len(parsed["rows"]), "rows_saved": saved,
         "rows_updated": updated, "operators": operators, "new_operators": names.new,
         "possible_duplicates": names.suspects, "warnings": warnings}
    s.update(extra)
    label = {"qc": "Оценки звонков", "collection": "Взыскание", "crm": "CRM-действия"}[kind]
    unit = {"qc": "звонков", "collection": "записей", "crm": "записей"}[kind]
    msg = f"{label}: прочитано {len(parsed['rows'])} {unit}, операторов {operators}"
    if "date_from" in extra:
        a, b = extra["date_from"], extra["date_to"]
        msg += f", даты {a[8:]}.{a[5:7]}–{b[8:]}.{b[5:7]}.{b[:4]}" if a != b else f", дата {b[8:]}.{b[5:7]}.{b[:4]}"
    if "month" in extra:
        msg += f", {extra['month']}"
    msg += f". Новых: {saved}, обновлено: {updated}."
    if names.new:
        shown = ", ".join(names.new[:6]) + (f" и ещё {len(names.new) - 6}" if len(names.new) > 6 else "")
        msg += f" Новые сотрудники: {shown}."
    if names.suspects:
        msg += " Возможные дубли имён — проверьте на странице «Сотрудники»."
    s["message"] = msg
    return s


def process_upload(engine, content: bytes, filename: str, report_date: Optional[dt.date],
                   amount_type: str = "auto") -> Dict[str, Any]:
    pdf = None
    parsed = None
    if filename.lower().endswith(".pdf"):
        pdf = P.parse_pdf(content)
    else:
        parsed = P.parse_excel(io.BytesIO(content), filename, report_date, amount_type)
    with engine.begin() as conn:
        if pdf is not None:
            summary = save_pdf(conn, pdf, filename)
        elif parsed["kind"] == "qc":
            summary = save_qc(conn, parsed, filename)
        elif parsed["kind"] == "collection":
            summary = save_collection(conn, parsed, filename)
        else:
            summary = save_crm(conn, parsed, filename)
        conn.execute(insert(upload_log).values(filename=filename, kind=summary["kind"],
                                               summary=summary, created_at=now()))
    return summary


# ---------- сотрудники ----------
def duplicate_pairs(conn) -> List[Dict[str, str]]:
    rows = [(r.name, name_key(r.name)) for r in conn.execute(select(staff.c.name))]
    ns = {frozenset((name_key(r.name_a), name_key(r.name_b))) for r in conn.execute(select(not_same))}
    out = []
    for i in range(len(rows)):
        for j in range(i + 1, len(rows)):
            if frozenset((rows[i][1], rows[j][1])) in ns:
                continue
            if similarity(rows[i][1], rows[j][1]) > 0:
                out.append({"a": rows[i][0], "b": rows[j][0]})
    return out


def staff_list(conn) -> Dict[str, Any]:
    last_call = dict(conn.execute(select(qc_calls.c.employee_name, func_max(qc_calls.c.call_date))
                                  .group_by(qc_calls.c.employee_name)).fetchall())
    last_coll = dict(conn.execute(select(collection_scores.c.employee_name, func_max(collection_scores.c.report_date))
                                  .group_by(collection_scores.c.employee_name)).fetchall())
    items = [{"name": r.name, "active": bool(r.active), "last_call_date": last_call.get(r.name),
              "last_collection_date": last_coll.get(r.name)}
             for r in conn.execute(select(staff.c.name, staff.c.active).order_by(staff.c.name))]
    return {"items": items, "total": len(items), "possible_duplicates": duplicate_pairs(conn)}


def func_max(col):
    from sqlalchemy import func
    return func.max(col)


def add_staff(conn, name: str) -> str:
    name = P.clean_name(name)
    if len(name) < 3:
        raise ValueError("Укажите фамилию и имя.")
    n = Names(conn)
    if n.find(name):
        raise ValueError(f"Такой сотрудник уже есть: {n.find(name)}")
    conn.execute(insert(staff).values(name=name, active=True, created_at=now()))
    return name


def set_active(conn, name: str, active: bool):
    r = conn.execute(update(staff).where(staff.c.name == name).values(active=active))
    if r.rowcount == 0:
        raise ValueError("Сотрудник не найден.")


def dismiss_pair(conn, a: str, b: str):
    conn.execute(insert(not_same).values(name_a=a, name_b=b))


def merge_staff(conn, source: str, target: str):
    """Все данные source переходят к target; при конфликте остаётся запись target."""
    if source == target:
        raise ValueError("Нужны два разных сотрудника.")
    have = {r.name for r in conn.execute(select(staff.c.name))}
    if source not in have or target not in have:
        raise ValueError("Сотрудник не найден.")
    specs = [(employee_scores, ("month", "period")), (qc_calls, ("call_date", "client", "seq")),
             (collection_scores, ("report_date",)), (crm_actions, ("month_label",))]
    for tbl, keys in specs:
        tgt = {tuple(getattr(r, k) for k in keys) for r in conn.execute(
            select(*[tbl.c[k] for k in keys]).where(tbl.c.employee_name == target))}
        for r in conn.execute(select(tbl.c.id, *[tbl.c[k] for k in keys]).where(tbl.c.employee_name == source)).fetchall():
            if tuple(getattr(r, k) for k in keys) in tgt:
                conn.execute(delete(tbl).where(tbl.c.id == r.id))
            else:
                conn.execute(update(tbl).where(tbl.c.id == r.id).values(employee_name=target))
    conn.execute(delete(name_aliases).where(name_aliases.c.canonical == source))
    conn.execute(update(name_aliases).where(name_aliases.c.canonical == source).values(canonical=target))
    ak = name_key(source)
    if not conn.execute(select(name_aliases.c.id).where(name_aliases.c.alias_key == ak)).first():
        conn.execute(insert(name_aliases).values(alias_key=ak, canonical=target))
    conn.execute(delete(staff).where(staff.c.name == source))


def active_names(conn) -> Optional[Set[str]]:
    """Имена активных сотрудников; None — список сотрудников ещё пуст (фильтровать нечем)."""
    rows = conn.execute(select(staff.c.name, staff.c.active)).fetchall()
    if not rows:
        return None
    return {r.name for r in rows if r.active}


# ---------- выборки ----------
def metrics(conn) -> Dict[str, Any]:
    act = active_names(conn)
    data: Dict[str, Any] = {}
    for r in conn.execute(select(employee_scores).order_by(employee_scores.c.employee_name,
                                                           employee_scores.c.month.desc(),
                                                           employee_scores.c.period.desc())):
        if act is not None and r.employee_name not in act:
            continue
        emp = data.setdefault(r.employee_name, {"months": {}})
        emp["months"].setdefault(r.month, {"periods": []})["periods"].append({
            "period": r.period, "tqs": r.tqs or 0.0, "aht": r.aht or "N/A", "svp": r.svp_scores or {},
            "raw_scores": r.raw_scores or {}, "tendencies": r.tendencies or "",
            "rec": r.recommendations or "", "activity_count": r.activity_count or 0})
    for e in data.values():
        for m in e["months"].values():
            m["periods"].sort(key=lambda x: x["period"])
    return data


def collection(conn) -> Dict[str, Any]:
    """{оператор: {daily: [{date, month_label, collected (накопленно с начала месяца), daily (за день или None), plan}]}}"""
    act = active_names(conn)
    data: Dict[str, Any] = {}
    running: Dict[Tuple[str, str], float] = {}
    for r in conn.execute(select(collection_scores).order_by(collection_scores.c.employee_name,
                                                             collection_scores.c.report_date.asc())):
        if act is not None and r.employee_name not in act:
            continue
        key = (r.employee_name, r.month_label)
        if r.collected_amount is not None:
            cum = r.collected_amount
            running[key] = cum
        else:  # в файле были только суммы за день: накопленное считаем нарастающим итогом
            cum = running.get(key, 0.0) + (r.daily_amount or 0.0)
            running[key] = cum
        data.setdefault(r.employee_name, {"daily": []})["daily"].append({
            "date": r.report_date, "month_label": r.month_label, "collected": cum,
            "daily": r.daily_amount, "plan": r.plan_amount or 0.0})
    return data


def crm(conn) -> Dict[str, Any]:
    act = active_names(conn)
    data: Dict[str, Any] = {}
    for r in conn.execute(select(crm_actions).order_by(crm_actions.c.employee_name, crm_actions.c.month_label)):
        if act is not None and r.employee_name not in act:
            continue
        data.setdefault(r.employee_name, {})[r.month_label] = {"actions": r.actions or {},
                                                                "total": r.total_actions or 0}
    return data


def _trend(delta: Optional[float]) -> str:
    if delta is None:
        return "none"
    return "up" if delta > FLAT else "down" if delta < -FLAT else "flat"


def _group_stats(calls) -> Dict[str, Any]:
    crit = {k: round(mean(c.scores[k] for c in calls), 4) for k in P.SVP_KEYS}
    weak = [k for k, v in sorted(crit.items(), key=lambda kv: kv[1]) if v < 0.75][:3]
    return {"calls": len(calls), "tqs": round(mean(c.tqs for c in calls), 4),
            "aht": P.format_mmss(mean(c.duration_min or 0 for c in calls)),
            "criteria": crit, "weak": weak,
            "critical_calls": sum(1 for c in calls if any(v == 0 for v in c.scores.values()))}


def qc_daily(conn, employee: Optional[str], date_from: Optional[str], date_to: Optional[str]) -> Dict[str, Any]:
    q = select(qc_calls).order_by(qc_calls.c.call_date, qc_calls.c.id)
    if employee:
        q = q.where(qc_calls.c.employee_name == employee)
    if date_from:
        q = q.where(qc_calls.c.call_date >= date_from)
    if date_to:
        q = q.where(qc_calls.c.call_date <= date_to)
    calls = conn.execute(q).fetchall()
    if not employee:
        act = active_names(conn)
        calls = [c for c in calls if act is None or c.employee_name in act]
    by_day, by_week = defaultdict(list), defaultdict(list)
    for c in calls:
        by_day[c.call_date].append(c)
        y, w, _ = dt.date.fromisoformat(c.call_date).isocalendar()
        by_week[(y, w)].append(c)
    days, prev = [], None
    for d in sorted(by_day):
        st = _group_stats(by_day[d])
        st.update(date=d, delta=None if prev is None else round(st["tqs"] - prev, 4))
        st["trend"] = _trend(st["delta"])
        prev = st["tqs"]
        days.append(st)
    weeks, prev = [], None
    for key in sorted(by_week):
        st = _group_stats(by_week[key])
        monday = dt.date.fromisocalendar(key[0], key[1], 1)
        st.update(week_start=monday.isoformat(), week_end=(monday + dt.timedelta(days=6)).isoformat(),
                  delta=None if prev is None else round(st["tqs"] - prev, 4))
        st["trend"] = _trend(st["delta"])
        prev = st["tqs"]
        weeks.append(st)
    return {"employee": employee, "days": days, "weeks": weeks}


def qc_calls_for_day(conn, employee: str, date: str) -> List[Dict[str, Any]]:
    rows = conn.execute(select(qc_calls).where(qc_calls.c.employee_name == employee,
                                               qc_calls.c.call_date == date).order_by(qc_calls.c.id)).fetchall()
    return [{"client": r.client, "call_type": r.call_type, "duration": P.format_mmss(r.duration_min or 0),
             "tqs": r.tqs, "scores": r.scores, "comment": r.comment or "",
             "listen_date": r.listen_date} for r in rows]


def status(conn) -> Dict[str, Any]:
    from sqlalchemy import func
    qc_last = conn.execute(select(func.max(qc_calls.c.call_date), func.count(qc_calls.c.id))).first()
    coll_last = conn.execute(select(func.max(collection_scores.c.report_date))).scalar()
    log = conn.execute(select(upload_log).order_by(upload_log.c.id.desc()).limit(8)).fetchall()
    return {"qc": {"last_call_date": qc_last[0], "calls": qc_last[1]},
            "collection": {"last_report_date": coll_last},
            "uploads": [{"filename": r.filename, "kind": r.kind, "at": r.created_at.isoformat() + "Z",
                         "message": (r.summary or {}).get("message", "")} for r in log]}


def qc_day_summary(conn, date: str) -> List[Dict[str, Any]]:
    """Все операторы за один день: сколько звонков, средний TQS, слабые критерии."""
    act = active_names(conn)
    by_emp = defaultdict(list)
    for c in conn.execute(select(qc_calls).where(qc_calls.c.call_date == date)):
        if act is None or c.employee_name in act:
            by_emp[c.employee_name].append(c)
    out = [dict(_group_stats(v), employee=k) for k, v in by_emp.items()]
    return sorted(out, key=lambda x: x["tqs"])
