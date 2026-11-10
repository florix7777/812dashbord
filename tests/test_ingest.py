"""Проверки разбора файлов и работы с именами. Данные синтетические, реальные ФИО не нужны."""
import datetime as dt
import importlib
import io
import os
import sys
import tempfile
from pathlib import Path

import openpyxl
import pytest
from fastapi.testclient import TestClient

BACKEND = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND))

HEAD = ["ФИО Сотрудника", "Дата прослушки", "Дата звонка", "Номер клиента", "Тип звонка", "Длительность",
        "Приветствие", "Этика", "CRM", "Легенда", "Задолж.", "Аргумент.", "Манипул.", "Требования",
        "Подведение итогов", "Итоги", "Комментарии"]


def qc_xlsx(rows):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(HEAD)
    ws.append([None] * 6 + [0.05, 0.05, 0.1, 0.15, 0.1, 0.2, 0.1, 0.15, 0.1] + [None, None])
    ws.append([None] * 17)
    for name, day, client, score in rows:
        d = dt.date(2026, 10, day)
        ws.append([name + " ", d, d, client, "исход.", dt.time(0, 53, 0)] + [score] * 9 + [score, "ok"])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def simple_xlsx(header, rows):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(header)
    for r in rows:
        ws.append(r)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


@pytest.fixture()
def client():
    tmp = tempfile.mkdtemp()
    os.environ["DATABASE_URL"] = f"sqlite:///{tmp}/t.db"
    os.environ["REPORTS_DIR"] = f"{tmp}/reports"
    for m in ("db", "store", "parsing", "app"):
        sys.modules.pop(m, None)
    app = importlib.import_module("app")
    with TestClient(app.app) as c:
        yield c


def up(c, content, name, **data):
    return c.post("/api/upload", files={"file": (name, content, "application/octet-stream")}, data=data)


def test_qc_upload_any_filename_and_no_duplicates(client):
    content = qc_xlsx([("Иванов Иван", 2, 111, 1.0), ("Иванов Иван", 9, 112, 0.5), ("Петров Пётр", 3, 113, 1.0)])
    r = up(client, content, "Quality_Октябрь_2026.xlsx")
    assert r.status_code == 200
    s = r.json()
    assert s["rows_saved"] == 3 and s["operators"] == 2
    assert s["periods"] == ["Октябрь 2026 · 01-04", "Октябрь 2026 · 05-11"]
    again = up(client, content, "other_name.xlsx").json()
    assert again["rows_saved"] == 0 and again["rows_updated"] == 3
    m = client.get("/api/metrics").json()
    assert m["Иванов Иван"]["months"]["Октябрь 2026"]["periods"][0]["tqs"] == 1.0


def test_daily_trend(client):
    up(client, qc_xlsx([("Иванов Иван", 2, 1, 0.5), ("Иванов Иван", 3, 2, 1.0)]), "q.xlsx")
    days = client.get("/api/qc/daily", params={"employee": "Иванов Иван"}).json()["days"]
    assert days[0]["trend"] == "none" and days[1]["trend"] == "up"


def test_collection_both_formats(client):
    up(client, simple_xlsx(["Оператор", "Дата", "Собрано", "План"],
                           [["Иванов Иван", dt.date(2026, 11, 1), 100, 1000], ["Иванов Иван", dt.date(2026, 11, 2), 300, 1000]]), "c.xlsx")
    d = client.get("/api/collection").json()["Иванов Иван"]["daily"]
    assert [x["collected"] for x in d] == [100, 300]
    r = up(client, simple_xlsx(["Оператор", "окт 2026"], [["Итоги", "900,5"], ["Иванов Иван", "1 000,50"], ["Петров Пётр", "2 000"]]),
           "qlik.xlsx", report_date="2026-10-31")
    assert r.status_code == 200 and r.json()["operators"] == 2


def test_similar_names_flagged_and_merge(client):
    up(client, qc_xlsx([("Хакимов Умид", 2, 1, 1.0)]), "q.xlsx")
    r = up(client, simple_xlsx(["Оператор", "Дата", "Собрано"], [["Хакимов Умиджон", dt.date(2026, 10, 5), 10]]), "c.xlsx").json()
    assert r["possible_duplicates"] == [{"name": "Хакимов Умиджон", "similar_to": "Хакимов Умид"}]
    assert client.post("/api/staff/merge", json={"source": "Хакимов Умиджон", "target": "Хакимов Умид"}).status_code == 200
    assert "Хакимов Умид" in client.get("/api/collection").json()
    r = up(client, simple_xlsx(["Оператор", "Дата", "Собрано"], [["Хакимов Умиджон", dt.date(2026, 10, 6), 20]]), "c2.xlsx").json()
    assert r["new_operators"] == []


