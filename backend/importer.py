"""Первичная загрузка отчётов из папки (например, при первом запуске на новом сервере).

Запуск вручную:  python importer.py /app/initial_data
Автоматически:   backend сам вызывает import_directory(), если задана AUTO_IMPORT_DIR и база ещё пустая.
Порядок: сначала Excel (оценки, затем взыскание, CRM), потом еженедельные PDF с рекомендациями.
Повторный запуск безопасен: записи обновляются, а не дублируются.
"""
import datetime as dt
import logging
import os
import sys
from typing import Dict, List

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import parsing as P  # noqa: E402
import store  # noqa: E402

log = logging.getLogger("importer")


def _sort_key(name: str):
    ext = os.path.splitext(name)[1].lower()
    return (0 if ext == ".xlsx" else 1, name.lower())


def import_directory(engine, path: str) -> List[Dict]:
    results = []
    files = sorted((f for f in os.listdir(path) if f.lower().endswith((".xlsx", ".pdf")) and not f.startswith("~$")),
                   key=_sort_key)
    for f in files:
        with open(os.path.join(path, f), "rb") as fh:
            content = fh.read()
        try:
            s = store.process_upload(engine, content, f, None)
            log.info("OK   %s: %s", f, s.get("message"))
            results.append({"file": f, "ok": True, "message": s.get("message"), "warnings": s.get("warnings", [])})
        except P.ParseError as exc:
            log.warning("SKIP %s: %s %s", f, exc.message, exc.problems[:2])
            results.append({"file": f, "ok": False, "message": exc.message})
        except Exception as exc:  # один плохой файл не должен останавливать остальные
            log.exception("FAIL %s", f)
            results.append({"file": f, "ok": False, "message": str(exc)[:200]})
    return results


def main():
    import db
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    if db.engine is None:
        sys.exit("Нужна переменная DATABASE_URL")
    db.init_db()
    with db.engine.begin() as conn:
        store.seed(conn)
    folder = sys.argv[1] if len(sys.argv) > 1 else os.getenv("AUTO_IMPORT_DIR", "initial_data")
    res = import_directory(db.engine, folder)
    print(f"Готово: загружено {sum(r['ok'] for r in res)} из {len(res)} файлов")


if __name__ == "__main__":
    main()
