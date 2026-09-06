import asyncio
import json
import os
import re
import subprocess
import sys
import time
import threading
from datetime import datetime

from .config import CODE_DIR, PROJ_DIR
from core._core_utils import async_atomic_write, mask_sensitive_info

background_semaphore = asyncio.Semaphore(1)
stream_semaphore = asyncio.Semaphore(3)

TASKS = {}
TASKS_DB_PATH = os.path.join(PROJ_DIR, "system_tasks_db.json")
MAX_RETAINED_TASKS = 50
MAX_LOG_BUFFER_LENGTH = 15000

ACTIVE_PROCESSES = {}
ACTIVE_TASK_STATUSES = {"running", "pending", "queued"}
TASK_STALL_TIMEOUT = 300
_watchdog_started = False

db_save_lock = asyncio.Lock()
tasks_state_lock = asyncio.Lock()
active_procs_lock = asyncio.Lock()


def _task_sort_key(task: dict) -> str:
    return task.get("start_time") or task.get("created_at") or ""


def _append_task_log(task: dict, message: str, key: str = "stdout") -> None:
    existing = task.get(key, "")
    task[key] = f"{existing}{message}"[-MAX_LOG_BUFFER_LENGTH:]


def _mark_task_cancelled(task: dict, reason: str) -> None:
    task["status"] = "cancelled"
    task["error"] = reason
    task["end_time"] = datetime.now().isoformat()
    _append_task_log(task, f"\n[SYSTEM] {reason}\n")


def _mark_task_active(task: dict) -> None:
    task["status"] = "running"
    task["start_time"] = datetime.now().isoformat()
    task["last_active_time"] = time.time()
    task["stdout"] = "[系统] 引擎启动成功，开始执行底层计算流程...\n"


def _mark_task_queued(task: dict) -> None:
    task["status"] = "queued"
    task["stdout"] = "[系统调度] 任务已就绪，正在准备启动处理引擎...\n"
    task["stderr"] = ""
    task["tokens"] = 0
    task["last_active_time"] = time.time()


def _finalize_task(task: dict) -> None:
    task["end_time"] = datetime.now().isoformat()


def _extract_latest_token_count(decoded_line: str) -> int | None:
    token_matches = re.findall(r"(?:[Tt]okens?|消耗)[:=\s]*(\d+)", decoded_line)
    if token_matches:
        return int(token_matches[-1])
    return None


def _extract_latest_token_count_safe(decoded_line: str) -> int | None:
    token_matches = re.findall(
        r"(?:Total\s+Tokens|[Tt]okens?|消耗Token|消耗)[:=\s]*(\d+)",
        decoded_line,
    )
    if token_matches:
        return int(token_matches[-1])
    return None


def _build_task_env(api_key: str | None, runtime_options: dict | None = None) -> dict:
    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"
    env["PYTHONIOENCODING"] = "utf-8"

    if api_key:
        env["DEEPSEEK_API_KEY"] = api_key

    if runtime_options:
        if "thinking" in runtime_options:
            env["DEEPSEEK_THINKING"] = "true" if runtime_options["thinking"] else "false"
        if runtime_options.get("reasoning_effort"):
            env["DEEPSEEK_REASONING_EFFORT"] = str(runtime_options["reasoning_effort"]).strip().lower()

    if not (env.get("SILICONFLOW_API_KEY") or "").strip():
        for alias in ("EMBEDDING_API_KEY", "SILICONFLOW_KEY", "SILICONFLOW_APIKEY"):
            alias_val = (env.get(alias) or "").strip()
            if alias_val:
                env["SILICONFLOW_API_KEY"] = alias_val
                break

    existing_pythonpath = env.get("PYTHONPATH", "")
    env["PYTHONPATH"] = CODE_DIR if not existing_pythonpath else os.pathsep.join([CODE_DIR, existing_pythonpath])
    return env


