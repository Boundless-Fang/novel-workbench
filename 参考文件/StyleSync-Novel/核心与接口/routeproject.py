import json
import os
import re
import shutil
from datetime import datetime

from fastapi import APIRouter, HTTPException

from .config import PROJ_DIR, STYLE_DIR
from .models import AppendContent, ChapterUpdate, ProjectCreate, SettingUpdate
from core._core_utils import async_append_text, async_atomic_write, async_smart_read_text

router = APIRouter()

LEGACY_CHAPTER_RE = re.compile(r"^chapter_(\d+)(?:_(.+))?$", re.IGNORECASE)
CHINESE_CHAPTER_RE = re.compile(r"^第([零一二两三四五六七八九十百千万\d]+)章(?:_(.+))?$")
OUTLINE_FILE_RE = re.compile(r"^(?P<chapter>.+)_outline\.(?:md|json)$", re.IGNORECASE)
PROMPT_FILE_RE = re.compile(r"^prompt_(?P<chapter>.+?)(?:_f5c_(?:prefix|fim))?\.txt$", re.IGNORECASE)
CN_DIGIT_ORDER = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"]
CN_DIGITS = {"零": 0, "一": 1, "二": 2, "两": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9}
CN_UNITS = {"十": 10, "百": 100, "千": 1000, "万": 10000}

FANFIC_MODES = {"同人", "fanfic"}
ORIGINAL_MODES = {"原创", "original"}
DEFAULT_MODES = {"默认", "default"}


def get_real_dir(proj_name: str):
    if proj_name.startswith("style@@"):
        return os.path.join(STYLE_DIR, proj_name.replace("style@@", ""))
    return os.path.join(PROJ_DIR, proj_name)


def get_validated_target_path(proj_name: str, file_path: str) -> str:
    raw_base_dir = get_real_dir(proj_name)
    safe_base_dir = os.path.realpath(os.path.abspath(raw_base_dir))

    expected_root = os.path.realpath(
        os.path.abspath(STYLE_DIR if proj_name.startswith("style@@") else PROJ_DIR)
    )
    norm_root = os.path.normcase(expected_root)
    norm_base = os.path.normcase(safe_base_dir)

    try:
        if os.path.commonpath([norm_root, norm_base]) != norm_root:
            raise HTTPException(status_code=403, detail="非法项目名，访问已被拦截")
    except ValueError as exc:
        raise HTTPException(status_code=403, detail="项目路径跨盘，访问已被拦截") from exc

    target_path = os.path.realpath(os.path.abspath(os.path.join(safe_base_dir, file_path)))
    norm_target = os.path.normcase(target_path)

    try:
        if os.path.commonpath([norm_base, norm_target]) != norm_base:
            raise ValueError("检测到目录穿越")
    except ValueError as exc:
        raise HTTPException(status_code=403, detail=f"越权访问已被拦截: {exc}") from exc

    return target_path


def build_project_name(project_name: str) -> str:
    base_name = project_name.strip()
    if not base_name.endswith("_style_imitation"):
        return f"{base_name}_style_imitation"
    return base_name


def int_to_chinese(num: int) -> str:
    if num <= 0:
        raise ValueError("章节编号必须为正整数")
    if num < 10:
        return CN_DIGIT_ORDER[num]
    if num < 20:
        return "十" if num == 10 else f"十{CN_DIGIT_ORDER[num % 10]}"
    if num < 100:
        tens = num // 10
        ones = num % 10
        prefix = f"{CN_DIGIT_ORDER[tens]}十"
        return prefix if ones == 0 else f"{prefix}{CN_DIGIT_ORDER[ones]}"
    return str(num)


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


def split_chapter_name(raw_name: str) -> tuple[int, str]:
    cleaned = str(raw_name or "").strip()
    legacy_match = LEGACY_CHAPTER_RE.fullmatch(cleaned)
    if legacy_match:
        return int(legacy_match.group(1)), (legacy_match.group(2) or "").strip()

    chinese_match = CHINESE_CHAPTER_RE.fullmatch(cleaned)
    if chinese_match:
        number = chinese_to_int(chinese_match.group(1))
        if number is None or number <= 0:
            raise ValueError("章节编号无效")
        return number, (chinese_match.group(2) or "").strip()

    raise ValueError("章节名只允许使用“第X章”或“第X章_标题”格式")


