import asyncio
import base64
import contextlib
import importlib
import io
import json
import os
import re
import shutil
import sys
import time
import traceback
import uuid
from datetime import datetime

from fastapi import APIRouter, File, Header, HTTPException, UploadFile
from pydantic import BaseModel

from .config import CODE_DIR, PROJ_DIR, REF_DIR, STYLE_DIR
from .models import ChapterOutlineRequest, ChapterRewriteRequest, NovelGenerationRequest, SettingCompletionRequest
from .tasks import (
    TASKS,
    add_task_safe,
    cancel_all_tasks,
    cancel_latest_task,
    cancel_selected_tasks,
    clear_all_tasks,
    clear_oldest_task,
    clear_selected_tasks,
    load_tasks_safe,
    run_task_safely_pool,
    save_and_prune_tasks_async,
)
from core._core_utils import mask_sensitive_info, resolve_sandbox_path, validate_safe_param

router = APIRouter()
load_tasks_safe()

SCRIPT_REGISTRY = {
    "f0": {
        "module": "f0_local_vector_indexer",
        "display_name": "全局向量索引初始化",
        "maturity": "stable",
    },
    "f1a": {
        "module": "f1a_local_text_stats",
        "display_name": "文本统计分析",
        "maturity": "stable",
    },
    "f1b": {
        "module": "f1b_llm_style_feature",
        "display_name": "风格特征提取",
        "maturity": "stable",
    },
    "f2a": {
        "module": "f2a_local_word_freq",
        "display_name": "高频词提取",
        "maturity": "stable",
    },
    "f2b": {
        "module": "f2b_llm_keyword_base",
        "display_name": "基础词库整理",
        "maturity": "stable",
    },
    "f3a": {
        "module": "f3a_llm_exclusive_vocab",
        "display_name": "专属词库提取",
        "maturity": "stable",
    },
    "f3b": {
        "module": "f3b_llm_worldview",
        "display_name": "世界观整理",
        "maturity": "stable",
    },
    "f3c": {
        "module": "f3c_llm_character",
        "display_name": "角色卡生成",
        "maturity": "stable",
    },
    "f4b": {
        "module": "f4b_llm_plot_compression",
        "display_name": "剧情压缩与摘要构建",
        "maturity": "stable",
    },
    "f4a": {
        "module": "f4a_llm_setting_completion",
        "display_name": "设定补全",
        "maturity": "stable",
    },
    "f4c": {
        "module": "f4c_local_project_rag",
        "display_name": "项目记忆库构建",
        "maturity": "stable",
    },
    "f5a": {
        "module": "f5a_llm_chapter_outline",
        "display_name": "章节大纲生成",
        "maturity": "stable",
    },
    "f5b": {
        "module": "f5b_llm_novel_generation",
        "display_name": "正文生成",
        "maturity": "stable",
    },
    "f5c": {
        "module": "f5c_llm_chapter_rewrite",
        "display_name": "现有章节智能改写",
        "maturity": "stable",
    },
    "f6": {
        "module": "f6_llm_plot_deduction",
        "display_name": "剧情方向推演",
        "maturity": "preview",
    },
    "f7": {
        "module": "f7_llm_text_validation",
        "display_name": "文本一致性校验",
        "maturity": "preview",
    },
}

SCRIPT_OUTPUT_MAP = {
    "f0": lambda style_dir, _: os.path.join(style_dir, "global_rag_db", "vector.index"),
    "f1a": lambda style_dir, _: os.path.join(style_dir, "statistics", "统计指标.txt"),
    "f1b": lambda style_dir, _: os.path.join(style_dir, "features.md"),
    "f2a": lambda style_dir, _: os.path.join(style_dir, "statistics", "高频词.txt"),
    "f2b": lambda style_dir, _: os.path.join(style_dir, "positive_words.md"),
    "f3a": lambda style_dir, _: os.path.join(style_dir, "exclusive_vocab.md"),
    "f3b": lambda style_dir, _: os.path.join(style_dir, "world_settings.md"),
    "f3c": lambda style_dir, main_name: (
        os.path.join(style_dir, "character_profiles", f"{main_name}.md") if main_name else None
    ),
    "f4b": lambda style_dir, _: os.path.join(style_dir, "hierarchical_rag_db", "chunks.json"),
}