async def _run_subprocess_thread_fallback(task_id: str, cmd_list: list, env: dict) -> None:
    loop = asyncio.get_running_loop()

    def _worker():
        process = subprocess.Popen(
            cmd_list,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env,
            cwd=CODE_DIR,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        return process.communicate(), process.returncode

    (stdout_text, stderr_text), returncode = await loop.run_in_executor(None, _worker)

    async with tasks_state_lock:
        task = TASKS.get(task_id)
        if not task or task.get("status") == "cancelled":
            return
        task["last_active_time"] = time.time()
        latest_tokens = _extract_latest_token_count_safe(stdout_text or "")
        if latest_tokens is not None:
            task["tokens"] = latest_tokens
        _append_task_log(task, stdout_text or "", "stdout")
        _append_task_log(task, stderr_text or "", "stderr")
        task["returncode"] = returncode
        task["status"] = "success" if returncode == 0 else "failed"


async def _terminate_process(process) -> None:
    if not process:
        return
    try:
        subprocess.run(
            ["taskkill", "/F", "/T", "/PID", str(process.pid)],
            capture_output=True,
            check=False,
        )
        await process.wait()
    except (OSError, ProcessLookupError):
        pass


async def cancel_task_by_id(task_id: str, reason: str = "用户手动终止任务"):
    async with tasks_state_lock:
        task = TASKS.get(task_id)
        if not task:
            return None
        if task.get("status") not in ACTIVE_TASK_STATUSES:
            return {
                "task_id": task_id,
                "task_name": task.get("name", task_id),
                "already_finished": True,
                "status": task.get("status"),
            }
        _mark_task_cancelled(task, reason)
        task_name = task.get("name", task_id)

    async with active_procs_lock:
        process = ACTIVE_PROCESSES.get(task_id)

    await _terminate_process(process)
    asyncio.create_task(save_and_prune_tasks_async())
    return {"task_id": task_id, "task_name": task_name, "already_finished": False}


async def cancel_latest_task(reason: str = "用户手动终止最近任务"):
    async with tasks_state_lock:
        active_items = [
            (task_id, task)
            for task_id, task in TASKS.items()
            if task.get("status") in ACTIVE_TASK_STATUSES
        ]
        if not active_items:
            return None
        task_id, _ = max(active_items, key=lambda item: _task_sort_key(item[1]))

    return await cancel_task_by_id(task_id, reason=reason)


async def cancel_all_tasks(reason: str = "用户手动终止全部任务"):
    async with tasks_state_lock:
        task_ids = [
            task_id
            for task_id, task in TASKS.items()
            if task.get("status") in ACTIVE_TASK_STATUSES
        ]

    cancelled = []
    for task_id in task_ids:
        result = await cancel_task_by_id(task_id, reason=reason)
        if result and not result.get("already_finished"):
            cancelled.append(result)
    return cancelled


async def cancel_selected_tasks(task_ids: list[str], reason: str = "用户手动终止勾选任务"):
    cancelled = []
    for task_id in task_ids:
        result = await cancel_task_by_id(task_id, reason=reason)
        if result and not result.get("already_finished"):
            cancelled.append(result)
    return cancelled


async def clear_task_by_id(task_id: str):
    async with tasks_state_lock:
        task = TASKS.get(task_id)
        if not task:
            return None
        if task.get("status") in ACTIVE_TASK_STATUSES:
            return {
                "task_id": task_id,
                "task_name": task.get("name", task_id),
                "skipped": True,
                "reason": "ACTIVE_TASK",
            }
        task_name = task.get("name", task_id)
        TASKS.pop(task_id, None)

    asyncio.create_task(save_and_prune_tasks_async())
    return {"task_id": task_id, "task_name": task_name, "skipped": False}


async def clear_selected_tasks(task_ids: list[str]):
    cleared = []
    skipped = []
    for task_id in task_ids:
        result = await clear_task_by_id(task_id)
        if not result:
            continue
        if result.get("skipped"):
            skipped.append(result)
        else:
            cleared.append(result)
    return {"cleared": cleared, "skipped": skipped}


async def clear_all_tasks():
    async with tasks_state_lock:
        task_ids = list(TASKS.keys())
    return await clear_selected_tasks(task_ids)


async def clear_oldest_task():
    async with tasks_state_lock:
        finished_items = [
            (task_id, task)
            for task_id, task in TASKS.items()
            if task.get("status") not in ACTIVE_TASK_STATUSES
        ]
        if not finished_items:
            active_exists = any(task.get("status") in ACTIVE_TASK_STATUSES for task in TASKS.values())
            if active_exists:
                return {"cleared": [], "skipped": [{"reason": "ONLY_ACTIVE_TASKS"}]}
            return {"cleared": [], "skipped": []}

        task_id, _ = min(finished_items, key=lambda item: _task_sort_key(item[1]))
    return await clear_selected_tasks([task_id])


def load_tasks_safe() -> None:
    """Load task history and downgrade unfinished tasks after restart."""
    global TASKS
    if not os.path.exists(TASKS_DB_PATH):
        return

    try:
        with open(TASKS_DB_PATH, "r", encoding="utf-8") as file:
            loaded_tasks = json.load(file)
        for task_info in loaded_tasks.values():
            if task_info.get("status") in ACTIVE_TASK_STATUSES:
                task_info["status"] = "failed"
                task_info["error"] = "系统重启：历史中断任务已清理。"
        TASKS.update(loaded_tasks)
    except OSError as exc:
        print(f"[WARN] 历史任务数据库加载失败，文件系统读取异常: {mask_sensitive_info(str(exc))}")
    except json.JSONDecodeError as exc:
        print(f"[WARN] 历史任务数据库加载失败，JSON 格式已损坏: {exc}")


async def add_task_safe(task_id: str, task_info: dict) -> None:
    async with tasks_state_lock:
        TASKS[task_id] = task_info


async def save_and_prune_tasks_async() -> None:
    async with db_save_lock:
        async with tasks_state_lock:
            finished_tasks = {
                key: value
                for key, value in TASKS.items()
                if value.get("status") not in ACTIVE_TASK_STATUSES
            }

            if len(finished_tasks) > MAX_RETAINED_TASKS:
                sorted_keys = sorted(
                    finished_tasks.keys(),
                    key=lambda key: finished_tasks[key].get("created_at", ""),
                    reverse=True,
                )
                for key in sorted_keys[MAX_RETAINED_TASKS:]:
                    TASKS.pop(key, None)

            snapshot = {key: value.copy() for key, value in TASKS.items()}

        try:
            await async_atomic_write(TASKS_DB_PATH, snapshot, "json")
        except (RuntimeError, OSError) as exc:
            print(f"[ERROR] 任务状态落盘失败: {mask_sensitive_info(str(exc))}")


async def start_watchdog_if_needed() -> None:
    global _watchdog_started
    if not _watchdog_started:
        _watchdog_started = True
        asyncio.create_task(zombie_reaper_loop())


async def zombie_reaper_loop() -> None:
    """Watch running tasks and force-kill stalled subprocesses."""
    while True:
        await asyncio.sleep(60)
        current_time = time.time()

        async with active_procs_lock:
            procs_snapshot = list(ACTIVE_PROCESSES.items())

        async with tasks_state_lock:
            for task_id, proc in procs_snapshot:
                task = TASKS.get(task_id)
                if not task or task.get("status") != "running":
                    continue

                last_active = task.get("last_active_time", current_time)
                if current_time - last_active <= TASK_STALL_TIMEOUT:
                    continue

                print(f"[WATCHDOG ALARM] 发现卡死进程 (TaskID: {task_id})，准备强制终止。")
                try:
                    subprocess.run(
                        ["taskkill", "/F", "/T", "/PID", str(proc.pid)],
                        capture_output=True,
                        check=False,
                    )
                    task["error"] = (
                        f"【系统看门狗介入】检测到进程超过 {TASK_STALL_TIMEOUT} 秒无响应输出，"
                        "疑似卡死，已被强制终止。"
                    )
                    task["status"] = "failed"
                except Exception as exc:
                    print(f"[WATCHDOG ERROR] 终止失败: {exc}")


async def run_task_safely_pool(
    task_id: str,
    module_name: str,
    func_name: str,
    kwargs: dict,
    api_key: str = None,
    runtime_options: dict | None = None,
):
    """Backward-compatible wrapper for subprocess-based task execution."""
    cmd = [sys.executable, "-m", module_name]
    for key, value in kwargs.items():
        if isinstance(value, bool):
            if value:
                cmd.append(f"--{key}")
        else:
            cmd.extend([f"--{key}", str(value)])

    await run_task_safely(task_id, cmd, api_key, runtime_options)


async def run_task_safely(
    task_id: str,
    cmd_list: list,
    api_key: str = None,
    runtime_options: dict | None = None,
) -> None:
    await start_watchdog_if_needed()

    async with tasks_state_lock:
        task = TASKS.get(task_id)
        if task:
            _mark_task_queued(task)

    asyncio.create_task(save_and_prune_tasks_async())
    env = _build_task_env(api_key, runtime_options)

    try:
        async with background_semaphore:
            async with tasks_state_lock:
                task = TASKS.get(task_id)
                if not task or task.get("status") == "cancelled":
                    return
                _mark_task_active(task)

            try:
                process = await asyncio.create_subprocess_exec(
                    *cmd_list,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    env=env,
                    cwd=CODE_DIR,
                )
            except NotImplementedError:
                await _run_subprocess_thread_fallback(task_id, cmd_list, env)
                return

            async with active_procs_lock:
                ACTIVE_PROCESSES[task_id] = process

            async with tasks_state_lock:
                task = TASKS.get(task_id)
                cancelled_before_reader = not task or task.get("status") == "cancelled"
            if cancelled_before_reader:
                await _terminate_process(process)
                return

            async def pipe_reader(stream, key: str) -> None:
                while True:
                    try:
                        line = await stream.readline()
                        if not line:
                            break
                    except asyncio.LimitOverrunError:
                        try:
                            trash_data = await stream.read(65536)
                            if not trash_data:
                                break
                            line = (
                                "\n[SYSTEM WARN] 子进程输出了超长无换行数据，"
                                "触发 OS 管道溢出保护，已执行截断清理...\n"
                            ).encode("utf-8")
                        except Exception:
                            break
                    except OSError:
                        break

                    try:
                        decoded_line = line.decode("utf-8")
                    except UnicodeDecodeError:
                        decoded_line = line.decode("gbk", errors="replace")

                    async with tasks_state_lock:
                        task = TASKS.get(task_id)
                        if not task:
                            continue
                        task["last_active_time"] = time.time()
                        if key == "stdout":
                            latest_tokens = _extract_latest_token_count_safe(decoded_line)
                            if latest_tokens is not None:
                                task["tokens"] = latest_tokens
                        _append_task_log(task, decoded_line, key)

            try:
                await asyncio.wait_for(
                    asyncio.gather(
                        pipe_reader(process.stdout, "stdout"),
                        pipe_reader(process.stderr, "stderr"),
                        process.wait(),
                    ),
                    timeout=1800.0,
                )

                async with tasks_state_lock:
                    task = TASKS.get(task_id)
                    if task and task.get("status") not in {"failed", "cancelled"}:
                        task["returncode"] = process.returncode
                        task["status"] = "success" if process.returncode == 0 else "failed"

            except asyncio.TimeoutError:
                try:
                    subprocess.run(
                        ["taskkill", "/F", "/T", "/PID", str(process.pid)],
                        capture_output=True,
                        check=False,
                    )
                    await process.wait()
                except OSError:
                    pass

                async with tasks_state_lock:
                    task = TASKS.get(task_id)
                    if task:
                        task["status"] = "failed"
                        task["error"] = "绝对超时拦截：任务执行超过 30 分钟上限，已强制终止。"

            finally:
                async with active_procs_lock:
                    ACTIVE_PROCESSES.pop(task_id, None)

    except OSError:
        async with tasks_state_lock:
            task = TASKS.get(task_id)
            if task:
                task["status"] = "error"
                task["error"] = "系统子进程调度异常：权限不足或运行环境受限。"
    except Exception as exc:
        async with tasks_state_lock:
            task = TASKS.get(task_id)
            if task:
                task["status"] = "error"
                task["error"] = f"系统执行异常：{exc.__class__.__name__}: {mask_sensitive_info(str(exc))}"
    finally:
        async with tasks_state_lock:
            task = TASKS.get(task_id)
            if task:
                _finalize_task(task)
        asyncio.create_task(save_and_prune_tasks_async())
