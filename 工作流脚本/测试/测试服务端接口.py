"""服务端黑盒接口测试：自动在测试端口启动 server.mjs，验证 REST 契约后清理。

运行：python 工作流脚本/测试/测试服务端接口.py
可选环境变量：NOVEL_TEST_PORT（默认 4199）
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / "web"
PROJECTS = ROOT / "小说项目"
PORT = int(os.environ.get("NOVEL_TEST_PORT", "4199"))
BASE = f"http://127.0.0.1:{PORT}"


def q(value: str) -> str:
    """查询参数/路径段的百分号编码。"""
    return urllib.parse.quote(value, safe="")

RECORDS: list[str] = []


def check(name: str, fn) -> None:
    try:
        fn()
        RECORDS.append(f"PASS {name}")
    except Exception as error:
        RECORDS.append(f"FAIL {name}: {type(error).__name__}: {error}")


def request(method: str, path: str, body: dict | None = None, expect_json: bool = True, headers: dict | None = None) -> tuple[int, dict | bytes]:
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    req = urllib.request.Request(f"{BASE}{path}", data=data, method=method, headers={"Content-Type": "application/json"} if data else {})
    for key, value in (headers or {}).items():
        req.add_header(key, value)
    try:
        with urllib.request.urlopen(req, timeout=120) as response:
            payload = response.read()
            return response.status, (json.loads(payload.decode("utf-8")) if expect_json else payload)
    except urllib.error.HTTPError as error:
        payload = error.read()
        try:
            return error.code, json.loads(payload.decode("utf-8"))
        except Exception:
            return error.code, payload


def start_server() -> subprocess.Popen:
    env = {**os.environ, "NOVEL_PORT": str(PORT), "PYTHONUTF8": "1"}
    proc = subprocess.Popen(["node", "server.mjs"], cwd=str(WEB), env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(50):
        try:
            with urllib.request.urlopen(f"{BASE}/api/projects", timeout=1):
                return proc
        except Exception:
            time.sleep(0.2)
    proc.terminate()
    raise RuntimeError(f"服务未能在测试端口 {PORT} 启动")


PROJECT = f"测试-接口-{uuid.uuid4().hex[:6]}"
DISK = f"原创-{PROJECT}"  # 项目在磁盘上的完整名称（前端始终使用该名称）


def test_projects_list() -> None:
    status, data = request("GET", "/api/projects")
    assert status == 200 and isinstance(data.get("projects"), list)


def test_project_create_and_duplicate() -> None:
    status, data = request("POST", "/api/projects", {"name": PROJECT, "type": "原创"})
    assert status == 201 and data["project"] == f"原创-{PROJECT}", data
    status, data = request("POST", "/api/projects", {"name": PROJECT, "type": "原创"})
    assert status == 409, f"重名项目应返回 409：{status}"


def test_project_create_requires_name() -> None:
    status, _ = request("POST", "/api/projects", {"name": "a/b", "type": "原创"})
    assert status == 400, f"非法项目名应返回 400：{status}"


def test_file_write_read() -> None:
    status, data = request("PUT", "/api/file", {"project": DISK, "path": "正文/第1章：接口.txt", "content": "接口测试正文"})
    assert status == 200, data
    status, data = request("GET", f"/api/file?project={q(DISK)}&path={q('正文/第1章：接口.txt')}")
    assert status == 200 and data["content"] == "接口测试正文"


def test_file_rejects_mjs_extension() -> None:
    status, _ = request("PUT", "/api/file", {"project": DISK, "path": "正文/坏.mjs", "content": "x"})
    assert status == 400, f".mjs 应被拒绝：{status}"


def test_file_rejects_traversal() -> None:
    status, _ = request("GET", f"/api/file?project={q(DISK)}&path={q('../../工作台设置.json')}")
    assert status == 400, f"路径穿越应被拒绝：{status}"


def test_upload_text_source_and_reject_word() -> None:
    """同人原著只允许可被提取器直接读取的纯文本格式。"""
    text_data = "data:text/plain;base64,dGVzdA=="
    status, data = request("POST", "/api/upload", {"project": DISK, "name": "原著.txt", "data": text_data})
    assert status == 201 and data["path"] == "原著/原著.txt", data
    status, _ = request("POST", "/api/upload", {"project": DISK, "name": "原著.docx", "data": text_data})
    assert status == 400, f".docx 应被拒绝：{status}"


def test_file_rename_and_delete() -> None:
    request("PUT", "/api/file", {"project": DISK, "path": "知识库/临时.md", "content": "临时"})
    status, data = request("PATCH", "/api/file", {"project": DISK, "from": "知识库/临时.md", "to": "知识库/临时2.md"})
    assert status == 200 and data["path"] == "知识库/临时2.md"
    status, data = request("DELETE", f"/api/file?project={q(DISK)}&path={q('知识库/临时2.md')}")
    assert status == 200 and data["deleted"] == "知识库/临时2.md"


def test_chapter_delete_removes_prompts() -> None:
    request("PUT", "/api/file", {"project": DISK, "path": "正文/第2章：删除.txt", "content": "正文"})
    request("PUT", "/api/file", {"project": DISK, "path": "提示词/第2章：删除/配置.md", "content": "配置"})
    status, data = request("DELETE", f"/api/chapter?project={q(DISK)}&prosePath={q('正文/第2章：删除.txt')}")
    assert status == 200 and data["deleted"] == "正文/第2章：删除.txt" and "提示词/第2章：删除" in data["promptDirs"], data
    status, _ = request("GET", f"/api/file?project={q(DISK)}&path={q('提示词/第2章：删除/配置.md')}")
    assert status == 404, "提示词目录应被连带删除"


def test_settings_roundtrip_read() -> None:
    status, data = request("GET", "/api/settings")
    assert status == 200 and "providers" in data["settings"] and "scriptModels" in data["settings"]


def test_default_assets() -> None:
    status, data = request("GET", "/api/default-assets?asset=language_style")
    assert status == 200 and data["content"].strip(), data
    status, _ = request("GET", "/api/default-assets?asset=no_such")
    assert status == 400, f"未知默认资料应返回 400：{status}"


def test_workflow_local_task_end_to_end() -> None:
    """纯本地任务（compile_config）无需 API 配置即可经 HTTP 全链路执行。"""
    payload = {"task": "compile_config", "project": DISK, "inputMode": "structured", "inputComplete": True,
               "input": {"chapter": "第1章：接口", "person": "第三人称", "information": ["人物出场"]}, "runId": "test-run-0001"}
    status, data = request("POST", "/api/workflow/run", payload)
    assert status == 200 and data.get("ok") is True, data
    assert any("配置.md" in output for output in data.get("outputs", [])), data


def test_workflow_runid_reuse_after_completion() -> None:
    """任务完成释放 runId 后，同一 runId 可再次使用（运行中才去重）。"""
    payload = {"task": "compile_config", "project": DISK, "inputMode": "structured", "inputComplete": True,
               "input": {"chapter": "第1章：接口", "person": "第三人称"}, "runId": "test-run-dup-0001"}
    status, data = request("POST", "/api/workflow/run", payload)
    assert status == 200 and data.get("ok") is True, data


def test_workflow_unknown_task_rejected() -> None:
    status, _ = request("POST", "/api/workflow/run", {"task": "no_such_task", "project": DISK, "inputMode": "structured", "input": {}})
    assert status == 400, f"未知任务应返回 400：{status}"


def test_workflow_cancel_unknown_runid() -> None:
    status, _ = request("POST", "/api/workflow/cancel", {"runId": "no-such-run-id-0001"})
    assert status == 404, f"取消不存在的任务应返回 404：{status}"


def test_rejects_foreign_origin() -> None:
    """恶意网页的跨源简单请求（如 DELETE）不触发 CORS 预检，必须在服务端按 Origin 拒绝。"""
    status, _ = request("GET", "/api/projects", headers={"Origin": "https://evil.example"})
    assert status == 403, f"外站 Origin 应返回 403：{status}"
    status, _ = request("GET", "/api/projects", headers={"Origin": f"http://127.0.0.1:{PORT}"})
    assert status == 200, f"本机 Origin 应正常放行：{status}"
    status, _ = request("GET", "/api/projects")
    assert status == 200, f"无 Origin 的工作台请求应正常放行：{status}"


def test_workflow_spills_large_input() -> None:
    """超过命令行上限的大输入应改走临时文件（--input_file）且执行成功。"""
    payload = {"task": "compile_config", "project": DISK, "inputMode": "structured", "inputComplete": True,
               "input": {"chapter": "第1章：接口", "person": "第三人称", "information": ["人物出场"], "user_supplement": "补充" * 20000}}
    assert len(json.dumps(payload["input"], ensure_ascii=False)) > 30_000, "测试输入应超过 Windows 命令行上限"
    status, data = request("POST", "/api/workflow/run", payload)
    assert status == 200 and data.get("ok") is True, data
    assert any("配置.md" in output for output in data.get("outputs", [])), data


def test_static_whitelist() -> None:
    status, _ = request("GET", "/", expect_json=False)
    assert status == 200
    status, _ = request("GET", "/app.js", expect_json=False)
    assert status == 200
    status, _ = request("GET", "/server.mjs", expect_json=False)
    assert status == 404, f"服务端源码不应可下载：{status}"


def test_port_conflict_exits() -> None:
    env = {**os.environ, "NOVEL_PORT": str(PORT)}
    proc = subprocess.Popen(["node", "server.mjs"], cwd=str(WEB), env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        _, stderr = proc.communicate(timeout=15)
        assert proc.returncode == 1, f"第二个实例应以退出码 1 结束：{proc.returncode}"
        assert "已被占用" in stderr.decode("utf-8", errors="replace")
    except subprocess.TimeoutExpired:
        proc.kill()
        raise AssertionError("第二个实例没有按预期退出")


def test_project_delete() -> None:
    status, data = request("DELETE", f"/api/projects/{q('原创-' + PROJECT)}")
    assert status == 200, data
    status, _ = request("GET", f"/api/file?project={q(DISK)}&path={q('正文/第1章：接口.txt')}")
    assert status in (400, 404), "删除后文件应不可访问"
    status, data = request("GET", "/api/projects")
    assert f"原创-{PROJECT}" not in data["projects"]


def main() -> int:
    server = start_server()
    try:
        checks = [(name, fn) for name, fn in globals().items() if name in
                  {"test_projects_list", "test_project_create_and_duplicate", "test_project_create_requires_name",
                   "test_file_write_read", "test_file_rejects_mjs_extension", "test_file_rejects_traversal", "test_upload_text_source_and_reject_word",
                   "test_file_rename_and_delete", "test_chapter_delete_removes_prompts", "test_settings_roundtrip_read",
                   "test_default_assets", "test_workflow_local_task_end_to_end", "test_workflow_runid_reuse_after_completion",
                   "test_workflow_unknown_task_rejected", "test_workflow_cancel_unknown_runid", "test_rejects_foreign_origin",
                   "test_workflow_spills_large_input", "test_static_whitelist",
                   "test_port_conflict_exits", "test_project_delete"}]
        for name, fn in checks:
            check(name, fn)
    finally:
        # 即便测试失败，也尽量清掉临时项目，避免污染 小说项目/。
        try:
            request("DELETE", f"/api/projects/{q('原创-' + PROJECT)}")
        except Exception:
            pass
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()
    for line in RECORDS:
        print(line)
    failed = sum(1 for line in RECORDS if line.startswith("FAIL"))
    print(f"\n共 {len(RECORDS)} 项：通过 {len(RECORDS) - failed}，失败 {failed}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