def _optional_safe_param(value: str) -> str:
    if value is None:
        return ""
    cleaned = str(value).strip()
    if not cleaned:
        return ""
    return validate_safe_param(cleaned)


def _get_script_config(script_type: str) -> dict:
    config = SCRIPT_REGISTRY.get(script_type)
    if not config:
        raise HTTPException(status_code=400, detail=f"未知脚本类型：{script_type}")
    return config


def _get_script_path(script_type: str) -> str:
    config = _get_script_config(script_type)
    return os.path.join(CODE_DIR, "scripts", f"{config['module']}.py")


def _ensure_script_available(script_type: str) -> dict:
    config = _get_script_config(script_type)
    script_path = _get_script_path(script_type)
    if not os.path.exists(script_path):
        raise HTTPException(status_code=404, detail=f"未找到脚本: {config['module']}.py")
    if config["maturity"] == "preview" and os.path.getsize(script_path) == 0:
        raise HTTPException(
            status_code=501,
            detail=f"{script_type} 为实验性预留接口，当前脚本尚未实现，不属于稳定 MVP 主链路。",
        )
    return config


def _preview_note(script_type: str) -> str:
    config = _get_script_config(script_type)
    if config["maturity"] == "preview":
        return "（实验性预览接口，当前不属于稳定 MVP 主链路）"
    return ""


def _build_cancel_response(result):
    if not result:
        return {"status": "noop", "message": "当前没有可终止的任务", "task_ids": []}

    if isinstance(result, list):
        return {
            "status": "success",
            "message": f"已终止 {len(result)} 个任务",
            "task_ids": [item["task_id"] for item in result],
        }

    if result.get("already_finished"):
        return {
            "status": "noop",
            "message": f"最近任务已结束：{result['task_name']}",
            "task_id": result["task_id"],
        }

    return {
        "status": "success",
        "message": f"已终止最近任务：{result['task_name']}",
        "task_id": result["task_id"],
    }


def _build_clear_response(result: dict):
    cleared = result.get("cleared", [])
    skipped = result.get("skipped", [])
    if not cleared and not skipped:
        return {"status": "noop", "message": "当前没有可清除的任务记录", "task_ids": []}

    if cleared and not skipped:
        return {
            "status": "success",
            "message": f"已清除 {len(cleared)} 条任务记录",
            "task_ids": [item["task_id"] for item in cleared],
        }

    if not cleared and skipped:
        only_active = any(item.get("reason") in {"ACTIVE_TASK", "ONLY_ACTIVE_TASKS"} for item in skipped)
        return {
            "status": "noop",
            "message": "存在运行中的任务，无法直接清除，请先终止后再清除" if only_active else "没有成功清除任何任务记录",
            "task_ids": [],
        }

    return {
        "status": "partial",
        "message": f"已清除 {len(cleared)} 条任务记录，{len(skipped)} 条仍在运行未清除",
        "task_ids": [item["task_id"] for item in cleared],
    }


class TaskSelectionRequest(BaseModel):
    task_ids: list[str]


async def _create_task(task_type: str, name: str, ref_file: str) -> str:
    task_id = str(uuid.uuid4())
    await add_task_safe(
        task_id,
        {
            "name": name,
            "type": task_type,
            "status": "pending",
            "created_at": datetime.now().isoformat(),
            "ref_file": ref_file,
        },
    )
    asyncio.create_task(save_and_prune_tasks_async())
    return task_id


