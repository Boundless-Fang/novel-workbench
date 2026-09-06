import json
import os
import threading
import time

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from core._core_config import DEEPSEEK_BASE_URL, get_deepseek_api_key, get_default_chat_model

RETRYABLE_STATUS_CODES = (429, 500, 502, 503, 504)
CHAT_CONNECT_TIMEOUT = 10
CHAT_READ_TIMEOUT = 600
CHAT_STREAM_READ_TIMEOUT = 300
EMBEDDING_TIMEOUT = 120
REQUEST_RETRY_COUNT = 3
EMBEDDING_RETRY_COUNT = 5


def _heartbeat_worker(stop_event, start_time):
    """
    Print a heartbeat periodically so long-running subprocess tasks are not
    marked as stalled by the task watchdog.
    """
    while not stop_event.is_set():
        for _ in range(60):
            if stop_event.is_set():
                return
            time.sleep(1)

        elapsed = int(time.time() - start_time)
        print(
            f"\n[INFO] Model call still running, please keep the network connection alive... "
            f"(elapsed: {elapsed}s)",
            flush=True,
        )


def _build_headers() -> dict:
    api_key = get_deepseek_api_key()
    return {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }


def _resolve_reasoning_options(thinking=None, reasoning_effort=None):
    if thinking is None:
        thinking = (os.environ.get("DEEPSEEK_THINKING") or "").strip().lower() in {
            "1",
            "true",
            "yes",
            "on",
        }
    else:
        thinking = bool(thinking)

    effort = (reasoning_effort or os.environ.get("DEEPSEEK_REASONING_EFFORT") or "high").strip().lower()
    if effort not in {"high", "max"}:
        effort = "high"
    return thinking, effort


def _apply_reasoning_options(payload: dict, thinking=None, reasoning_effort=None) -> None:
    enabled, effort = _resolve_reasoning_options(thinking=thinking, reasoning_effort=reasoning_effort)
    if enabled:
        payload["thinking"] = {"type": "enabled"}
        payload["reasoning_effort"] = effort


def is_retryable_status(status_code) -> bool:
    return status_code in RETRYABLE_STATUS_CODES


def create_retry_session(total=EMBEDDING_RETRY_COUNT, backoff_factor=1.5) -> requests.Session:
    session = requests.Session()
    retry_strategy = Retry(
        total=total,
        backoff_factor=backoff_factor,
        status_forcelist=list(RETRYABLE_STATUS_CODES),
        allowed_methods=["POST"],
    )
    adapter = HTTPAdapter(max_retries=retry_strategy, pool_connections=10, pool_maxsize=10)
    session.mount("https://", adapter)
    return session


def call_deepseek_api(
    system_prompt,
    user_prompt,
    model=None,
    temperature=0.5,
    thinking=None,
    reasoning_effort=None,
    max_retries=REQUEST_RETRY_COUNT,
):
    """
    Non-streaming LLM call used by scripts that need the full response at once.
    """
    payload = {
        "model": model or get_default_chat_model(),
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": temperature,
        "stream": False,
    }
    _apply_reasoning_options(payload, thinking=thinking, reasoning_effort=reasoning_effort)

    for attempt in range(max_retries):
        stop_event = threading.Event()
        start_time = time.time()
        heartbeat_thread = threading.Thread(
            target=_heartbeat_worker,
            args=(stop_event, start_time),
            daemon=True,
        )
        heartbeat_thread.start()

        try:
            response = requests.post(
                f"{DEEPSEEK_BASE_URL}/chat/completions",
                headers=_build_headers(),
                json=payload,
                timeout=(CHAT_CONNECT_TIMEOUT, CHAT_READ_TIMEOUT),
            )
            response.raise_for_status()
            data = response.json()

            if "usage" in data:
                total_tokens = data["usage"].get("total_tokens", 0)
                print(f"\nTotal Tokens: {total_tokens}", flush=True)

            return data["choices"][0]["message"]["content"]
        except requests.exceptions.RequestException as exc:
            status_code = getattr(exc.response, "status_code", None)
            if is_retryable_status(status_code) and attempt < max_retries - 1:
                sleep_time = 2 ** attempt
                print(
                    f"[WARN] LLM request failed with retryable status {status_code}; "
                    f"retrying in {sleep_time}s...",
                    flush=True,
                )
                time.sleep(sleep_time)
                continue
            raise RuntimeError(f"DeepSeek API request failed after retries: {exc}") from exc
        finally:
            stop_event.set()
            heartbeat_thread.join(timeout=0.1)


