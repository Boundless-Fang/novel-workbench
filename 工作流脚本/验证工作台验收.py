"""小说工作台端到端验收（不触碰现有小说）。

覆盖：项目创建/上传/切换契约/删除、初始化和章节流程的前端契约，
以及现有无模型流程验证。默认不会调用模型，也不会消耗 API 额度。

运行前先启动网页服务：
    cd web
    node server.mjs

执行：
    python 验证工作台验收.py
    python 验证工作台验收.py --live-model

--live-model 会用本文件内的《逆鳞》测试资料真实调用已配置的模型，产生并
删除两个“*-验收-逆鳞-<随机串>”临时项目。仅在需要验收真实 API、模型输出和
全流程产物时使用。

尚未验收：校验“通过”后的资产增量更新。当前前端只有提示文案，后端尚无对应
的 update/increment 工作流任务；该项保留为后续新增验收点。
"""
from __future__ import annotations

import argparse
import base64
import json
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
APP = WEB / "app.js"
SERVER = WEB / "server.mjs"
BASE_URL = "http://127.0.0.1:4173"

SOURCE_TEXT = """白釉：女主；狐族千金，当年逃婚，后为正道仙子，今为救子回妖族取真龙之血；假身份狐族流落孤女、少年侍女近卫
敖玦：少年；妖皇血脉，试炼获胜者；称白釉“釉儿”；以本命逆鳞与白釉交易半份精血
敖苍：妖皇（蛟族）
敖曜：大皇子（嫡长子），发动政变
谢玄珩：正道魁首，白釉丈夫；与白釉原定若少年不肯交血则强取，今日现身
鼋戎：反叛大臣，大势已去后倒戈擒下谢玄珩将功赎罪
归藏：妖皇忠直老臣，趁机劝降叛臣
"""

INITIALIZATION = """女主白釉表面是闻名天下的正道仙子，实为当年逃婚的狐族千金。她嫁给正道魁首谢玄珩后，儿子被害留下隐疾，十六年未解；唯一续命希望是真龙之血，只有妖皇敖苍能赏赐。白釉回妖族途中救下遭暗杀的妖皇血脉少年敖玦，假扮他的狐族流落孤女侍女近卫。二人约定：白釉助他赢下妖皇试炼，事成取半份真龙精血；敖玦以本命逆鳞抵押。二人九死一生赢下试炼，妖皇要求二人成婚，大婚当天赐下真龙精血。
角色：白釉是狐族千金、正道仙子、谢玄珩之妻、敖玦侍女近卫；敖玦是试炼获胜者、交易同盟；敖苍是蛟族妖皇；敖曜将发动政变；鼋戎会倒戈；归藏劝降叛臣。真龙精血是白釉救子关键，本命逆鳞仍在白釉手中，嫁衣是大婚当天所穿。"""

CHAPTER_INPUT = """大婚当天，披着嫁衣的白釉陪敖玦领赏，妖皇敖苍赐下真龙精血。敖曜伙同大臣逼宫，白釉救下危在旦夕的敖玦；谢玄珩现身，明确要取敖苍之命。敖苍认定叛军勾结正道，与谢玄珩缠斗；归藏劝降，鼋戎在局势逆转时倒戈。白釉安置敖玦后苦战。敖玦喝下整份真龙精血，实力大增，击杀敖曜；谢玄珩逃走时被敖苍和鼋戎擒住。结尾白釉捏着敖玦的逆鳞，震惊他没有留下约定的半份精血，救子计划落空。"""


class Check:
    def __init__(self) -> None:
        self.records: list[str] = []

    def ok(self, name: str) -> None:
        self.records.append(f"PASS {name}")

    def require(self, condition: bool, name: str) -> None:
        if not condition:
            raise AssertionError(name)
        self.ok(name)


def request(method: str, path: str, body: dict[str, Any] | None = None, timeout_seconds: int = 20) -> tuple[int, dict[str, Any]]:
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    req = urllib.request.Request(BASE_URL + path, data=data, method=method, headers={"Content-Type": "application/json"} if data else {})
    try:
        with urllib.request.urlopen(req, timeout=timeout_seconds) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        return error.code, json.loads(error.read().decode("utf-8"))


def project_tree(name: str) -> list[dict[str, Any]]:
    status, payload = request("GET", f"/api/projects/{urllib.parse.quote(name)}/tree")
    if status != 200:
        raise AssertionError(f"无法读取项目树：{payload}")
    return payload["tree"]


def flat_paths(nodes: list[dict[str, Any]]) -> set[str]:
    found: set[str] = set()
    for node in nodes:
        found.add(node["path"])
        found.update(flat_paths(node.get("children", [])))
    return found