def _create_started_response(script_type: str, task_id: str, message: str) -> dict:
    note = _preview_note(script_type)
    final_message = f"{message}{note}" if note else message
    return {"status": "started", "task_id": task_id, "message": final_message}


def _resolve_target_path(target_file: str, *, allowed_extensions) -> str:
    if not target_file:
        return ""
    return resolve_sandbox_path(REF_DIR, target_file, allowed_extensions=allowed_extensions)


def _encode_json_payload(payload: dict) -> str:
    json_string = json.dumps(payload, ensure_ascii=False)
    return base64.b64encode(json_string.encode("utf-8")).decode("utf-8")


def _build_runtime_options(thinking: bool = False, reasoning_effort: str = "high") -> dict:
    effort = (reasoning_effort or "high").strip().lower()
    if effort not in {"high", "max"}:
        raise ValueError("reasoning_effort must be one of: high/max")
    return {"thinking": bool(thinking), "reasoning_effort": effort}


async def _run_f5a_inprocess_task(
    task_id: str,
    *,
    project_name: str,
    chapter_name: str,
    chapter_brief: dict,
    model: str,
    api_key: str | None,
    runtime_options: dict,
) -> None:
    task = TASKS.get(task_id)
    if task:
        task["status"] = "running"
        task["start_time"] = datetime.now().isoformat()
        task["last_active_time"] = time.time()
        task["stdout"] = ""
        task["stderr"] = ""
        task["tokens"] = 0

    logs: list[str] = []

    def _log(message: str) -> None:
        text = str(message)
        logs.append(text)
        current = TASKS.get(task_id)
        if current is not None:
            current["stdout"] = ("\n".join(logs))[-15000:]
            current["last_active_time"] = time.time()

    def _worker() -> bool:
        module = importlib.import_module("scripts.f5a_llm_chapter_outline")
        previous_env = {
            "DEEPSEEK_API_KEY": os.environ.get("DEEPSEEK_API_KEY"),
            "DEEPSEEK_THINKING": os.environ.get("DEEPSEEK_THINKING"),
            "DEEPSEEK_REASONING_EFFORT": os.environ.get("DEEPSEEK_REASONING_EFFORT"),
        }
        stdout_buffer = io.StringIO()
        stderr_buffer = io.StringIO()
        try:
            if api_key:
                os.environ["DEEPSEEK_API_KEY"] = api_key
            os.environ["DEEPSEEK_THINKING"] = "true" if runtime_options.get("thinking") else "false"
            os.environ["DEEPSEEK_REASONING_EFFORT"] = runtime_options.get("reasoning_effort", "high")
            with contextlib.redirect_stdout(stdout_buffer), contextlib.redirect_stderr(stderr_buffer):
                success = module.ChapterOutlineApp.execute_generation(
                    project_name,
                    chapter_brief,
                    chapter_name,
                    model,
                    _log,
                )
            return success, stdout_buffer.getvalue(), stderr_buffer.getvalue()
        finally:
            for key, value in previous_env.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value

    try:
        success, stdout_text, stderr_text = await asyncio.to_thread(_worker)
        task = TASKS.get(task_id)
        if task:
            combined_stdout = "\n".join(logs)
            if stdout_text:
                combined_stdout = f"{combined_stdout}\n{stdout_text}".strip()
            task["stdout"] = combined_stdout[-15000:]
            task["stderr"] = (stderr_text or "")[-15000:]
            token_matches = re.findall(r"(?:Total\s+Tokens|[Tt]okens?)\s*[:=]?\s*(\d+)", stdout_text or "")
            if token_matches:
                task["tokens"] = int(token_matches[-1])
            task["status"] = "success" if success else "failed"
            if not success:
                task["error"] = "f5a outline generation failed"
    except Exception as exc:
        task = TASKS.get(task_id)
        if task:
            task["status"] = "error"
            task["error"] = f"系统执行异常：{exc.__class__.__name__}: {mask_sensitive_info(str(exc))}"
            task["stderr"] = traceback.format_exc()[-15000:]
    finally:
        task = TASKS.get(task_id)
        if task:
            task["end_time"] = datetime.now().isoformat()
        asyncio.create_task(save_and_prune_tasks_async())


