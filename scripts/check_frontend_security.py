import json
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BASELINE_PATH = ROOT / "security" / "frontend-security-baseline.json"


def count_occurrences(content: str, needle: str) -> int:
    return content.count(needle)


def main() -> int:
    if not BASELINE_PATH.exists():
        print(f"[ERROR] Baseline file not found: {BASELINE_PATH}")
        return 1

    baseline = json.loads(BASELINE_PATH.read_text(encoding="utf-8"))
    tracked_files = baseline.get("inner_html_occurrences", {})
    forbidden_patterns = baseline.get("forbidden_patterns", [])

    errors: list[str] = []

    for rel_path, allowed_count in tracked_files.items():
        file_path = ROOT / rel_path
        if not file_path.exists():
            errors.append(f"[ERROR] Tracked file not found: {rel_path}")
            continue

        content = file_path.read_text(encoding="utf-8")
        current_count = count_occurrences(content, "innerHTML")
        if current_count > int(allowed_count):
            errors.append(
                f"[ERROR] '{rel_path}': innerHTML occurrences increased "
                f"({current_count} > {allowed_count})."
            )

    # Global scan for forbidden patterns in frontend JS.
    js_root = ROOT / "assets" / "js"
    if js_root.exists():
        js_files = sorted(js_root.glob("*.js"))
    else:
        js_files = []
        errors.append("[ERROR] Frontend JS directory not found: assets/js")

    for pattern in forbidden_patterns:
        regex = re.compile(re.escape(pattern))
        for js_file in js_files:
            content = js_file.read_text(encoding="utf-8")
            if regex.search(content):
                rel = js_file.relative_to(ROOT)
                errors.append(f"[ERROR] Forbidden pattern '{pattern}' in '{rel}'.")

    if errors:
        print("Frontend security guard failed:")
        for err in errors:
            print(err)
        return 1

    print("Frontend security guard passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
