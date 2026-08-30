"""
backfill_db.py —— 扫描本地文件系统，将项目/章节元数据回填进 SQLite。

以文件为唯一事实源，DB 仅作为索引层。可反复运行，幂等。
"""

import json
import os
import re
import sys

_CODE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _CODE_DIR not in sys.path:
    sys.path.insert(0, _CODE_DIR)

from paths_config import PROJ_DIR, STYLE_DIR  # noqa: E402

from core import _core_db  # noqa: E402


LEGACY_CHAPTER_RE = re.compile(r"^chapter_(\d+)(?:_(.+))?$", re.IGNORECASE)
CHINESE_CHAPTER_RE = re.compile(r"^第([零一二两三四五六七八九十百千万\d]+)章(?:_(.+))?$")
CN_DIGITS = {"零": 0, "一": 1, "两": 2, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9}
CN_UNITS = {"十": 10, "百": 100, "千": 1000, "万": 10000}


def chinese_to_int(text: str) -> int | None:
    cleaned = str(text or "").strip()
    if not cleaned:
        return None
    if cleaned.isdigit():
        return int(cleaned)

    total = 0
    current = 0
    seen = False
    for char in cleaned:
        if char in CN_DIGITS:
            current = CN_DIGITS[char]
            seen = True
        elif char in CN_UNITS:
            unit = CN_UNITS[char]
            if current == 0:
                current = 1 if unit == 10 else 0
            total += current * unit
            current = 0
            seen = True
        else:
            return None
    return total + current if seen else None


def split_chapter_name(raw_name: str) -> tuple[int, str] | None:
    cleaned = str(raw_name or "").strip()
    legacy_match = LEGACY_CHAPTER_RE.fullmatch(cleaned)
    if legacy_match:
        return int(legacy_match.group(1)), (legacy_match.group(2) or "").strip()

    chinese_match = CHINESE_CHAPTER_RE.fullmatch(cleaned)
    if chinese_match:
        number = chinese_to_int(chinese_match.group(1))
        if number is None or number <= 0:
            return None
        return number, (chinese_match.group(2) or "").strip()

    return None


def count_words(text: str) -> int:
    if not text:
        return 0
    cjk = len(re.findall(r"[\u4e00-\u9fa5]", text))
    latin = len(re.findall(r"[A-Za-z0-9]+", text))
    return cjk + latin


def _read_text_smart(path: str) -> str:
    for enc in ("utf-8", "gb18030", "utf-16"):
        try:
            with open(path, "r", encoding=enc) as f:
                return f.read()
        except (UnicodeDecodeError, OSError):
            continue
    try:
        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            return f.read()
    except OSError:
        return ""


def read_project_config(proj_dir: str) -> dict:
    config_path = os.path.join(proj_dir, "project_config.json")
    if not os.path.isfile(config_path):
        return {}
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def backfill_projects(
    novel_root: str = PROJ_DIR,
    style_root: str = STYLE_DIR,
    conn=None,
) -> dict:
    _core_db.init_schema(conn)
    stats = {"projects": 0, "chapters": 0, "skipped": []}

    for base_root, is_style in ((style_root, True), (novel_root, False)):
        if not os.path.isdir(base_root):
            continue
        for entry in sorted(os.listdir(base_root)):
            proj_dir = os.path.join(base_root, entry)
            if not os.path.isdir(proj_dir):
                continue

            db_name = entry
            if is_style:
                db_name = f"style@@{entry}"

            config = read_project_config(proj_dir)
            mode = str(config.get("mode", "") or "default")
            display_name = str(config.get("name", "") or entry)
            reference_style = str(config.get("reference_style", "") or "")

            project_id = _core_db.upsert_project(
                name=db_name,
                display_name=display_name,
                mode=mode,
                reference_style=reference_style,
                conn=conn,
            )
            stats["projects"] += 1

            content_dir = os.path.join(proj_dir, "content")
            if not os.path.isdir(content_dir):
                continue

            for filename in sorted(os.listdir(content_dir)):
                if not filename.endswith(".txt"):
                    continue
                split = split_chapter_name(os.path.splitext(filename)[0])
                if split is None:
                    stats["skipped"].append(os.path.join(entry, "content", filename))
                    continue
                chapter_no, title = split
                text = _read_text_smart(os.path.join(content_dir, filename))
                _core_db.upsert_chapter(
                    project_id=project_id,
                    chapter_no=chapter_no,
                    title=title,
                    filename=filename,
                    word_count=count_words(text),
                    conn=conn,
                )
                stats["chapters"] += 1

    return stats


def main() -> None:
    stats = backfill_projects()
    print(f"[OK] 回填完成: {stats['projects']} 个项目, {stats['chapters']} 个章节")
    if stats["skipped"]:
        print(f"[WARN] 未识别章节名已跳过: {stats['skipped']}")
    print(f"[INFO] 数据库位置: {_core_db.get_db_path()}")


if __name__ == "__main__":
    main()
