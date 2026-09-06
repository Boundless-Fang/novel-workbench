"""小说工作台全部步骤脚本的 LLM 调度配置。

脚本不得自行写死模型名、温度或 API Key；自然语言解析与生成能力均通过本文件取配置。
当前参考脚本使用 DeepSeek 的 OpenAI 兼容接口。若未来加入其他兼容 API，新增 provider 和步骤策略即可。
"""
from __future__ import annotations

import json
import os
import re
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from urllib.error import HTTPError, URLError
from urllib.request import ProxyHandler, Request, build_opener

# 当前进程的 LLM 调用记录（每次工作流子进程独立）
_LLM_LOG_PATH: str | None = None
_LLM_CALLS: list[dict[str, Any]] = []

def set_llm_log_path(path: str | None) -> None:
    global _LLM_LOG_PATH
    _LLM_LOG_PATH = path

def get_llm_call_stats() -> dict[str, Any]:
    """汇总当前进程内所有 LLM 调用的 token 与耗时。"""
    total_prompt = sum(int(c.get("prompt_tokens") or 0) for c in _LLM_CALLS)
    total_completion = sum(int(c.get("completion_tokens") or 0) for c in _LLM_CALLS)
    total_time = sum(float(c.get("response_time") or 0) for c in _LLM_CALLS)
    models = sorted({str(c.get("model") or "") for c in _LLM_CALLS if c.get("model")})
    return {
        "calls": len(_LLM_CALLS),
        "prompt_tokens": total_prompt,
        "completion_tokens": total_completion,
        "total_tokens": total_prompt + total_completion,
        "response_time": round(total_time, 3),
        "models": models,
        "last": _LLM_CALLS[-1] if _LLM_CALLS else None,
    }

def _append_llm_log(record: dict[str, Any]) -> None:
    _LLM_CALLS.append(record)
    if _LLM_LOG_PATH:
        try:
            from pathlib import Path
            path = Path(_LLM_LOG_PATH)
            path.parent.mkdir(parents=True, exist_ok=True)
            with path.open("a", encoding="utf-8") as fh:
                fh.write(json.dumps(record, ensure_ascii=False) + "\n")
        except Exception:
            pass


@dataclass(frozen=True)
class ModelPolicy:
    provider: str
    model: str
    temperature: float
    timeout_seconds: int = 180
    thinking: str = "enabled"
    reasoning_effort: str = "high"


PROVIDERS = {
    "deepseek": {
        "base_url": os.getenv("NOVEL_DEEPSEEK_BASE_URL", "https://api.deepseek.com").rstrip("/"),
        "api_key_env": "DEEPSEEK_API_KEY",
    }
}

SETTINGS_FILE = Path(__file__).with_name("工作台设置.json")
# Windows 会让 urllib 自动读取系统代理；工作台的本地服务与模型列表均走直连，
# 因此 LLM 生成也明确直连，避免失效代理在 TLS 握手阶段中断请求。
DIRECT_HTTP = build_opener(ProxyHandler({}))

def workspace_settings() -> dict[str, Any]:
    try:
        data = json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}

def provider_config(name: str) -> dict[str, str]:
    for item in workspace_settings().get("providers", []):
        if isinstance(item, dict) and item.get("name") == name and item.get("apiUrl"):
            key_name = "NOVEL_" + re.sub(r"\W+", "_", name).upper() + "_API_KEY"
            return {"base_url": str(item["apiUrl"]).rstrip("/"), "api_key_env": key_name, "api_key": str(item.get("apiKey") or "")}
    if name in PROVIDERS:
        return PROVIDERS[name]
    raise ValueError(f"未配置 provider：{name}")

# 所有步骤均在此集中选择模型。环境变量可按步骤覆盖，例如
# NOVEL_MODEL_GENERATE_PROSE=deepseek-v4-pro。
DEFAULT_GENERATION_MODEL = os.getenv("NOVEL_MODEL_GENERATION", "deepseek-v4-pro")
DEFAULT_STRUCTURED_MODEL = os.getenv("NOVEL_MODEL_STRUCTURED", DEFAULT_GENERATION_MODEL)
DEFAULT_VALIDATION_MODEL = os.getenv("NOVEL_MODEL_VALIDATION", DEFAULT_GENERATION_MODEL)