def call_deepseek_api_with_schema(
    system_prompt,
    user_prompt,
    json_schema,
    schema_name="structured_output",
    model=None,
    temperature=0.5,
    thinking=None,
    reasoning_effort=None,
    max_retries=REQUEST_RETRY_COUNT,
):
    payload = {
        "model": model or get_default_chat_model(),
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": temperature,
        "stream": False,
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": schema_name,
                "strict": True,
                "schema": json_schema,
            },
        },
    }
    _apply_reasoning_options(payload, thinking=thinking, reasoning_effort=reasoning_effort)

    for attempt in range(max_retries):
        stop_event = threading.Event()
        start_time = time.time()
        heartbeat_thread = threading.Thread(
            target=_heartbeat_worker,
            args=(stop_event, start_time),
            daemon=True,
        )
        heartbeat_thread.start()

        try:
            response = requests.post(
                f"{DEEPSEEK_BASE_URL}/chat/completions",
                headers=_build_headers(),
                json=payload,
                timeout=(CHAT_CONNECT_TIMEOUT, CHAT_READ_TIMEOUT),
            )
            response.raise_for_status()
            data = response.json()

            if "usage" in data:
                total_tokens = data["usage"].get("total_tokens", 0)
                print(f"\nTotal Tokens: {total_tokens}", flush=True)

            content = data["choices"][0]["message"]["content"]
            return json.loads(content)
        except (requests.exceptions.RequestException, json.JSONDecodeError) as exc:
            status_code = getattr(getattr(exc, "response", None), "status_code", None)
            if is_retryable_status(status_code) and attempt < max_retries - 1:
                sleep_time = 2 ** attempt
                print(
                    f"[WARN] Structured LLM request failed with retryable status {status_code}; "
                    f"retrying in {sleep_time}s...",
                    flush=True,
                )
                time.sleep(sleep_time)
                continue
            raise RuntimeError(f"DeepSeek structured request failed after retries: {exc}") from exc
        finally:
            stop_event.set()
            heartbeat_thread.join(timeout=0.1)


def call_deepseek_api_json_object(
    system_prompt,
    user_prompt,
    model=None,
    temperature=0.5,
    thinking=None,
    reasoning_effort=None,
    max_retries=REQUEST_RETRY_COUNT,
):
    payload = {
        "model": model or get_default_chat_model(),
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": temperature,
        "stream": False,
        "response_format": {"type": "json_object"},
    }
    _apply_reasoning_options(payload, thinking=thinking, reasoning_effort=reasoning_effort)

    for attempt in range(max_retries):
        stop_event = threading.Event()
        start_time = time.time()
        heartbeat_thread = threading.Thread(
            target=_heartbeat_worker,
            args=(stop_event, start_time),
            daemon=True,
        )
        heartbeat_thread.start()

        try:
            response = requests.post(
                f"{DEEPSEEK_BASE_URL}/chat/completions",
                headers=_build_headers(),
                json=payload,
                timeout=(CHAT_CONNECT_TIMEOUT, CHAT_READ_TIMEOUT),
            )
            response.raise_for_status()
            data = response.json()

            if "usage" in data:
                total_tokens = data["usage"].get("total_tokens", 0)
                print(f"\nTotal Tokens: {total_tokens}", flush=True)

            content = data["choices"][0]["message"]["content"]
            return json.loads(content)
        except (requests.exceptions.RequestException, json.JSONDecodeError) as exc:
            status_code = getattr(getattr(exc, "response", None), "status_code", None)
            if is_retryable_status(status_code) and attempt < max_retries - 1:
                sleep_time = 2 ** attempt
                print(
                    f"[WARN] JSON-object LLM request failed with retryable status {status_code}; "
                    f"retrying in {sleep_time}s...",
                    flush=True,
                )
                time.sleep(sleep_time)
                continue
            raise RuntimeError(f"DeepSeek json_object request failed after retries: {exc}") from exc
        finally:
            stop_event.set()
            heartbeat_thread.join(timeout=0.1)


def stream_deepseek_api(
    system_prompt,
    user_prompt,
    model=None,
    temperature=0.5,
    thinking=None,
    reasoning_effort=None,
    max_retries=REQUEST_RETRY_COUNT,
):
    """
    Streaming LLM call used when incremental output is required.
    """
    payload = {
        "model": model or get_default_chat_model(),
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": temperature,
        "stream": True,
        "stream_options": {"include_usage": True},
    }
    _apply_reasoning_options(payload, thinking=thinking, reasoning_effort=reasoning_effort)

    for attempt in range(max_retries):
        try:
            with requests.post(
                f"{DEEPSEEK_BASE_URL}/chat/completions",
                headers=_build_headers(),
                json=payload,
                stream=True,
                timeout=(CHAT_CONNECT_TIMEOUT, CHAT_STREAM_READ_TIMEOUT),
            ) as response:
                response.raise_for_status()

                event_data_buffer = []

                for line in response.iter_lines():
                    if line:
                        decoded_line = line.decode("utf-8")
                        if decoded_line.startswith("data: "):
                            payload_str = decoded_line[6:]
                            if payload_str == "[DONE]":
                                break
                            event_data_buffer.append(payload_str)
                    elif event_data_buffer:
                        full_event_str = "\n".join(event_data_buffer)
                        event_data_buffer = []

                        try:
                            json_data = json.loads(full_event_str)

                            if json_data.get("usage"):
                                total_tokens = json_data["usage"].get("total_tokens", 0)
                                print(f"\nTotal Tokens: {total_tokens}", flush=True)
                                continue

                            choices = json_data.get("choices") or []
                            if choices:
                                delta_content = choices[0]["delta"].get("content", "")
                                if delta_content:
                                    yield delta_content
                        except json.JSONDecodeError:
                            continue
                return
        except requests.exceptions.RequestException as exc:
            status_code = getattr(exc.response, "status_code", None)
            if is_retryable_status(status_code) and attempt < max_retries - 1:
                sleep_time = 2 ** attempt
                print(
                    f"\n[WARN] Streaming LLM request failed with status {status_code}; "
                    f"retrying in {sleep_time}s...",
                    flush=True,
                )
                time.sleep(sleep_time)
                continue
            raise RuntimeError(f"DeepSeek streaming request failed after retries: {exc}") from exc
