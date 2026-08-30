"""步骤模块共用的文件、项目上下文和参考脚本适配能力。"""
from __future__ import annotations
import json, os, re, subprocess, sys
from pathlib import Path
from typing import Any
from LLM配置 import legacy_environment, policy_for
from 步骤定义 import validate_format

ROOT = Path(__file__).resolve().parents[1]
PROJECTS_ROOT = Path(os.environ.get("NOVEL_PROJECTS_ROOT", str(ROOT / "小说项目")))
EXTRACT_ROOT = ROOT / "工作流脚本" / "同人提取"
EXTRACT_CODE = EXTRACT_ROOT
EXTRACT_SCRIPTS = EXTRACT_CODE / "scripts"

def fail(message: str) -> None: raise ValueError(message)
def safe_name(value: Any, label: str) -> str:
    value = str(value or "").strip()
    if not value or ".." in value or re.search(r'[\\/:*?"<>|]', value): fail(f"{label}不合法")
    return value
def project_dir(project: str) -> Path:
    base = (PROJECTS_ROOT / safe_name(project, "项目名")).resolve()
    if PROJECTS_ROOT.resolve() not in base.parents or not base.exists(): fail("项目不存在或路径不合法")
    return base
def read_text(path: Path) -> str: return path.read_text(encoding="utf-8") if path.exists() else ""
def checked_write(base: Path, task: str, path: Path, text: str) -> None:
    errors = validate_format(task, path, text)
    if errors: fail(f"{path.relative_to(base)} 未通过《完整流程与选择规范》格式校验：" + "；".join(errors))
    path.parent.mkdir(parents=True, exist_ok=True); path.write_text(text.rstrip() + "\n", encoding="utf-8")
def context(base: Path, paths: list[Path], limit: int = 18000) -> str:
    blocks = [f"【{path.relative_to(base)}】\n{text}" for path in paths if (text := read_text(path))]
    return "\n\n".join(blocks)[:limit] or "无额外已确认项目上下文。"
def chapter_asset(base: Path, chapter: str, filename: str) -> Path: return base / "提示词" / safe_name(chapter, "章节名") / filename
def worldview_path(base: Path) -> Path:
    """优先读取 Markdown 世界观；没有时回退到 JSON 世界观。"""
    md = base / "知识库" / "世界观.md"
    return md if md.exists() else base / "知识库" / "世界观.json"
def worldview_text(base: Path) -> str:
    """返回可读的世界观文本：Markdown 原文，或 JSON 的美化文本。"""
    path = worldview_path(base)
    if not path.exists():
        return ""
    raw = read_text(path)
    if path.suffix.lower() == ".json":
        try:
            return json.dumps(json.loads(raw), ensure_ascii=False, indent=2)
        except Exception:
            return raw
    return raw
def stage_project(base: Path) -> tuple[str, Path]:
    name, target = "web-" + base.name, EXTRACT_ROOT / "novel_projects" / ("web-" + base.name)
    target.mkdir(parents=True, exist_ok=True)
    copies = [(base / "知识库" / "世界观.md", target / "world_settings.md"), (base / "知识库" / "语言风格.md", target / "features.md")]
    for source, dest in copies:
        text = worldview_text(base) if source.name == "世界观.md" else read_text(source)
        if text: dest.parent.mkdir(parents=True, exist_ok=True); dest.write_text(text, encoding="utf-8")
    for source in (base / "知识库" / "角色卡").glob("*.md") if (base / "知识库" / "角色卡").exists() else []:
        dest = target / "character_profiles" / source.name; dest.parent.mkdir(parents=True, exist_ok=True); dest.write_text(read_text(source), encoding="utf-8")
    return name, target
def run_reference(filename: str, args: list[str], task: str) -> str:
    script = EXTRACT_SCRIPTS / filename
    if not script.exists(): fail(f"未找到同人提取脚本：{filename}")
    env = os.environ.copy() if task in {"text_stats", "word_frequency"} else legacy_environment(policy_for(task))
    pythonpath = env.get("PYTHONPATH", "")
    env["PYTHONPATH"] = str(EXTRACT_CODE) + (os.pathsep + pythonpath if pythonpath else "")
    done = subprocess.run([sys.executable, str(script), *args], cwd=EXTRACT_CODE, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=600, env=env)
    log = (done.stdout + "\n" + done.stderr).strip()
    if done.returncode: fail(log or f"{filename} 执行失败")
    return log
