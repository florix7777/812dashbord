#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Генератор tactical-data.js из markdown файлов в content/
Создает единый JavaScript файл с данными для тактических страниц.
"""

import os
import re
import json
from pathlib import Path
from typing import Dict, List

# Пути
SCRIPT_DIR = Path(__file__).parent.parent
CONTENT_DIR = SCRIPT_DIR / "content"
OUTPUT_FILE = SCRIPT_DIR / "assets" / "js" / "tactical-data.js"

# Структура контента
CONTENT_STRUCTURE = {
    "law": {
        "path": "content/law",
        "title": "Законодательная база",
        "description": "Нормативные документы и законодательные акты"
    },
    "reglament": {
        "path": "content/reglament",
        "title": "Регламенты",
        "description": "Внутренние регламенты и процедуры"
    },
    "tactical": {
        "path": "content/tactical",
        "title": "Тактические материалы",
        "description": "Методики и тактики работы"
    }
}


def read_markdown_file(file_path: Path) -> str:
    """Читает markdown файл и возвращает содержимое."""
    if not file_path.exists():
        return ""
    
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    return content


def escape_javascript_string(text: str) -> str:
    """Экранирует строку для вставки в JavaScript."""
    # Экранируем обратные слеши и кавычки
    text = text.replace('\\', '\\\\')
    text = text.replace('`', '\\`')
    text = text.replace('$', '\\$')
    return text


def collect_markdown_files(directory: Path) -> List[Path]:
    """Собирает все markdown файлы в директории."""
    if not directory.exists():
        return []
    
    md_files = []
    for file_path in sorted(directory.glob("*.md")):
        md_files.append(file_path)
    
    # Также ищем в поддиректориях
    for subdir in sorted(directory.iterdir()):
        if subdir.is_dir():
            md_files.extend(collect_markdown_files(subdir))
    
    return md_files


def parse_markdown_to_sections(content: str) -> List[Dict]:
    """Парсит markdown на секции по заголовкам."""
    sections = []
    current_section = {"title": "", "content": ""}
    
    lines = content.split('\n')
    for line in lines:
        # Проверяем заголовки
        if line.startswith('# '):
            # Сохраняем предыдущую секцию
            if current_section["content"].strip():
                sections.append(current_section)
            current_section = {"title": line[2:].strip(), "content": ""}
        elif line.startswith('## '):
            # Подзаголовок - добавляем в текущую секцию
            if current_section["content"].strip():
                sections.append(current_section)
                current_section = {"title": line[3:].strip(), "content": ""}
            else:
                current_section["title"] = line[3:].strip()
        else:
            current_section["content"] += line + '\n'
    
    # Добавляем последнюю секцию
    if current_section["content"].strip() or current_section["title"]:
        sections.append(current_section)
    
    return sections


def build_tactical_data() -> Dict:
    """Собирает все данные для tactical-data.js."""
    tactical_data = {}
    
    for key, config in CONTENT_STRUCTURE.items():
        category_data = {
            "title": config["title"],
            "description": config["description"],
            "items": []
        }
        
        category_path = SCRIPT_DIR / config["path"]
        md_files = collect_markdown_files(category_path)
        
        for md_file in md_files:
            content = read_markdown_file(md_file)
            if not content:
                continue
            
            sections = parse_markdown_to_sections(content)
            
            item = {
                "name": md_file.stem,
                "path": str(md_file.relative_to(SCRIPT_DIR)),
                "content": escape_javascript_string(content),
                "sections": []
            }
            
            for section in sections:
                item["sections"].append({
                    "title": section["title"],
                    "content": escape_javascript_string(section["content"])
                })
            
            category_data["items"].append(item)
        
        tactical_data[key] = category_data
    
    return tactical_data


def generate_javascript_file(data: Dict) -> None:
    """Генерирует JavaScript файл с данными."""
    # Формируем JavaScript код
    js_content = """// tactical-data.js
// Автоматически сгенерированный файл с данными для тактических страниц
// Не редактировать вручную! Используйте scripts/build_tactical_data.py
// Дата генерации: {date}

const TACTICAL_DATA = {data};

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TACTICAL_DATA;
}
"""
    
    # Преобразуем данные в JSON и экранируем
    json_data = json.dumps(data, ensure_ascii=False, indent=2)
    
    # Заменяем экранированные символы обратно для JSON внутри JS
    # (json.dumps уже экранировал, нам нужно вставить как строку)
    js_content = js_content.format(
        date=__import__('datetime').datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        data=json_data
    )
    
    # Сохраняем файл
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        f.write(js_content)
    
    print(f"[INFO] tactical-data.js сгенерирован: {OUTPUT_FILE}")
    print(f"[INFO] Размер: {len(js_content)} байт")


def main():
    """Основная функция."""
    print("[INFO] Начало генерации tactical-data.js...")
    
    # Собираем данные
    data = build_tactical_data()
    
    # Проверяем, есть ли данные
    has_data = any(
        len(category["items"]) > 0 
        for category in data.values()
    )
    
    if not has_data:
        print("[WARNING] Не найдено markdown файлов в content/. Создаю пустой файл.")
        data = {
            "law": {"title": "Законодательная база", "description": "Нормативные документы", "items": []},
            "reglament": {"title": "Регламенты", "description": "Внутренние регламенты", "items": []},
            "tactical": {"title": "Тактические материалы", "description": "Методики и тактики", "items": []}
        }
    
    # Генерируем файл
    generate_javascript_file(data)
    
    # Выводим статистику
    total_files = sum(
        len(category["items"]) 
        for category in data.values()
    )
    print(f"[INFO] Всего файлов обработано: {total_files}")
    
    for key, category in data.items():
        print(f"[INFO] {category['title']}: {len(category['items'])} файлов")


if __name__ == "__main__":
    main()