def verify_frontend_contract(check: Check) -> None:
    """无需模型的静态契约：防止 UI 再次把功能接到错误流程。"""
    source = APP.read_text(encoding="utf-8")
    checks = {
        "同人新建要求参考文本": "type==='同人'&&!source",
        "创建后激活新项目": "activate(project.id);",
        "章节锚点要求输入": "请输入本章信息",
        "章节信息调用判别端点": "/api/chapter-brief/assess",
        "发送与下一步共用章节执行": "executeCurrentChapter(project,supplement)",
        "下一步共用章节执行": "executeCurrentChapter(project);",
        "每步完成卡含撤回": 'data-new-action="undo"',
        "每步完成卡含重试": 'data-new-action="retry"',
        "初始化从小说资料开始": "name:'小说资料'",
        "同人提取是五个实际步骤": "positive_vocabulary",  # 与下项共同确保五步在流程中
        "初始化资料可持续追加": "## 用户补充",
        "章节输入保存到独立文件": "运行记录/章节输入/${item.name}.md",
        "章节步骤携带累积用户信息": "user_supplement:item.chapterUserInfo",
    }
    for label, needle in checks.items():
        check.require(needle in source, label)
    check.require(all(step in source for step in ("text_stats", "word_frequency", "style", "positive_vocabulary", "exclusive_vocabulary")), "同人五项提取流程均已声明")


def create_project(check: Check, kind: str, title: str) -> str:
    status, payload = request("POST", "/api/projects", {"name": title, "type": kind, "defaultAssets": []})
    check.require(status == 201, f"创建{kind}项目")
    return payload["project"]


def upload_source(check: Check, project: str) -> None:
    content = base64.b64encode(SOURCE_TEXT.encode("utf-8")).decode("ascii")
    status, payload = request("POST", "/api/upload", {"project": project, "name": "逆鳞原著.txt", "data": f"data:text/plain;base64,{content}"})
    check.require(status == 201 and payload.get("path") == "原著/逆鳞原著.txt", "同人原著上传端点")
    check.require("原著/逆鳞原著.txt" in flat_paths(project_tree(project)), "上传原著出现在项目树")


def delete_project(check: Check, project: str) -> None:
    status, payload = request("DELETE", f"/api/projects/{urllib.parse.quote(project)}")
    check.require(status == 200 and payload.get("deleted") == project, "删除临时项目")
    status, listing = request("GET", "/api/projects")
    check.require(status == 200 and project not in listing["projects"], "删除后项目列表不再出现")


def run_live_workflow(check: Check, project: str, fan: bool) -> None:
    """真实模型验收；仅由 --live-model 显式开启。"""
    def live_request(path: str, body: dict[str, Any]) -> tuple[int, dict[str, Any]]:
        return request("POST", path, body, timeout_seconds=660)

    status, result = live_request("/api/project-brief/assess", {"project": project, "content": "白釉为救隐疾儿子回妖族，与少年敖玦交易真龙精血，在大婚政变中面临约定破裂。"})
    check.require(status == 200 and not result.get("missing"), f"模型判别小说资料（HTTP {status}，响应：{json.dumps(result, ensure_ascii=True)}）")
    material = "# 初始化资料\n\n" + INITIALIZATION + "\n"
    status, _ = request("PUT", "/api/file", {"project": project, "path": "运行记录/初始化资料.md", "content": material})
    check.require(status == 200, "保存初始化原始输入")
    tasks: list[tuple[str, dict[str, Any]]] = []
    if fan:
        tasks += [(name, {"source": "逆鳞原著.txt"}) for name in ("text_stats", "word_frequency", "style", "positive_vocabulary", "exclusive_vocabulary")]
    tasks += [
        ("compile_intro", {"summary": result["summary"], "tags": result["tags"]}),
        ("generate_worldview", {"genre": "东方玄幻", "premise": "白釉为救子回妖族寻真龙精血"}),
        ("compile_style", {"tone": "紧张克制、古风玄幻"}),
        ("generate_character", {"name": "白釉", "identity": "狐族千金、正道仙子"}),
        ("generate_character", {"name": "敖玦", "identity": "妖皇血脉少年"}),
        ("compile_relation", {"character_a": "白釉", "character_b": "敖玦", "relationship": "真龙精血交易同盟"}),
        ("compile_plot", {"kind": "book", "protagonist": "白釉", "mainline": "救子取血与逆鳞交易"}),
        ("compile_volume", {"volume": "第1卷：逆鳞", "protagonist": "白釉", "mainline": "妖皇试炼至大婚政变"}),
        ("compile_ledger", {"entries": []}),
    ]
    for task, payload in tasks:
        status, result = live_request("/api/workflow/run", {"task": task, "project": project, "inputMode": "structured", "inputComplete": True, "input": payload})
        check.require(status == 200 and result.get("outputs"), f"模型初始化：{task}（HTTP {status}，响应：{json.dumps(result, ensure_ascii=True)}）")

    status, result = live_request("/api/chapter-brief/assess", {"project": project, "chapter": "第1章：逆鳞", "content": CHAPTER_INPUT})
    check.require(status == 200 and not result.get("missing"), "模型判别首章输入")
    chapter_tasks = [
        ("compile_anchor", {"characters": result["characters"], "core_event": result["core_event"], "information_boundary": "白釉与谢玄珩原计划强取精血不可直接公开", "foreshadowing": "逆鳞仍握在白釉手中", "hook": "半份精血约定破裂"}),
        ("compile_config", {"person": "第三人称", "information": ["政变", "真龙精血", "逆鳞交易"]}),
        ("compile_dialogue", {"dialogues": [{"character": "敖玦", "line": "釉儿，别过来。"}]}),
        ("compile_snapshot", {"characters": ["白釉", "敖玦", "敖苍", "敖曜", "谢玄珩"], "previous_ending": "大婚领赏，政变骤起。"}),
        ("generate_prose", {}),
        ("validate", {}),
        ("rewrite_prose", {"instruction": "保持全部既定事实，提升战斗节奏与结尾悬念。"}),
    ]
    for task, payload in chapter_tasks:
        status, response = live_request("/api/workflow/run", {"task": task, "project": project, "inputMode": "structured", "inputComplete": True, "input": {"chapter": "第1章：逆鳞", **payload}})
        check.require(status == 200 and response.get("outputs"), f"模型章节流程：{task}（HTTP {status}，响应：{json.dumps(response, ensure_ascii=True)}）")