def normalize_chapter_name(raw_name: str) -> str:
    number, title = split_chapter_name(raw_name)
    canonical = f"第{int_to_chinese(number)}章"
    if title:
        canonical += f"_{title}"
    return canonical


def chapter_sort_key_from_name(name: str) -> tuple[int, str]:
    stem = os.path.splitext(name)[0]
    try:
        number, title = split_chapter_name(stem)
        return number, title
    except ValueError:
        return 999999, stem


def chapter_sort_key_from_outline(filename: str) -> tuple[int, str]:
    match = OUTLINE_FILE_RE.fullmatch(filename)
    chapter_name = match.group("chapter") if match else os.path.splitext(filename)[0]
    return chapter_sort_key_from_name(chapter_name)


def chapter_sort_key_from_prompt(filename: str) -> tuple[int, str]:
    match = PROMPT_FILE_RE.fullmatch(filename)
    chapter_name = match.group("chapter") if match else os.path.splitext(filename)[0]
    return chapter_sort_key_from_name(chapter_name)


def _rename_if_exists(src: str, dst: str) -> None:
    if os.path.exists(src) and src != dst:
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        os.replace(src, dst)


def migrate_project_chapter_names(base_dir: str) -> None:
    content_dir = os.path.join(base_dir, "content")
    if not os.path.exists(content_dir):
        return

    rename_plan = []
    for filename in os.listdir(content_dir):
        if not filename.endswith(".txt"):
            continue
        old_stem = os.path.splitext(filename)[0]
        try:
            new_stem = normalize_chapter_name(old_stem)
        except ValueError:
            continue
        if new_stem != old_stem:
            rename_plan.append((old_stem, new_stem))

    target_paths = {}
    for old_stem, new_stem in rename_plan:
        if new_stem in target_paths and target_paths[new_stem] != old_stem:
            raise RuntimeError(f"章节迁移冲突：{old_stem} 与 {target_paths[new_stem]} 都将迁移为 {new_stem}")
        target_paths[new_stem] = old_stem
        if os.path.exists(os.path.join(content_dir, f"{new_stem}.txt")):
            raise RuntimeError(f"章节迁移冲突：目标章节已存在 {new_stem}")

    outline_dir = os.path.join(base_dir, "chapter_structures")
    prompt_dir = os.path.join(base_dir, "chapter_specific_prompts")

    for old_stem, new_stem in sorted(rename_plan, key=lambda item: chapter_sort_key_from_name(item[0])):
        _rename_if_exists(
            os.path.join(content_dir, f"{old_stem}.txt"),
            os.path.join(content_dir, f"{new_stem}.txt"),
        )

        if os.path.exists(outline_dir):
            for suffix in ("md", "json"):
                _rename_if_exists(
                    os.path.join(outline_dir, f"{old_stem}_outline.{suffix}"),
                    os.path.join(outline_dir, f"{new_stem}_outline.{suffix}"),
                )

        if os.path.exists(prompt_dir):
            for prompt_name in os.listdir(prompt_dir):
                if not prompt_name.startswith(f"prompt_{old_stem}"):
                    continue
                _rename_if_exists(
                    os.path.join(prompt_dir, prompt_name),
                    os.path.join(prompt_dir, prompt_name.replace(f"prompt_{old_stem}", f"prompt_{new_stem}", 1)),
                )


def ensure_project_chapter_naming(proj_name: str) -> str:
    base_dir = get_real_dir(proj_name)
    migrate_project_chapter_names(base_dir)
    return base_dir


def init_project_structure(target_proj_dir: str, proj: ProjectCreate) -> None:
    for folder in ["content", "character_profiles", "chapter_structures"]:
        os.makedirs(os.path.join(target_proj_dir, folder), exist_ok=True)

    config_path = os.path.join(target_proj_dir, "project_config.json")
    project_config = {
        "name": proj.name,
        "mode": proj.branch,
        "reference_style": proj.reference_style,
        "created_at": datetime.now().isoformat(),
    }
    with open(config_path, "w", encoding="utf-8") as file:
        json.dump(project_config, file, ensure_ascii=False, indent=2)