def _build_style_context(target_file: str, character: str):
    target_name = os.path.basename(target_file) if target_file else "无目标文件"
    novel_name = os.path.splitext(os.path.basename(target_file))[0] if target_file else ""
    style_dir = os.path.join(STYLE_DIR, f"{novel_name}_style_imitation")
    main_character_name = None
    if character:
        main_character_name = re.split(r"[\(（]", character)[0].strip()
        target_name += f" ({character})"
    return target_name, style_dir, main_character_name


def _get_cached_output_path(script_type: str, style_dir: str, main_character_name: str):
    resolver = SCRIPT_OUTPUT_MAP.get(script_type)
    if not resolver:
        return None
    return resolver(style_dir, main_character_name)


async def _create_cached_skip_task(script_type: str, model: str, target_name: str) -> dict:
    task_id = str(uuid.uuid4())
    config = _get_script_config(script_type)
    await add_task_safe(
        task_id,
        {
            "name": f"[INFO] [缓存跳过] {script_type} [{model}]: {target_name}",
            "type": script_type,
            "status": "success",
            "start_time": datetime.now().isoformat(),
            "created_at": datetime.now().isoformat(),
            "end_time": datetime.now().isoformat(),
            "ref_file": target_name,
            "stdout": f"检测到 {config['display_name']} 的本地缓存结果，已自动跳过执行。",
            "stderr": "",
            "tokens": 0,
        },
    )
    asyncio.create_task(save_and_prune_tasks_async())
    return _create_started_response(script_type, task_id, "检测到缓存，已自动跳过执行。")


def _build_generic_task_name(script_type: str, model: str, target_name: str) -> str:
    runtime_label = model if script_type != "f4c" else "local"
    return f"{script_type} [{runtime_label}]: {target_name}"


def _build_generic_kwargs(script_type: str, *, target_path: str, project_name: str, character: str, chapter_name: str, model: str):
    if script_type in {"f0", "f1a", "f2a"}:
        return {"target_file": target_path}
    if script_type in {"f1b", "f2b", "f3a", "f3b"}:
        return {"target_file": target_path, "project": project_name, "model": model}
    if script_type == "f3c":
        return {
            "target_file": target_path,
            "character": character,
            "project": project_name,
            "model": model,
        }
    if script_type == "f4b":
        return {"target_file": target_path, "project": project_name}
    if script_type == "f6":
        return {"project": project_name, "chapter": chapter_name, "model": model}
    if script_type == "f7":
        return {"project": project_name, "script_type": "f5b", "chapter": chapter_name, "mode": "loose"}
    return {}


def _validate_generic_inputs(script_type: str, character: str, chapter_name: str):
    if script_type == "f3c" and not character:
        raise ValueError("角色名为空，或因包含非法字符被清洗，请提供有效角色名")
    if script_type in {"f6", "f7"} and not chapter_name:
        raise ValueError(f"{script_type} 需要提供 chapter_name")


@router.get("/api/references")
async def get_references():
    return [f for f in os.listdir(REF_DIR) if os.path.isfile(os.path.join(REF_DIR, f))]


@router.post("/api/references/upload")
async def upload_reference(file: UploadFile = File(...)):
    try:
        safe_filename = os.path.basename(file.filename)
        if not safe_filename:
            raise ValueError("文件名无效或未被系统正确接收")

        name, ext = os.path.splitext(safe_filename)
        allowed_exts = (".txt", ".md")
        if ext.lower() not in allowed_exts:
            raise ValueError(f"安全拦截：仅允许上传 {allowed_exts} 格式的参考文本")

        if len(name) > 80:
            safe_filename = name[:80] + ext
        file_path = os.path.join(REF_DIR, safe_filename)

        def _write_uploaded_file():
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)

        await asyncio.to_thread(_write_uploaded_file)
        return {"status": "success", "filename": safe_filename}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except OSError as exc:
        raise HTTPException(status_code=500, detail="文件写入失败，可能是磁盘或权限异常") from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=mask_sensitive_info(str(exc))) from exc