STEP_POLICIES: dict[str, dict[str, ModelPolicy]] = {
    "default": {
        "prepare": ModelPolicy("deepseek", DEFAULT_STRUCTURED_MODEL, 0.2, 180, "disabled", "low"),
        "generate": ModelPolicy("deepseek", DEFAULT_GENERATION_MODEL, 0.6),
        "validate": ModelPolicy("deepseek", DEFAULT_VALIDATION_MODEL, 0.1),
    },
    "generate_worldview": {"generate": ModelPolicy("deepseek", os.getenv("NOVEL_MODEL_GENERATE_WORLDVIEW", DEFAULT_GENERATION_MODEL), 0.4)},
    "generate_worldview_json": {"generate": ModelPolicy("deepseek", os.getenv("NOVEL_MODEL_GENERATE_WORLDVIEW", DEFAULT_GENERATION_MODEL), 0.4, 180, "disabled", "low")},
    "generate_character": {"generate": ModelPolicy("deepseek", os.getenv("NOVEL_MODEL_GENERATE_CHARACTER", DEFAULT_GENERATION_MODEL), 0.2)},
    "compile_character_roster": {"generate": ModelPolicy("deepseek", os.getenv("NOVEL_MODEL_GENERATE_CHARACTER", DEFAULT_GENERATION_MODEL), 0.2)},
    "generate_prose": {"generate": ModelPolicy("deepseek", os.getenv("NOVEL_MODEL_GENERATE_PROSE", DEFAULT_GENERATION_MODEL), 0.8)},
    "style": {"generate": ModelPolicy("deepseek", os.getenv("NOVEL_MODEL_EXTRACT_STYLE", DEFAULT_GENERATION_MODEL), 0.2)},
    "positive_vocabulary": {"generate": ModelPolicy("deepseek", os.getenv("NOVEL_MODEL_EXTRACT_VOCABULARY", DEFAULT_GENERATION_MODEL), 0.2)},
    "exclusive_vocabulary": {"generate": ModelPolicy("deepseek", os.getenv("NOVEL_MODEL_EXTRACT_VOCABULARY", DEFAULT_GENERATION_MODEL), 0.2)},
    "compile_anchor": {"generate": ModelPolicy("deepseek", os.getenv("NOVEL_MODEL_GENERATE_ANCHOR", DEFAULT_GENERATION_MODEL), 0.4)},
    "compile_relation": {"generate": ModelPolicy("deepseek", os.getenv("NOVEL_MODEL_GENERATE_RELATION", DEFAULT_GENERATION_MODEL), 0.4)},
    "compile_relation_roster": {"generate": ModelPolicy("deepseek", os.getenv("NOVEL_MODEL_GENERATE_RELATION", DEFAULT_GENERATION_MODEL), 0.4)},
    "compile_style": {"generate": ModelPolicy("deepseek", os.getenv("NOVEL_MODEL_GENERATE_STYLE", DEFAULT_GENERATION_MODEL), 0.4)},
    "compile_plot": {"generate": ModelPolicy("deepseek", os.getenv("NOVEL_MODEL_GENERATE_PLOT", DEFAULT_GENERATION_MODEL), 0.5)},
    "compile_ledger": {"generate": ModelPolicy("deepseek", os.getenv("NOVEL_MODEL_GENERATE_LEDGER", DEFAULT_GENERATION_MODEL), 0.3)},
    "compile_dialogue": {"generate": ModelPolicy("deepseek", os.getenv("NOVEL_MODEL_GENERATE_DIALOGUE", DEFAULT_GENERATION_MODEL), 0.7)},
    "rewrite_prose": {"generate": ModelPolicy("deepseek", os.getenv("NOVEL_MODEL_REWRITE_PROSE", DEFAULT_GENERATION_MODEL), 0.7)},
    "validate": {"generate": ModelPolicy("deepseek", os.getenv("NOVEL_MODEL_VALIDATE", DEFAULT_VALIDATION_MODEL), 0.1)},
}


def policy_for(step_id: str, phase: str = "generate") -> ModelPolicy:
    policy = STEP_POLICIES.get(step_id, {}).get(phase, STEP_POLICIES["default"][phase])
    settings = workspace_settings()
    override = settings.get("scriptModels", {}).get(step_id, {}) if isinstance(settings.get("scriptModels"), dict) else {}
    thinking = str(override.get("thinking", settings.get("thinking", policy.thinking)))
    # 工作台的低/中/高/无明确映射到模型的实际推理强度；无 = disabled。
    thinking_normalized = {"无": "disabled", "disabled": "disabled", "low": "enabled", "medium": "enabled", "high": "enabled"}.get(thinking, thinking)
    reasoning_effort = {"low": "low", "medium": "high", "high": "max", "无": "low", "disabled": "low"}.get(thinking, "high")
    return ModelPolicy(str(override.get("provider") or settings.get("provider") or policy.provider), str(override.get("model") or settings.get("model") or policy.model), policy.temperature, policy.timeout_seconds, thinking_normalized, reasoning_effort)


