"""后端单元测试：不启动服务、不调用 LLM，覆盖共享模块、LLM 配置与引擎输入解析。

运行：python 工作流脚本/测试/测试后端单元.py
"""
from __future__ import annotations

import io
import json
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import LLM配置
import 提取步骤
from LLM配置 import MAX_LLM_ATTEMPTS, ModelPolicy, _request_payload, parse_json_object
from 共享 import chapter_asset, chapter_prose, context, safe_name
from 步骤定义 import validate_config_fields
import 工作流引擎

RECORDS: list[str] = []


def check(name: str, fn) -> None:
    try:
        fn()
        RECORDS.append(f"PASS {name}")
    except Exception as error:
        RECORDS.append(f"FAIL {name}: {type(error).__name__}: {error}")


# ---------- 共享：上下文不截断 ----------

def test_context_no_truncation() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        base = Path(tmp)
        big = base / "知识库" / "大文件.md"
        big.parent.mkdir(parents=True)
        big.write_text("字" * 30000, encoding="utf-8")
        text = context(base, [big])
        assert len(text) == 30000 + len("【知识库\\大文件.md】\n"), f"上下文被截断为 {len(text)} 字符"


def test_context_empty_fallback() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        base = Path(tmp)
        missing = base / "知识库" / "不存在.md"
        assert context(base, [missing]) == "无额外已确认项目上下文。"


def test_fanfic_output_excludes_internal_log() -> None:
    """提取日志需要保留排错，但不能被工作流当作用户产物返回。"""
    with tempfile.TemporaryDirectory() as tmp:
        base = Path(tmp) / "同人-测试"
        source = base / "原著" / "原著.txt"
        stage = Path(tmp) / "stage"
        source.parent.mkdir(parents=True)
        stage.mkdir()
        source.write_text("测试原著", encoding="utf-8")
        (stage / "features.md").write_text("# 原文风格\n\n测试", encoding="utf-8")
        with patch.object(提取步骤, "stage_project", return_value=("web-测试", stage)), patch.object(提取步骤, "run_reference", return_value="内部执行记录"):
            outputs = 提取步骤.run("style", base, {"source": "原著.txt"})
        assert len(outputs) == 1 and outputs[0].replace("\\", "/") == "提取/原文风格.md"
        assert (base / "提取" / "style.log.md").is_file(), "日志仍应保留供排错"


# ---------- 共享：卷子目录路径 ----------

def test_chapter_asset_volume_layout() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        base = Path(tmp)
        vol_dir = base / "提示词" / "第 1 卷" / "第1章：测"
        vol_dir.mkdir(parents=True)
        (vol_dir / "配置.md").write_text("卷内", encoding="utf-8")
        assert chapter_asset(base, "第1章：测", "配置.md") == vol_dir / "配置.md"
        flat_dir = base / "提示词" / "第1章：新" / "配置.md"
        flat_dir.parent.mkdir(parents=True)
        assert chapter_asset(base, "第1章：新", "配置.md") == flat_dir
        assert chapter_asset(base, "第1章：缺", "配置.md") == base / "提示词" / "第1章：缺" / "配置.md"


def test_chapter_prose_volume_layout() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        base = Path(tmp)
        vol_prose = base / "正文" / "第 1 卷" / "第1章：测.txt"
        vol_prose.parent.mkdir(parents=True)
        vol_prose.write_text("正文", encoding="utf-8")
        assert chapter_prose(base, "第1章：测") == vol_prose
        assert chapter_prose(base, "第1章：新") == base / "正文" / "第1章：新.txt"


def test_safe_name_rejects_bad_input() -> None:
    for bad in ("..", "a/b", "a\\b", "a:b", "", "  "):
        try:
            safe_name(bad, "测试")
        except ValueError:
            continue
        raise AssertionError(f"safe_name 应拒绝：{bad!r}")


# ---------- LLM配置：JSON 兜底解析 ----------

def test_parse_json_object_plain() -> None:
    assert parse_json_object('{"a": 1}') == {"a": 1}


def test_parse_json_object_fenced() -> None:
    assert parse_json_object('```json\n{"a": 1}\n```') == {"a": 1}


def test_parse_json_object_with_prose() -> None:
    text = '好的，以下是结果：\n{"chapter": "第1章", "items": [1, 2]}\n希望有帮助。'
    assert parse_json_object(text) == {"chapter": "第1章", "items": [1, 2]}


def test_parse_json_object_rejects_missing() -> None:
    try:
        parse_json_object("完全没有 JSON 内容")
    except ValueError as error:
        assert "没有可解析的 JSON" in str(error)
        return
    raise AssertionError("应当报错")