@router.get("/api/tasks")
async def list_tasks():
    sorted_tasks = sorted(
        TASKS.items(),
        key=lambda item: item[1].get("start_time") or item[1].get("created_at", ""),
        reverse=True,
    )
    return [{"id": task_id, **task} for task_id, task in sorted_tasks[:20]]


@router.get("/api/tasks/{task_id}")
async def get_task_status(task_id: str):
    task = TASKS.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    return task


@router.post("/api/tasks/cancel_latest")
async def cancel_latest_task_route():
    result = await cancel_latest_task()
    return _build_cancel_response(result)


@router.post("/api/tasks/cancel_all")
async def cancel_all_tasks_route():
    results = await cancel_all_tasks()
    return _build_cancel_response(results)


@router.post("/api/tasks/cancel_selected")
async def cancel_selected_tasks_route(req: TaskSelectionRequest):
    results = await cancel_selected_tasks(req.task_ids)
    return _build_cancel_response(results)


@router.post("/api/tasks/clear_oldest")
async def clear_oldest_task_route():
    result = await clear_oldest_task()
    return _build_clear_response(result)


@router.post("/api/tasks/clear_all")
async def clear_all_tasks_route():
    result = await clear_all_tasks()
    return _build_clear_response(result)


@router.post("/api/tasks/clear_selected")
async def clear_selected_tasks_route(req: TaskSelectionRequest):
    result = await clear_selected_tasks(req.task_ids)
    return _build_clear_response(result)


@router.post("/api/scripts/f4a_completion")
async def run_f4a_completion(req: SettingCompletionRequest, x_api_key: str = Header(None)):
    try:
        project_name = _optional_safe_param(req.project_name)
        mode = validate_safe_param(req.mode)
        model = validate_safe_param(req.model)
        runtime_options = _build_runtime_options(req.thinking, req.reasoning_effort)
        _ensure_script_available("f4a")

        target_path = ""
        if req.target_file:
            try:
                target_path = _resolve_target_path(
                    req.target_file, allowed_extensions=(".txt", ".md", ".json")
                )
            except (ValueError, PermissionError) as exc:
                raise HTTPException(status_code=403, detail=mask_sensitive_info(str(exc))) from exc

        kwargs = {
            "target_file": target_path,
            "mode": mode,
            "json_data": f"b64:{_encode_json_payload(req.form_data)}",
            "project": project_name,
            "model": model,
        }
        ref_file_display = os.path.basename(req.target_file) if req.target_file else "无参考原著"
        task_id = await _create_task(
            "f4a",
            f"f4a [{model}]: {mode} - {ref_file_display}",
            ref_file_display,
        )
        asyncio.create_task(
            run_task_safely_pool(
                task_id,
                "scripts.f4a_llm_setting_completion",
                "run_headless",
                kwargs,
                x_api_key,
                runtime_options,
            )
        )
        return _create_started_response("f4a", task_id, f"任务已加入执行队列：f4a（{mode} 模式）")
    except ValueError as exc:
        raise HTTPException(status_code=403, detail=mask_sensitive_info(str(exc))) from exc
    except OSError as exc:
        raise HTTPException(status_code=500, detail=mask_sensitive_info(str(exc))) from exc


