#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Quick test of PDF parsing with fixed functions"""

import json
import re
from pathlib import Path
from statistics import mean
import pandas as pd
import pdfplumber
from datetime import datetime

SCRIPT_DIR = Path(__file__).parent.resolve()
REPORTS_DIR = SCRIPT_DIR / "reports"
INDEX_HTML_PATH = SCRIPT_DIR / "index.html"

MONTHS_MAP = {
    "01": "Январь 2026", "02": "Февраль 2026", "03": "Март 2026", "04": "Апрель 2026",
    "05": "Май 2026", "06": "Июнь 2026", "07": "Июль 2026", "08": "Август 2026",
    "09": "Сентябрь 2026", "10": "Октябрь 2026", "11": "Ноябрь 2026", "12": "Декабрь 2026"
}

SVP_KEYS = [
    "Приветствие", "Этика", "CRM", "Легенда", "Задолж.",
    "Аргумент.", "Манипул.", "Требования", "Итоги",
]

def extract_month_and_period(filename: str):
    # Try format: "13.04.2026 - 19.04.2026"
    match = re.search(r"(\d{2})\.(\d{2})\.(\d{4})\s*-\s*(\d{2})\.(\d{2})\.(\d{4})", filename)
    if match:
        month = MONTHS_MAP.get(match.group(2), f"{match.group(2)}.{match.group(3)}")
        period = f"{match.group(1)}-{match.group(4)}"
        print(f"[OK] Matched format 1: {period} / {month}")
        return month, period
    
    # Try format: "13-19.04.2026"
    match = re.search(r"(\d{2})-(\d{2})\.(\d{2})\.(\d{4})", filename)
    if match:
        month = MONTHS_MAP.get(match.group(3), f"{match.group(3)}.{match.group(4)}")
        period = f"{match.group(1)}-{match.group(2)}"
        print(f"[OK] Matched format 2: {period} / {month}")
        return month, period
    
    print(f"[ERROR] No format matched for: {filename}")
    return "Неизвестно", "Неизвестно"

def extract_pdf_sections(text: str):
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
    if "рекомендац" in key.lower():
        # Stop at double newline (paragraph break)
        match_break = re.search(r"\n\s*\n", remaining)
        if match_break:
            text = remaining[:match_break.start()]
        else:
            text = remaining
    else:
        # For other sections, just take the first line
        match_newline = re.search(r"\n", remaining)
        if match_newline:
            text = remaining[:match_newline.start()]
        else:
            text = remaining
    
    return text.strip().replace("\n", " ").replace("\r", " ")

# Test
pdf_file = list(REPORTS_DIR.glob("*13-19*.pdf"))[0]
print(f"\n[TEST] Testing PDF: {pdf_file.name}\n")

month, period = extract_month_and_period(pdf_file.name)
print(f"[RESULT] Period: {period}, Month: {month}\n")

with pdfplumber.open(pdf_file) as pdf:
    text = "\n".join(page.extract_text() or "" for page in pdf.pages)

sections = extract_pdf_sections(text)
print(f"[RESULT] Found {len(sections)} sections\n")

# Test first 3 employees
count = 0
for i, section in enumerate(sections):
    lines = [line.strip() for line in section.splitlines() if line.strip()]
    if not lines:
        continue
    
    employee = lines[0]
    if employee.startswith("Промежуточный"):
        continue
    
    count += 1
    if count > 3:
        break
    
    print(f"--- Employee {count}: {employee} ---")
    
    rec = extract_section_text(section, "Рекомендации")
    print(f"Recommendations length: {len(rec)}")
    if rec:
        print(f"Sample: {rec[:300]}...")
    else:
        print("NO RECOMMENDATIONS")
    print()

print("\n[RESULT] If above shows recommendations (not empty), the fix works!")