def test_parse_json_object_rejects_non_object() -> None:
    try:
        parse_json_object("[1, 2]")
    except ValueError as error:
        assert "不是 JSON 对象" in str(error)
        return
    raise AssertionError("应当报错")


# ---------- LLM配置：provider 参数白名单 ----------

_POLICY_ON = ModelPolicy("openai", "gpt", 0.5, 180, "enabled", "high")
_POLICY_OFF = ModelPolicy("openai", "gpt", 0.5, 180, "disabled", "low")


def test_payload_openai_standard_only() -> None:
    payload = _request_payload(_POLICY_ON, {"base_url": "https://api.openai.com/v1"})
    assert "thinking" not in payload and "enable_thinking" not in payload and "reasoning_effort" not in payload


def test_payload_siliconflow_thinking() -> None:
    payload = _request_payload(_POLICY_ON, {"base_url": "https://api.siliconflow.cn/v1"})
    assert payload["enable_thinking"] is True and "thinking_budget" in payload


def test_payload_deepseek_thinking() -> None:
    payload = _request_payload(_POLICY_ON, {"base_url": "https://api.deepseek.com"})
    assert payload["thinking"] == {"type": "enabled"} and payload["reasoning_effort"] == "high"
    off = _request_payload(_POLICY_OFF, {"base_url": "https://api.deepseek.com"})
    assert off["thinking"] == {"type": "disabled"} and "reasoning_effort" not in off


# ---------- LLM配置：重试退避 ----------

class _FakeResponse:
    def read(self) -> bytes:
        return json.dumps({"choices": [{"message": {"content": " ok "}}], "usage": {"prompt_tokens": 1, "completion_tokens": 2, "total_tokens": 3}}).encode("utf-8")

    def __enter__(self) -> "_FakeResponse":
        return self

    def __exit__(self, *_) -> bool:
        return False


def _patch_provider():
    return patch.object(LLM配置, "provider_config", lambda name: {"base_url": "https://api.deepseek.com", "api_key_env": "TEST_KEY", "api_key": "test-key"})


def test_retry_on_429_then_success() -> None:
    calls = {"n": 0}

    def flaky(request, timeout=None):
        calls["n"] += 1
        if calls["n"] < 2:
            raise HTTPError(request.full_url, 429, "rate limited", {}, io.BytesIO(b"limited"))
        return _FakeResponse()

    with _patch_provider(), patch.object(LLM配置.DIRECT_HTTP, "open", flaky), patch.object(LLM配置.time, "sleep"):
        assert LLM配置._chat_completion(_POLICY_ON, [{"role": "user", "content": "hi"}]) == "ok"
    assert calls["n"] == 2


def test_no_retry_on_client_error() -> None:
    calls = {"n": 0}

    def bad_request(request, timeout=None):
        calls["n"] += 1
        raise HTTPError(request.full_url, 400, "bad request", {}, io.BytesIO(b"bad"))

    with _patch_provider(), patch.object(LLM配置.DIRECT_HTTP, "open", bad_request), patch.object(LLM配置.time, "sleep"):
        try:
            LLM配置._chat_completion(_POLICY_ON, [{"role": "user", "content": "hi"}])
        except ValueError as error:
            assert "HTTP 400" in str(error)
        else:
            raise AssertionError("应当报错")
    assert calls["n"] == 1


def test_retry_exhaustion_on_network_error() -> None:
    calls = {"n": 0}

    def down(request, timeout=None):
        calls["n"] += 1
        raise LLM配置.URLError("connection refused")

    with _patch_provider(), patch.object(LLM配置.DIRECT_HTTP, "open", down), patch.object(LLM配置.time, "sleep"):
        try:
            LLM配置._chat_completion(_POLICY_ON, [{"role": "user", "content": "hi"}])
        except ValueError as error:
            assert "无法连接" in str(error)
        else:
            raise AssertionError("应当报错")
    assert calls["n"] == MAX_LLM_ATTEMPTS


# ---------- 步骤定义：配置受控选项 ----------

def test_config_valid_normalization() -> None:
    values, dropped = validate_config_fields({"person": "第三人称", "narrative": "顺叙、插叙", "information": ["人物出场", "伏笔"]})
    assert values["person"] == "第三人称"
    assert values["narrative"] == ["顺叙", "插叙"]
    assert values["information"] == ["人物出场", "伏笔"]
    assert values["events"] == []
    assert dropped == []


def test_config_invalid_value_all_invalid_raises() -> None:
    try:
        validate_config_fields({"person": "全知视角"})
    except ValueError as error:
        assert "全知视角" in str(error) and "未能识别任何有效选项" in str(error)
        return
    raise AssertionError("应当报错")