def init_fanfic_project(target_proj_dir: str, src_style_dir: str) -> None:
    if not src_style_dir or not os.path.exists(src_style_dir):
        raise ValueError("同人模式必须选择有效的参考文风库")

    for filename in [
        "features.md",
        "world_settings.md",
        "plot_outlines.md",
        "positive_words.md",
        "negative_words.md",
        "exclusive_vocab.md",
    ]:
        src_file = os.path.join(src_style_dir, filename)
        if os.path.exists(src_file):
            shutil.copy2(src_file, os.path.join(target_proj_dir, filename))

    for folder in ["character_profiles", "hierarchical_rag_db"]:
        src_folder = os.path.join(src_style_dir, folder)
        if os.path.exists(src_folder):
            dst_folder = os.path.join(target_proj_dir, folder)
            if os.path.exists(dst_folder):
                shutil.rmtree(dst_folder)
            shutil.copytree(src_folder, dst_folder)


def init_original_project(target_proj_dir: str, src_style_dir: str) -> None:
    if not src_style_dir or not os.path.exists(src_style_dir):
        raise ValueError("原创模式必须选择有效的参考文风库")

    for filename in ["features.md", "positive_words.md", "negative_words.md"]:
        src_file = os.path.join(src_style_dir, filename)
        if os.path.exists(src_file):
            shutil.copy2(src_file, os.path.join(target_proj_dir, filename))

    world_settings_path = os.path.join(target_proj_dir, "world_settings.md")
    open(world_settings_path, "w", encoding="utf-8").close()


def init_default_project(target_proj_dir: str) -> None:
    for filename in ["features.md", "world_settings.md", "positive_words.md", "negative_words.md"]:
        file_path = os.path.join(target_proj_dir, filename)
        if not os.path.exists(file_path):
            open(file_path, "w", encoding="utf-8").close()


def ensure_required_files(target_proj_dir: str) -> None:
    required_files = [
        "features.md",
        "world_settings.md",
        "positive_words.md",
        "negative_words.md",
    ]
    for filename in required_files:
        file_path = os.path.join(target_proj_dir, filename)
        if not os.path.exists(file_path):
            open(file_path, "w", encoding="utf-8").close()

    first_chapter_path = os.path.join(target_proj_dir, "content", "第一章.txt")
    with open(first_chapter_path, "w", encoding="utf-8") as file:
        file.write("这里是小说的开头……")


@router.get("/api/projects")
async def get_projects():
    return [f for f in os.listdir(PROJ_DIR) if os.path.isdir(os.path.join(PROJ_DIR, f))]


@router.get("/api/styles")
async def get_styles():
    if not os.path.exists(STYLE_DIR):
        return []
    return [f for f in os.listdir(STYLE_DIR) if os.path.isdir(os.path.join(STYLE_DIR, f))]


@router.post("/api/projects")
async def create_project(proj: ProjectCreate, force_overwrite: bool = False):
    dir_name = build_project_name(proj.name)
    target_proj_dir = os.path.join(PROJ_DIR, dir_name)
    src_style_dir = os.path.join(STYLE_DIR, proj.reference_style) if proj.reference_style else None

    if os.path.exists(target_proj_dir) and not force_overwrite:
        raise HTTPException(status_code=409, detail="PROJECT_EXISTS")

    def _execute_project_initialization():
        if os.path.exists(target_proj_dir) and force_overwrite:
            shutil.rmtree(target_proj_dir)
        init_project_structure(target_proj_dir, proj)

        if proj.branch in FANFIC_MODES:
            init_fanfic_project(target_proj_dir, src_style_dir)
        elif proj.branch in ORIGINAL_MODES:
            init_original_project(target_proj_dir, src_style_dir)
        elif proj.branch in DEFAULT_MODES:
            init_default_project(target_proj_dir)
        else:
            raise ValueError(f"不支持的项目模式: {proj.branch}")

        ensure_required_files(target_proj_dir)

    try:
        import asyncio

        await asyncio.to_thread(_execute_project_initialization)
        return {"status": "success"}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except OSError as exc:
        print(f"[ERROR] 项目初始化失败: {exc}")
        raise HTTPException(status_code=500, detail="项目创建失败，存储层出现异常") from exc