@router.post("/api/scripts/f5a_outline")
async def run_f5a_outline(req: ChapterOutlineRequest, x_api_key: str = Header(None)):
    try:
        project_name = validate_safe_param(req.project_name)
        chapter_name = validate_safe_param(req.chapter_name)
        model = validate_safe_param(req.model)
        runtime_options = _build_runtime_options(req.thinking, req.reasoning_effort)
        _ensure_script_available("f5a")

        brief_payload = (
            req.chapter_brief
            if isinstance(req.chapter_brief, dict)
            else {"chapter_brief": req.chapter_brief}
        )
        task_id = await _create_task(
            "f5a",
            f"f5a [{model}]: {project_name} - {chapter_name}",
            project_name,
        )
        asyncio.create_task(
            _run_f5a_inprocess_task(
                task_id,
                project_name=project_name,
                chapter_name=chapter_name,
                chapter_brief=brief_payload,
                model=model,
                api_key=x_api_key,
                runtime_options=runtime_options,
            )
        )
        return _create_started_response("f5a", task_id, "任务已加入执行队列：f5a 大纲生成")
    except ValueError as exc:
        raise HTTPException(status_code=403, detail=mask_sensitive_info(str(exc))) from exc
    except OSError as exc:
        raise HTTPException(status_code=500, detail=mask_sensitive_info(str(exc))) from exc


@router.post("/api/scripts/f5b_prompt_export")
async def export_f5b_prompt(req: NovelGenerationRequest):
    try:
        project_name = validate_safe_param(req.project_name)
        chapter_name = validate_safe_param(req.chapter_name)
        model = validate_safe_param(req.model)
        script_config = _ensure_script_available("f5b")

        project_config_path = os.path.join(PROJ_DIR, project_name, "project_config.json")
        branch_mode = "同人"
        if os.path.exists(project_config_path):
            try:
                with open(project_config_path, "r", encoding="utf-8") as file:
                    config = json.load(file)
                    branch_mode = validate_safe_param(config.get("mode", "同人"))
            except (OSError, json.JSONDecodeError):
                pass

        cmd = [
            sys.executable,
            "-m",
            f"scripts.{script_config['module']}",
            "--project",
            project_name,
            "--chapter",
            chapter_name,
            "--model",
            model,
            "--branch",
            branch_mode,
            "--export_prompt_only",
        ]
        env = os.environ.copy()
        existing_pythonpath = env.get("PYTHONPATH", "")
        env["PYTHONPATH"] = CODE_DIR if not existing_pythonpath else os.pathsep.join([CODE_DIR, existing_pythonpath])
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
            cwd=CODE_DIR,
        )
        stdout, stderr = await process.communicate()
        if process.returncode != 0:
            raise RuntimeError(f"提示词导出失败: {stderr.decode('utf-8', errors='replace')}")
        return {"prompt": stdout.decode("utf-8", errors="replace")}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=mask_sensitive_info(str(exc))) from exc
    except (OSError, RuntimeError) as exc:
        raise HTTPException(status_code=500, detail=mask_sensitive_info(str(exc))) from exc


@router.post("/api/scripts/f5b_generate")
async def run_f5b_generate(req: NovelGenerationRequest, x_api_key: str = Header(None)):
    try:
        project_name = validate_safe_param(req.project_name)
        chapter_name = validate_safe_param(req.chapter_name)
        model = validate_safe_param(req.model)
        runtime_options = _build_runtime_options(req.thinking, req.reasoning_effort)
        _ensure_script_available("f5b")

        kwargs = {
            "project": project_name,
            "chapter": chapter_name,
            "model": model,
            "export_prompt_only": False,
        }
        task_id = await _create_task(
            "f5b",
            f"f5b [{model}]: {project_name} - {chapter_name}",
            project_name,
        )
        asyncio.create_task(
            run_task_safely_pool(
                task_id,
                "scripts.f5b_llm_novel_generation",
                "run_headless",
                kwargs,
                x_api_key,
                runtime_options,
            )
        )
        return _create_started_response("f5b", task_id, "任务已加入执行队列：f5b 正文生成")
    except ValueError as exc:
        raise HTTPException(status_code=403, detail=mask_sensitive_info(str(exc))) from exc
    except OSError as exc:
        raise HTTPException(status_code=500, detail=mask_sensitive_info(str(exc))) from exc