def test_config_invalid_value_dropped_not_fatal() -> None:
    """个别选项识别不了应被丢弃并记录，不再中断整个步骤。"""
    values, dropped = validate_config_fields({"events": ["误会", "自由发挥的值"]})
    assert values["events"] == ["误会"]
    assert dropped == ["事件要素=自由发挥的值"]


def test_config_all_empty_raises() -> None:
    try:
        validate_config_fields({"person": "", "information": []})
    except ValueError as error:
        assert "至少需要选择一个" in str(error)
        return
    raise AssertionError("应当报错")


# ---------- 引擎：输入解析 ----------

def test_resolve_structured_complete_passthrough() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        payload = {"chapter": "第1章：测", "characters": ["角色"], "core_event": "事件"}
        fields = 工作流引擎.resolve_input(Path(tmp), "compile_anchor", "structured", json.dumps(payload, ensure_ascii=False), "", True)
        assert fields["chapter"] == "第1章：测"


def test_resolve_broken_json_raises() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        try:
            工作流引擎.resolve_input(Path(tmp), "compile_anchor", "structured", "{broken", "", True)
        except ValueError as error:
            assert "不是合法 JSON" in str(error)
            return
    raise AssertionError("应当报错")


def test_resolve_chapter_natural_rejected() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        try:
            工作流引擎.resolve_input(Path(tmp), "compile_anchor", "natural", "{}", "主角进入大殿", True)
        except ValueError as error:
            assert "不支持自然语言" in str(error)
            return
    raise AssertionError("应当报错")


def test_resolve_unknown_task_rejected() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        try:
            工作流引擎.resolve_input(Path(tmp), "no_such_task", "structured", "{}", "", True)
        except ValueError as error:
            assert "未知流程任务" in str(error)
            return
    raise AssertionError("应当报错")


def test_resolve_missing_required_records() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        base = Path(tmp)
        try:
            工作流引擎.resolve_input(base, "compile_anchor", "structured", json.dumps({"chapter": "第1章：测"}, ensure_ascii=False), "", True)
        except ValueError as error:
            assert "core_event" in str(error)
        else:
            raise AssertionError("应当报错")
        record = base / "运行记录" / "待补充" / "compile_anchor.json"
        assert record.exists(), "缺少字段应记录到 待补充/"


# ---------- 引擎：--*_file 超长参数兜底 ----------

def test_engine_file_args_loaded() -> None:
    import argparse
    with tempfile.TemporaryDirectory() as tmp:
        input_file = Path(tmp) / "input.json"
        input_file.write_text('{"chapter": "第1章：测", "core_event": "事件"}', encoding="utf-8")
        natural_file = Path(tmp) / "natural.txt"
        natural_file.write_text("主角进入大殿" * 5000, encoding="utf-8")
        args = argparse.Namespace(input="{}", input_file=str(input_file), natural_input="", natural_input_file=str(natural_file))
        工作流引擎._apply_file_args(args)
        assert args.input.startswith('{"chapter"')
        assert len(args.natural_input) == 5000 * 6
        # 未指定文件时保持原值。
        plain = argparse.Namespace(input="{}", input_file="", natural_input="原文", natural_input_file="")
        工作流引擎._apply_file_args(plain)
        assert plain.input == "{}" and plain.natural_input == "原文"


def test_brief_script_reads_content_file() -> None:
    """判别脚本应接受 --content_file；读到内容后才会因项目不存在而报错。"""
    import subprocess
    with tempfile.TemporaryDirectory() as tmp:
        content_file = Path(tmp) / "brief.txt"
        content_file.write_text("主角林安墨考入学园。" * 5000, encoding="utf-8")
        for script, extra in (("章节输入判别.py", ["--chapter", "第1章"]), ("小说简介判别.py", [])):
            result = subprocess.run(
                [sys.executable, str(HERE.parent / script), "--project", "原创-不存在", *extra, "--content_file", str(content_file)],
                capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=60,
            )
            combined = result.stdout + result.stderr
            assert result.returncode != 0, f"{script} 应因项目不存在而失败"
            assert "项目不存在" in combined, f"{script} 未按预期走到项目校验：{combined[:300]}"


def main() -> int:
    checks = [(name, fn) for name, fn in sorted(globals().items()) if name.startswith("test_") and callable(fn)]
    for name, fn in checks:
        check(name, fn)
    for line in RECORDS:
        print(line)
    failed = sum(1 for line in RECORDS if line.startswith("FAIL"))
    print(f"\n共 {len(RECORDS)} 项：通过 {len(RECORDS) - failed}，失败 {failed}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