def legacy_environment(policy: ModelPolicy) -> dict[str, str]:
    """供同人提取脚本使用的环境变量。

提取脚本当前只实现了 DeepSeek 调用；配置为其他 provider 时显式失败，避免静默换模型。
"""
    provider = provider_config(policy.provider)
    key = provider.get("api_key") or os.getenv(provider["api_key_env"], "").strip()
    if not key:
        raise ValueError(f"缺少 {provider['api_key_env']}，无法执行需要 LLM 的步骤")
    env = os.environ.copy()
    env["DEEPSEEK_API_KEY"] = key
    env["DEFAULT_CHAT_MODEL"] = policy.model
    # 同人提取的 f0/f2b/f3a 使用 SiliconFlow 的 bge-m3 做向量索引/检索。
    silicon_key = os.environ.get("SILICONFLOW_API_KEY", "").strip()
    if not silicon_key:
        for item in workspace_settings().get("providers", []):
            if isinstance(item, dict) and item.get("name") == "硅基流动" and str(item.get("apiKey") or "").strip():
                silicon_key = str(item["apiKey"]).strip()
                break
    if silicon_key:
        env["SILICONFLOW_API_KEY"] = silicon_key
    return env


def _json_from_text(text: str) -> dict[str, Any]:
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.IGNORECASE).strip()
    data = json.loads(text)
    if not isinstance(data, dict):
        raise ValueError("LLM 返回的结构化输入不是 JSON 对象")
    return data


def _chat_completion(policy: ModelPolicy, messages: list[dict[str, str]]) -> str:
    """调用 OpenAI 兼容接口；只使用标准库，避免工作台额外安装 requests。"""
    provider = provider_config(policy.provider)
    api_key = provider.get("api_key") or os.getenv(provider["api_key_env"], "").strip()
    if not api_key:
        raise ValueError(f"缺少 {provider['api_key_env']}，无法调用 LLM")
    payload: dict[str, Any] = {"model": policy.model, "temperature": policy.temperature, "messages": messages}
    # SiliconFlow 的 DeepSeek-V3.2 支持 enable_thinking/thinking_budget；
    # reasoning_effort 仅适用于其 V4-Flash，传给 V3.2 会直接返回 400。
    if "siliconflow.cn" in provider["base_url"]:
        payload["enable_thinking"] = policy.thinking != "disabled"
        payload["thinking_budget"] = {"low": 2048, "high": 4096, "max": 8192}.get(policy.reasoning_effort, 4096)
    else:
        payload["thinking"] = {"type": policy.thinking}
        if policy.thinking != "disabled":
            payload["reasoning_effort"] = policy.reasoning_effort
    request = Request(
        f"{provider['base_url']}/chat/completions",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    started = time.time()
    record: dict[str, Any] = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "provider": policy.provider,
        "model": policy.model,
        "thinking": policy.thinking,
        "response_time": 0.0,
        "success": False,
    }
    try:
        with DIRECT_HTTP.open(request, timeout=policy.timeout_seconds) as response:
            body = json.loads(response.read().decode("utf-8"))
        record["response_time"] = round(time.time() - started, 3)
        usage = body.get("usage") or {}
        record["prompt_tokens"] = int(usage.get("prompt_tokens") or 0)
        record["completion_tokens"] = int(usage.get("completion_tokens") or 0)
        record["total_tokens"] = int(usage.get("total_tokens") or 0)
        record["success"] = True
        try:
            content = body["choices"][0]["message"]["content"].strip()
        except (KeyError, IndexError, TypeError) as error:
            raise ValueError("LLM 接口返回格式异常") from error
        _append_llm_log(record)
        return content
    except HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:800]
        record["response_time"] = round(time.time() - started, 3)
        record["error"] = f"HTTP {error.code}: {detail}"
        _append_llm_log(record)
        raise ValueError(f"LLM 接口返回 HTTP {error.code}：{detail}") from error
    except URLError as error:
        record["response_time"] = round(time.time() - started, 3)
        record["error"] = str(error.reason)
        _append_llm_log(record)
        raise ValueError(f"无法连接 LLM 接口：{error.reason}") from error
    except Exception as error:
        record["response_time"] = round(time.time() - started, 3)
        record["error"] = str(error)
        _append_llm_log(record)
        raise