def test_different_people_not_flagged(client):
    up(client, qc_xlsx([("Низомиддинов Аслиддин", 2, 1, 1.0)]), "q.xlsx")
    r = up(client, simple_xlsx(["Оператор", "Дата", "Собрано"], [["Низомиддинов Фазлиддин", dt.date(2026, 10, 5), 10]]), "c.xlsx").json()
    assert r["possible_duplicates"] == []


def test_bad_files(client):
    assert up(client, simple_xlsx(["что", "то"], [[1, 2]]), "x.xlsx").status_code == 422
    assert up(client, b"not a zip", "x.xlsx").status_code == 415
    broken = qc_xlsx([("Иванов Иван", 2, 1, 1.0)])
    wb = openpyxl.load_workbook(io.BytesIO(broken))
    wb.active["G4"] = None
    buf = io.BytesIO()
    wb.save(buf)
    r = up(client, buf.getvalue(), "q.xlsx")
    assert r.status_code == 422


def test_staff_manual_and_inactive(client):
    assert client.post("/api/staff", json={"name": "Сидоров Сидор"}).status_code == 200
    assert client.post("/api/staff", json={"name": "сидоров  сидор"}).status_code == 422
    up(client, qc_xlsx([("Сидоров Сидор", 2, 1, 1.0)]), "q.xlsx")
    client.post("/api/staff/active", json={"name": "Сидоров Сидор", "active": False})
    assert "Сидоров Сидор" not in client.get("/api/metrics").json()


def test_day_summary(client):
    up(client, qc_xlsx([("Иванов Иван", 2, 1, 0.5), ("Петров Пётр", 2, 2, 1.0)]), "q.xlsx")
    ops = client.get("/api/qc/day", params={"date": "2026-10-02"}).json()["operators"]
    assert [o["employee"] for o in ops] == ["Иванов Иван", "Петров Пётр"]


def test_weekly_periods_match_qc_reports():
    sys.path.insert(0, str(BACKEND))
    import parsing as P
    assert P.month_periods(2026, 8) == ((1, 9), (10, 16), (17, 23), (24, 31))
    assert P.month_periods(2026, 9) == ((1, 6), (7, 13), (14, 20), (21, 27), (28, 30))
    assert P.month_periods(2026, 2) == ((1, 8), (9, 15), (16, 22), (23, 28))


def test_collection_daily_amounts(client):
    rows = [["Иванов Иван", dt.date(2026, 11, d), v, 1000] for d, v in ((2, 100), (3, 50), (4, 200))]
    r = up(client, simple_xlsx(["Оператор", "Дата", "Собрано", "План"], rows), "c.xlsx", amount_type="daily").json()
    assert r["rows_saved"] == 3
    d = client.get("/api/collection").json()["Иванов Иван"]["daily"]
    assert [x["collected"] for x in d] == [100, 150, 350]       # нарастающий итог
    assert [x["daily"] for x in d] == [100, 50, 200]


def test_collection_two_columns_and_auto_detect(client):
    both = simple_xlsx(["Оператор", "Дата", "Собрано за день", "Собрано с начала месяца"],
                       [["Иванов Иван", dt.date(2026, 11, 2), 10, 10], ["Иванов Иван", dt.date(2026, 11, 3), 5, 15]])
    r = up(client, both, "both.xlsx").json()
    assert r["rows_saved"] == 2
    cum = simple_xlsx(["Оператор", "Дата", "Собрано"],
                      [["Петров Пётр", dt.date(2026, 11, d), v] for d, v in ((2, 10), (3, 20), (4, 30))])
    r = up(client, cum, "cum.xlsx").json()
    assert any("накопленные" in w for w in r["warnings"])
    perday = simple_xlsx(["Оператор", "Дата", "Собрано"],
                         [["Сидоров Сидор", dt.date(2026, 11, d), v] for d, v in ((2, 30), (3, 10), (4, 20))])
    r = up(client, perday, "day.xlsx").json()
    assert any("за один день" in w for w in r["warnings"])


def test_pdf_text_parsing():
    import parsing as P
    text = ("Промежуточный отчёт по сотрудникам SC\nза период: 01–09.08.2026\nОтчёт по сотруднику: Иванов Иван\n"
            "2. Оценки:\n• Точный средний балл: 61.38%.\n• Тенденции (Системные недоработки):\n"
            "o Легендирование: 0,5 балла в 5 звонках из 8.\no Аргументация: 0,5 балла в 8 звонках из 8.\n"
            "3. Рекомендации для Лида (руководителя группы):\n• По требованиям: обязать озвучивать сумму,\nдату и способы оплаты.\n"
            "Сводная таблица баллов за период\nИванов Иван 61.38 Норма")
    items = P.parse_pdf_text(text)
    assert items[0]["employee"] == "Иванов Иван"
    assert items[0]["tendencies"].count("•") == 2
    assert "дату и способы оплаты" in items[0]["rec"] and "Сводная" not in items[0]["rec"]
    assert P.pdf_period_from_text(text) == (2026, 8, 1, 9)