@router.get("/api/projects/{proj_name}/chapters")
async def get_chapters(proj_name: str):
    base_dir = ensure_project_chapter_naming(proj_name)
    content_dir = os.path.join(base_dir, "content")
    if not os.path.exists(content_dir):
        return []
    return sorted(
        [f for f in os.listdir(content_dir) if f.endswith(".txt")],
        key=chapter_sort_key_from_name,
    )


@router.get("/api/projects/{proj_name}/characters")
async def get_characters(proj_name: str):
    base_dir = get_real_dir(proj_name)
    char_dir = os.path.join(base_dir, "character_profiles")
    if not os.path.exists(char_dir):
        return []
    return [os.path.splitext(f)[0] for f in os.listdir(char_dir) if f.endswith(".md")]


@router.post("/api/projects/{proj_name}/chapters/{chap_name}")
async def create_or_rename_chapter(
    proj_name: str,
    chap_name: str,
    new_name: str = None,
    force_overwrite: bool = False,
):
    base_dir = ensure_project_chapter_naming(proj_name)
    content_dir = os.path.join(base_dir, "content")

    source_name = normalize_chapter_name(chap_name)
    target_name = normalize_chapter_name(new_name if new_name else chap_name)
    target_path = os.path.join(content_dir, f"{target_name}.txt")
    source_path = os.path.join(content_dir, f"{source_name}.txt")

    if os.path.exists(target_path) and not force_overwrite:
        if new_name and source_path == target_path:
            return {"status": "success"}
        raise HTTPException(status_code=409, detail="FILE_EXISTS")

    def _execute_chapter_fs_modification():
        if new_name:
            if source_path != target_path:
                max_retries = 10
                base_delay = 0.2
                for attempt in range(max_retries):
                    try:
                        os.replace(source_path, target_path)
                        break
                    except PermissionError as exc:
                        if attempt < max_retries - 1:
                            import random
                            import time

                            time.sleep(base_delay * (1.5 ** attempt) + random.uniform(0, 0.1))
                        else:
                            raise PermissionError("目标文件正被系统或其他进程占用，已超过重试上限") from exc
                outline_dir = os.path.join(base_dir, "chapter_structures")
                if os.path.exists(outline_dir):
                    for suffix in ("md", "json"):
                        _rename_if_exists(
                            os.path.join(outline_dir, f"{source_name}_outline.{suffix}"),
                            os.path.join(outline_dir, f"{target_name}_outline.{suffix}"),
                        )

                prompt_dir = os.path.join(base_dir, "chapter_specific_prompts")
                if os.path.exists(prompt_dir):
                    for prompt_name in os.listdir(prompt_dir):
                        if not prompt_name.startswith(f"prompt_{source_name}"):
                            continue
                        _rename_if_exists(
                            os.path.join(prompt_dir, prompt_name),
                            os.path.join(prompt_dir, prompt_name.replace(f"prompt_{source_name}", f"prompt_{target_name}", 1)),
                        )
        else:
            with open(target_path, "w", encoding="utf-8"):
                pass

    try:
        import asyncio

        await asyncio.to_thread(_execute_chapter_fs_modification)
        return {"status": "success", "chapter_name": target_name}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except PermissionError as exc:
        print(f"[ERROR] 章节覆盖失败: {exc}")
        raise HTTPException(status_code=500, detail="文件操作失败，目标文件正被其他进程占用") from exc
    except OSError as exc:
        print(f"[ERROR] 章节操作失败: {exc}")
        raise HTTPException(status_code=500, detail="执行章节文件操作时发生异常") from exc


@router.get("/api/projects/{proj_name}/chapters/{chap_name}/content")
async def get_chapter_content(proj_name: str, chap_name: str):
    filepath = get_validated_target_path(proj_name, f"content/{normalize_chapter_name(chap_name)}.txt")

    if os.path.exists(filepath):
        try:
            content = await async_smart_read_text(filepath)
            return {"content": content}
        except OSError as exc:
            raise HTTPException(status_code=500, detail="文件读取失败，或文件正被其他进程占用") from exc
    return {"content": ""}


