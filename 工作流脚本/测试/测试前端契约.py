"""前端契约静态测试：不启动服务，校验 app.js / index.html / server.mjs / styles.css 之间的引用一致性。

运行：python 工作流脚本/测试/测试前端契约.py
"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / "web"

RECORDS: list[str] = []


def check(name: str, fn) -> None:
    try:
        fn()
        RECORDS.append(f"PASS {name}")
    except Exception as error:
        RECORDS.append(f"FAIL {name}: {type(error).__name__}: {error}")


def js_syntax() -> None:
    for name in ("app.js", "server.mjs"):
        result = subprocess.run(["node", "--check", str(WEB / name)], capture_output=True, text=True)
        assert result.returncode == 0, f"{name} 语法错误：{result.stderr.strip()}"


def referenced_ids_exist() -> None:
    app = (WEB / "app.js").read_text(encoding="utf-8")
    html = (WEB / "index.html").read_text(encoding="utf-8")
    html_ids = set(re.findall(r'id="([^"]+)"', html))
    used = set(re.findall(r"querySelector(?:All)?\(['\"]#([A-Za-z0-9_-]+)", app)) | set(re.findall(r"getElementById\(['\"]([^'\"]+)", app))
    # 允许清单：由 JS 动态创建、不在初始 HTML 里的元素。
    dynamic = {"localSourceUpload", "topAssetRows", "currentProjectMore", "currentProjectMenu", "volumeBox", "volumeList", "newVolume", "stageSkip", "saveQuickModel", "deleteChapter", "renameChapter", "fanSource", "sourceFile"}
    missing = sorted(name for name in used if name not in html_ids and name not in dynamic)
    assert not missing, f"app.js 引用了 index.html 不存在的元素 id：{missing}"


def api_routes_match_server() -> None:
    app = (WEB / "app.js").read_text(encoding="utf-8")
    server = (WEB / "server.mjs").read_text(encoding="utf-8")
    routes = set()
    for match in re.findall(r"['\"`](/api/[^'\"`]+)['\"`]", app):
        # 模板插值与查询参数归一化，只保留可静态比对的路径前缀。
        path = re.sub(r"\$\{[^}]*\}", ":", match.split("?")[0])
        prefix = path.split(":")[0].rstrip("/")
        segments = prefix.strip("/").split("/")
        # 至少保留到第二段，例如 /api/projects、/api/file。
        routes.add("/" + "/".join(segments[:2]))
    missing = sorted(route for route in routes if route not in server)
    assert not missing, f"app.js 调用的接口在 server.mjs 中不存在：{missing}"


def key_css_classes_exist() -> None:
    css = (WEB / "styles.css").read_text(encoding="utf-8")
    app = (WEB / "app.js").read_text(encoding="utf-8")
    required = ["completion", "api-setup-prompt", "generation-pending", "generation-progress", "usage-line", "message-actions", "workflow-failure", "configured-model-choice", "composer-status-row", "volume-row", "structured-grid"]
    missing = sorted(name for name in required if f".{name}" not in css)
    assert not missing, f"styles.css 缺少 JS 使用的关键类：{missing}"
    assert ".completion" in css and ".api-setup-prompt" in css
    # app.js 中插入的 class 字符串所引用的类，抽查动态拼接之外的高频类。
    for name in ("generation-pending", "workflow-failure", "message user-message", "assistant-message"):
        assert name in app, f"app.js 缺少预期结构：{name}"


def server_static_whitelist() -> None:
    server = (WEB / "server.mjs").read_text(encoding="utf-8")
    assert "contentType = types[extname(filePath)]" in server, "静态服务应使用类型白名单"
    assert "NOVEL_PORT" in server, "服务端口应支持 NOVEL_PORT 覆盖"


def fanfic_extraction_contract() -> None:
    """同人流程不能退回原创首步，也不能把内部日志当作用户产物。"""
    app = (WEB / "app.js").read_text(encoding="utf-8")
    server = (WEB / "server.mjs").read_text(encoding="utf-8")
    assert "if(index===0 && project.type!=='同人')" in app, "同人首步不得显示原创的资料判别"
    assert "target=stage;next=stage.id?`开始${stage.name}`" in app, "同人首步应直接开始原文统计"
    assert "item.sourceName=file.name; await window.novelLocal?.saveWorkflowState?.(item);" in app, "更换原著后必须保存当前来源"
    assert "accept=\".txt,.md,text/plain,text/markdown\"" in app, "前端原著选择器只能接受纯文本"
    assert "/\\.(?:json|log\\.md)$/i.test(entry.name)" in app, "恢复项目时不得展示执行日志"
    assert "['.txt','.md'].includes(extname(name).toLowerCase())" in server, "服务端必须拒绝非纯文本原著"


def main() -> int:
    checks = [(name, fn) for name, fn in globals().items() if name in {"js_syntax", "referenced_ids_exist", "api_routes_match_server", "key_css_classes_exist", "server_static_whitelist", "fanfic_extraction_contract"}]
    for name, fn in checks:
        check(name, fn)
    for line in RECORDS:
        print(line)
    failed = sum(1 for line in RECORDS if line.startswith("FAIL"))
    print(f"\n共 {len(RECORDS)} 项：通过 {len(RECORDS) - failed}，失败 {failed}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