def main() -> int:
    parser = argparse.ArgumentParser(description="小说工作台验收")
    parser.add_argument("--live-model", action="store_true", help="真实调用已配置 API，完整执行初始化与章节生成")
    parser.add_argument("--report", type=Path, help="将逐项验收结果写入指定 UTF-8 文本文件")
    args = parser.parse_args()
    check = Check()
    suffix = uuid.uuid4().hex[:8]
    fan = f"同人-验收-逆鳞-{suffix}"
    original = f"原创-验收-逆鳞-{suffix}"
    created: list[str] = []
    try:
        status, _ = request("GET", "/api/projects")
        check.require(status == 200, "本地服务可用")
        check.require(SERVER.is_file() and APP.is_file(), "工作台前端与服务文件存在")
        verify_frontend_contract(check)

        fan = create_project(check, "同人", f"验收-逆鳞-{suffix}")
        created.append(fan)
        upload_source(check, fan)
        status, listing = request("GET", "/api/projects")
        check.require(fan in listing["projects"], "新建同人项目进入项目列表")

        # 前端创建成功后会 activate(project.id)；这里用第二个项目验证列表切换所需的数据前提。
        original = create_project(check, "原创", f"验收-逆鳞-{suffix}")
        created.append(original)
        status, listing = request("GET", "/api/projects")
        check.require(fan in listing["projects"] and original in listing["projects"], "切换后两个项目均保留在列表")
        delete_project(check, fan)
        created.remove(fan)

        # 默认无模型模式仍须验证工作流引擎的每一条实际任务路由和格式门禁。
        command = [sys.executable, str(ROOT / "工作流脚本" / "验证完整流程.py")]
        completed = subprocess.run(command, cwd=ROOT / "工作流脚本", capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=120)
        check.require(completed.returncode == 0, "无模型完整流程验证")
        if args.live_model:
            run_live_workflow(check, original, fan=False)
        else:
            check.ok("未调用模型（使用 --live-model 才执行真实生成）")
            check.ok("初始化/章节真实模型验收待 --live-model；更新功能待实现后补测")
        for record in check.records:
            print(record)
        if args.report:
            args.report.write_text("\n".join(check.records) + "\n", encoding="utf-8")
        return 0
    except Exception as error:
        if args.report:
            args.report.write_text("\n".join([*check.records, f"FAIL {type(error).__name__}: {error}"]) + "\n", encoding="utf-8")
        print(f"FAIL {type(error).__name__}: {error}", file=sys.stderr)
        return 1
    finally:
        for project in reversed(created):
            try:
                request("DELETE", f"/api/projects/{urllib.parse.quote(project)}")
            except Exception:
                pass


if __name__ == "__main__":
    raise SystemExit(main())