def input_to_fields(*, step_id: str, user_input: Any, input_kind: str, schema_hint: dict[str, Any], project_hint: str) -> dict[str, Any]:
    """将自然语言或未完成结构化输入补全为当前步骤字段，不生成最终项目文件。"""
    policy = policy_for(step_id, "prepare")
    system = """你是小说工作台中单个步骤的输入补全器。将用户输入整理为 JSON 字段，供后续生成脚本使用；不生成 Markdown、正文或解释。\n\n规则：\n1. 只输出 JSON 对象。\n2. 自然语言输入：提取明确事实，并只对本步骤所需的表达做合理补全。\n3. 结构化输入：保留用户已填写内容，补齐空缺字段并润色表达，使其适合生成指定格式文件。\n4. 不要编造与当前步骤无关的角色事实、世界观事实或前文事实。\n5. 无法安全补全的字段保留为空、空数组或省略。\n6. 不要向用户提问；缺失字段将由系统记录。\n7. 字段说明中标注了“只能选择/只能从……中选择”的字段，必须且只能从这些固定选项里选择；禁止使用选项外的同义词、组合词或自创词。多选字段返回数组，且数组元素也必须全部来自固定选项。"""
    user = json.dumps({"step_id": step_id, "project": project_hint, "field_schema": schema_hint, "input_kind": input_kind, "user_input": user_input}, ensure_ascii=False)
    return _json_from_text(_chat_completion(policy, [{"role": "system", "content": system}, {"role": "user", "content": user}]))


def generate_markdown(*, step_id: str, fields: dict[str, Any], context: str, output_contract: str) -> str:
    """由当前步骤指定的 LLM 生成最终 Markdown 资产。"""
    policy = policy_for(step_id, "generate")
    settings = workspace_settings()
    prefix = ""
    preset = {"fast":"快速创作：优先推进产出，保持必要的一致性。", "careful":"精细创作：优先核查上下文一致性，明确标出不确定信息。", "standard":"标准流程：平衡创作质量与上下文一致性。"}.get(settings.get("preset"), "标准流程：平衡创作质量与上下文一致性。")
    system = """你是小说工作台中的步骤生成器。根据用户字段和已确认项目上下文，生成一个最终 Markdown 文件。\n\n规则：\n1. 只输出最终 Markdown，不解释，不使用代码围栏。\n2. 必须严格遵循输出契约。\n3. 用户字段优先；项目上下文只可作为约束和补充依据。\n4. 不得编造与已有事实冲突的设定。\n5. 上下文没有依据时可使用“待补充”或审慎的创作补全。""" + f"\n\n当前执行预设：{preset}" + (f"\n\n工作台全局提示词：\n{prefix}" if prefix else "")
    custom_prompts = settings.get("scriptPrompts", {})
    if isinstance(custom_prompts, dict) and str(custom_prompts.get(step_id, "")).strip():
        system = str(custom_prompts[step_id]).strip()
    user = json.dumps({"step_id": step_id, "fields": fields, "project_context": context, "output_contract": output_contract}, ensure_ascii=False)
    return _chat_completion(policy, [{"role": "system", "content": system}, {"role": "user", "content": user}])


def generate_json(*, step_id: str, fields: dict[str, Any], context: str, json_schema: dict[str, Any]) -> dict[str, Any]:
    """由当前步骤指定的 LLM 生成最终 JSON 资产（实验性：结构化世界观等）。"""
    policy = policy_for(step_id, "generate")
    settings = workspace_settings()
    prefix = ""
    preset = {"fast":"快速创作：优先推进产出，保持必要的一致性。", "careful":"精细创作：优先核查上下文一致性，明确标出不确定信息。", "standard":"标准流程：平衡创作质量与上下文一致性。"}.get(settings.get("preset"), "标准流程：平衡创作质量与上下文一致性。")
    system = """你是小说工作台中的步骤生成器。根据用户字段和已确认项目上下文，生成一个最终 JSON 资产。\n\n规则：\n1. 只输出 JSON 对象，不解释，不使用代码围栏。\n2. 必须严格符合给定 JSON Schema 的字段和类型。\n3. 用户字段优先；项目上下文只可作为约束和补充依据。\n4. 不得编造与已有事实冲突的设定。\n5. 上下文没有依据时可使用“待补充”或审慎的创作补全。""" + f"\n\n当前执行预设：{preset}" + (f"\n\n工作台全局提示词：\n{prefix}" if prefix else "")
    custom_prompts = settings.get("scriptPrompts", {})
    if isinstance(custom_prompts, dict) and str(custom_prompts.get(step_id, "")).strip():
        system = str(custom_prompts[step_id]).strip()
    user = json.dumps({"step_id": step_id, "fields": fields, "project_context": context, "json_schema": json_schema}, ensure_ascii=False)
    return _json_from_text(_chat_completion(policy, [{"role": "system", "content": system}, {"role": "user", "content": user}]))


def natural_to_fields(*, step_id: str, natural_input: str, schema_hint: dict[str, Any], project_hint: str) -> dict[str, Any]:
    """兼容旧调用。"""
    return input_to_fields(step_id=step_id, user_input=natural_input, input_kind="natural", schema_hint=schema_hint, project_hint=project_hint)