@router.put("/api/projects/{proj_name}/chapters/{chap_name}/content")
async def update_chapter_content(proj_name: str, chap_name: str, update: ChapterUpdate):
    filepath = get_validated_target_path(proj_name, f"content/{normalize_chapter_name(chap_name)}.txt")

    try:
        await async_atomic_write(filepath, update.content, "text")
        return {"status": "success"}
    except OSError as exc:
        raise HTTPException(status_code=500, detail="保存章节内容失败：存储层异常") from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail="保存章节内容失败：并发写盘超过重试上限") from exc


@router.post("/api/projects/{proj_name}/append")
async def append_to_novel(proj_name: str, req: AppendContent):
    base_dir = ensure_project_chapter_naming(proj_name)
    content_dir = os.path.join(base_dir, "content")
    if not os.path.exists(content_dir):
        raise HTTPException(status_code=404, detail="未找到章节内容目录")

    target_file = get_validated_target_path(proj_name, f"content/{normalize_chapter_name(req.chapter_name)}.txt")
    if not os.path.exists(target_file):
        raise HTTPException(status_code=404, detail="CHAPTER_NOT_FOUND")

    try:
        await async_append_text(target_file, "\n\n" + req.content)
        return {"status": "success"}
    except OSError as exc:
        raise HTTPException(status_code=500, detail="追加内容失败：底层 I/O 被锁定") from exc


@router.get("/api/projects/{proj_name}/settings/{file_path:path}")
async def get_project_setting(proj_name: str, file_path: str):
    try:
        target_path = get_validated_target_path(proj_name, file_path)
    except HTTPException as exc:
        return {"content": exc.detail}

    if not os.path.isfile(target_path):
        return {"content": "文件不存在或尚未生成，请先检查工作流执行状态。"}

    try:
        content = await async_smart_read_text(target_path)
        return {"content": content}
    except OSError:
        return {"content": "系统错误：文件读取异常，或文件正被占用。"}


@router.put("/api/projects/{proj_name}/settings/{file_path:path}")
async def update_project_setting(proj_name: str, file_path: str, update: SettingUpdate):
    target_path = get_validated_target_path(proj_name, file_path)

    if os.path.isdir(target_path):
        raise HTTPException(status_code=400, detail="目标路径已被文件夹占用，无法写入")

    try:
        import asyncio

        await asyncio.to_thread(os.makedirs, os.path.dirname(target_path), exist_ok=True)
        await async_atomic_write(target_path, update.content, "text")
        return {"status": "success"}
    except OSError as exc:
        raise HTTPException(status_code=500, detail="目录创建或文件写入时发生 I/O 异常") from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail="文件并发写盘超过重试上限") from exc


@router.get("/api/projects/{proj_name}/outlines")
async def get_outlines(proj_name: str):
    base_dir = ensure_project_chapter_naming(proj_name)
    outline_dir = os.path.join(base_dir, "chapter_structures")
    if not os.path.exists(outline_dir):
        return []
    return sorted(
        [f for f in os.listdir(outline_dir) if f.endswith(".md") or f.endswith(".json")],
        key=chapter_sort_key_from_outline,
    )


@router.get("/api/projects/{proj_name}/phase1_status")
async def check_phase1_status(proj_name: str):
    base_dir = get_real_dir(proj_name)
    target_file = os.path.join(base_dir, "world_settings.md")
    is_done = os.path.exists(target_file) and os.path.getsize(target_file) > 50
    return {"is_done": is_done}


@router.get("/api/projects/{proj_name}/prompts")
async def get_prompts(proj_name: str):
    base_dir = ensure_project_chapter_naming(proj_name)
    prompt_dir = os.path.join(base_dir, "chapter_specific_prompts")
    if not os.path.exists(prompt_dir):
        return []
    return sorted(
        [f for f in os.listdir(prompt_dir) if f.endswith(".txt")],
        key=chapter_sort_key_from_prompt,
    )