@router.post("/api/scripts/f5c_preview")
async def run_f5c_preview(req: ChapterRewriteRequest):
    try:
        project_name = validate_safe_param(req.project_name)
        chapter_name = validate_safe_param(req.chapter_name)
        mode = validate_safe_param(req.mode)
        model = validate_safe_param(req.model)
        runtime_options = _build_runtime_options(req.thinking, req.reasoning_effort)
        _ensure_script_available("f5c")

        if mode not in {"prefix", "fim"}:
            raise ValueError("mode must be one of: prefix/fim")
        if mode == "fim" and not req.suffix_text:
            raise ValueError("fim 模式必须提供保留后缀文本")

        from scripts.f5c_llm_chapter_rewrite import ChapterRewriteApp

        result = await asyncio.to_thread(
            ChapterRewriteApp.execute_rewrite_preview,
            project_name,
            chapter_name,
            mode,
            req.original_content,
            req.prefix_text,
            req.suffix_text,
            req.selected_text,
            model,
            runtime_options["thinking"],
            runtime_options["reasoning_effort"],
            lambda msg: None,
        )
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=mask_sensitive_info(str(exc))) from exc
    except OSError as exc:
        raise HTTPException(status_code=500, detail=mask_sensitive_info(str(exc))) from exc


@router.post("/api/scripts/{script_type}")
async def run_script(
    script_type: str,
    target_file: str = "",
    project_name: str = "",
    character: str = "",
    chapter_name: str = "",
    model: str = "deepseek-v4-flash",
    thinking: bool = False,
    reasoning_effort: str = "high",
    force: bool = False,
    x_api_key: str = Header(None),
):
    try:
        if character:
            character = re.sub(r'[\\/:\*\?"<>|]', "", character).strip()
        if chapter_name:
            chapter_name = re.sub(r'[\\/:\*\?"<>|]', "", chapter_name).strip()

        script_type = validate_safe_param(script_type)
        project_name = _optional_safe_param(project_name)
        character = _optional_safe_param(character)
        chapter_name = _optional_safe_param(chapter_name)
        model = validate_safe_param(model)
        runtime_options = _build_runtime_options(thinking, reasoning_effort)

        config = _ensure_script_available(script_type)
        _validate_generic_inputs(script_type, character, chapter_name)

        target_path = ""
        if target_file:
            target_path = _resolve_target_path(
                target_file,
                allowed_extensions=(".txt", ".md", ".json", ".index"),
            )

        target_name, style_dir, main_character_name = _build_style_context(target_file, character)
        if script_type == "f4c" and project_name:
            target_name = f"工程前文库[{project_name}]"

        target_output = _get_cached_output_path(script_type, style_dir, main_character_name)
        if (
            config["maturity"] == "stable"
            and not force
            and target_output
            and os.path.exists(target_output)
            and os.path.getsize(target_output) > 10
        ):
            return await _create_cached_skip_task(script_type, model, target_name)

        task_id = await _create_task(
            script_type,
            _build_generic_task_name(script_type, model, target_name),
            target_name,
        )
        kwargs = _build_generic_kwargs(
            script_type,
            target_path=target_path,
            project_name=project_name,
            character=character,
            chapter_name=chapter_name,
            model=model,
        )
        asyncio.create_task(
            run_task_safely_pool(
                task_id,
                f"scripts.{config['module']}",
                "run_headless",
                kwargs,
                x_api_key,
                runtime_options,
            )
        )
        return _create_started_response(
            script_type,
            task_id,
            f"任务已加入执行队列：{script_type} {config['display_name']}",
        )
    except ValueError as exc:
        raise HTTPException(status_code=403, detail=mask_sensitive_info(str(exc))) from exc
    except OSError as exc:
        raise HTTPException(status_code=500, detail=mask_sensitive_info(str(exc))) from exc
