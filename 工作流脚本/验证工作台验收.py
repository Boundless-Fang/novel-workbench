"""小说工作台端到端验收（不触碰现有小说）。

覆盖：项目创建/上传/切换契约/删除、初始化和章节流程的前端契约，
以及现有无模型流程验证。默认不会调用模型，也不会消耗 API 额度。

运行前先启动网页服务：
    cd web
    node server.mjs

执行：
    python 验证工作台验收.py
    python 验证工作台验收.py --live-model

--live-model 会用本文件内的《蜀山》测试资料真实调用已配置的模型，产生并
删除两个“*-验收-蜀山-<随机串>”临时项目。仅在需要验收真实 API、模型输出和
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

SOURCE_TEXT = """英琼：女主；前明忠良李宁之女，孝行感天，拜入峨眉仙师门下学剑
李宁：英琼之父；前明忠良之后，携女避祸入蜀，与周淳结伴隐居
周淳：侠士；李宁故友，同隐蜀中，后亦归入仙门
赵燕儿：少年；别母从师，拜入峨眉门下
周轻云：峨眉女弟子；奉命在辟邪村学道，兼司传讯
法元：金身罗汉；慈云寺请来的异派凶僧，四处搬兵欲与峨眉斗剑
朱梅：青城派长老；道法高深，与峨眉交好
"""

INITIALIZATION = """前明忠良之后李宁携女英琼避祸入蜀，与侠士周淳结伴隐居。英琼孝行感天，机缘拜入峨眉仙师门下习剑；赵燕儿别母从师，周轻云在辟邪村学道兼司传讯。峨眉群仙广收少年弟子，与慈云寺凶僧一派冲突渐深：金身罗汉法元四处搬兵，扬言要与峨眉斗剑，正邪大战一触即发。
角色：英琼是李宁之女、峨眉门下少年剑仙；周淳是李宁故友、侠士；赵燕儿与周轻云同属峨眉门下；法元是慈云寺请来的异派凶僧，正邪不两立；朱梅是青城派长老，与峨眉交好。"""

CHAPTER_INPUT = """英琼辞别父亲李宁，随周淳入蜀山拜师，途中夜宿古庙，遇法元门下妖人拦路截杀试探；赵燕儿仗剑相助，二人合力击退妖人。周轻云奉命传讯：仙师已在山上等候，慈云寺之约渐近。法元现身冷笑立约，扬言斗剑之期已定。结尾英琼在庙后清泉边练剑，剑尖忽凝一道异光，周淳暗惊此女剑缘深厚。"""


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
    status, payload = request("POST", "/api/upload", {"project": project, "name": "蜀山原著.txt", "data": f"data:text/plain;base64,{content}"})
    check.require(status == 201 and payload.get("path") == "原著/蜀山原著.txt", "同人原著上传端点")
    check.require("原著/蜀山原著.txt" in flat_paths(project_tree(project)), "上传原著出现在项目树")


def delete_project(check: Check, project: str) -> None:
    status, payload = request("DELETE", f"/api/projects/{urllib.parse.quote(project)}")
    check.require(status == 200 and payload.get("deleted") == project, "删除临时项目")
    status, listing = request("GET", "/api/projects")
    check.require(status == 200 and project not in listing["projects"], "删除后项目列表不再出现")


def run_live_workflow(check: Check, project: str, fan: bool) -> None:
    """真实模型验收；仅由 --live-model 显式开启。"""
    def live_request(path: str, body: dict[str, Any]) -> tuple[int, dict[str, Any]]:
        return request("POST", path, body, timeout_seconds=660)

    status, result = live_request("/api/project-brief/assess", {"project": project, "content": "前明忠良李宁携女英琼入蜀避祸，英琼拜入峨眉学剑，法元搬兵欲斗剑，正邪大战一触即发。"})
    check.require(status == 200 and not result.get("missing"), f"模型判别小说资料（HTTP {status}，响应：{json.dumps(result, ensure_ascii=True)}）")
    material = "# 初始化资料\n\n" + INITIALIZATION + "\n"
    status, _ = request("PUT", "/api/file", {"project": project, "path": "运行记录/初始化资料.md", "content": material})
    check.require(status == 200, "保存初始化原始输入")
    tasks: list[tuple[str, dict[str, Any]]] = []
    if fan:
        tasks += [(name, {"source": "蜀山原著.txt"}) for name in ("text_stats", "word_frequency", "style", "positive_vocabulary", "exclusive_vocabulary")]
    tasks += [
        ("compile_intro", {"summary": result["summary"], "tags": result["tags"]}),
        ("generate_worldview", {"genre": "古典仙侠", "premise": "峨眉门下少年学剑，正邪斗剑将起"}),
        ("compile_style", {"tone": "还珠楼主式古典仙侠，文白相间，瑰丽奇绝"}),
        ("generate_character", {"name": "英琼", "identity": "李宁之女、峨眉门下少年剑仙"}),
        ("generate_character", {"name": "赵燕儿", "identity": "别母从师的峨眉少年"}),
        ("compile_relation", {"character_a": "英琼", "character_b": "赵燕儿", "relationship": "同门师兄妹，古庙并肩退敌"}),
        ("compile_plot", {"kind": "book", "protagonist": "英琼", "mainline": "拜师学剑与慈云寺斗剑之约"}),
        ("compile_volume", {"volume": "第1卷：峨眉学剑", "protagonist": "英琼", "mainline": "避祸入蜀至慈云寺斗剑之约"}),
        ("compile_ledger", {"entries": []}),
    ]
    for task, payload in tasks:
        status, result = live_request("/api/workflow/run", {"task": task, "project": project, "inputMode": "structured", "inputComplete": True, "input": payload})
        check.require(status == 200 and result.get("outputs"), f"模型初始化：{task}（HTTP {status}，响应：{json.dumps(result, ensure_ascii=True)}）")

    status, result = live_request("/api/chapter-brief/assess", {"project": project, "chapter": "第1章：古庙惊变", "content": CHAPTER_INPUT})
    check.require(status == 200 and not result.get("missing"), "模型判别首章输入")
    chapter_tasks = [
        ("compile_anchor", {"characters": result["characters"], "core_event": result["core_event"], "information_boundary": "慈云寺斗剑的确切日期与峨眉布防不可让异派知晓", "foreshadowing": "英琼剑尖凝异光，暗示剑缘深厚", "hook": "斗剑之期已定，慈云寺之约在即"}),
        ("compile_config", {"person": "第三人称", "information": ["古庙遇妖", "法元立约", "异光凝剑"]}),
        ("compile_dialogue", {"dialogues": [{"character": "法元", "line": "慈云寺斗剑之期已定，叫你师门早作准备。"}]}),
        ("compile_snapshot", {"characters": ["英琼", "李宁", "周淳", "赵燕儿", "法元"], "previous_ending": "古庙夜宿，妖人败退，周淳暗自戒备。"}),
        ("generate_prose", {}),
        ("validate", {}),
        ("rewrite_prose", {"instruction": "保持全部既定事实，提升战斗节奏与结尾悬念。"}),
    ]
    for task, payload in chapter_tasks:
        status, response = live_request("/api/workflow/run", {"task": task, "project": project, "inputMode": "structured", "inputComplete": True, "input": {"chapter": "第1章：古庙惊变", **payload}})
        check.require(status == 200 and response.get("outputs"), f"模型章节流程：{task}（HTTP {status}，响应：{json.dumps(response, ensure_ascii=True)}）")


def main() -> int:
    parser = argparse.ArgumentParser(description="小说工作台验收")
    parser.add_argument("--live-model", action="store_true", help="真实调用已配置 API，完整执行初始化与章节生成")
    parser.add_argument("--report", type=Path, help="将逐项验收结果写入指定 UTF-8 文本文件")
    args = parser.parse_args()
    check = Check()
    suffix = uuid.uuid4().hex[:8]
    fan = f"同人-验收-蜀山-{suffix}"
    original = f"原创-验收-蜀山-{suffix}"
    created: list[str] = []
    try:
        status, _ = request("GET", "/api/projects")
        check.require(status == 200, "本地服务可用")
        check.require(SERVER.is_file() and APP.is_file(), "工作台前端与服务文件存在")
        verify_frontend_contract(check)

        fan = create_project(check, "同人", f"验收-蜀山-{suffix}")
        created.append(fan)
        upload_source(check, fan)
        status, listing = request("GET", "/api/projects")
        check.require(fan in listing["projects"], "新建同人项目进入项目列表")

        # 前端创建成功后会 activate(project.id)；这里用第二个项目验证列表切换所需的数据前提。
        original = create_project(check, "原创", f"验收-蜀山-{suffix}")
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
