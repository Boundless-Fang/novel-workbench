import asyncio

import requests
from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import StreamingResponse
from openai import AsyncOpenAI
from pydantic import BaseModel
from core._core_llm import CHAT_STREAM_READ_TIMEOUT, EMBEDDING_TIMEOUT, REQUEST_RETRY_COUNT, create_retry_session

from .config import (
    DEEPSEEK_BASE_URL,
    SILICONFLOW_EMBEDDING_URL,
    get_default_embedding_model,
    get_deepseek_api_key,
    get_embedding_api_key,
)
from .models import ChatRequest

router = APIRouter()


class EmbedRequest(BaseModel):
    texts: list[str]


embed_semaphore = asyncio.Semaphore(5)
embed_session = create_retry_session()


def _http_error(status_code: int, detail: str) -> HTTPException:
    return HTTPException(status_code=status_code, detail=detail)


def _build_chat_messages(req: ChatRequest) -> list[dict]:
    messages = []
    if req.system_prompt:
        messages.append({"role": "system", "content": req.system_prompt})

    for message in req.messages:
        if message.role == "system":
            continue
        messages.append({"role": message.role, "content": message.content})

    return messages


def _map_llm_error(exc: Exception) -> HTTPException:
    error_name = exc.__class__.__name__
    detail = str(exc).strip() or "LLM request failed"

    if error_name == "AuthenticationError":
        return _http_error(401, f"LLM authentication failed: {detail}")
    if error_name == "BadRequestError":
        return _http_error(400, f"LLM request was rejected: {detail}")
    if error_name == "RateLimitError":
        return _http_error(429, "LLM rate limit reached, please retry later")
    if error_name in {"APITimeoutError", "APIConnectionError"}:
        return _http_error(504, "LLM upstream service timed out or is unreachable")
    return _http_error(502, f"LLM upstream service error: {detail}")


def _resolve_chat_api_key(req: ChatRequest, x_api_key: str | None) -> str:
    header_key = (x_api_key or "").strip()
    if header_key:
        return header_key

    body_key = (req.api_key or "").strip()
    if body_key:
        return body_key

    try:
        return get_deepseek_api_key()
    except ValueError as exc:
        raise _http_error(500, str(exc)) from exc


@router.post("/api/internal/embed")
async def internal_embed(req: EmbedRequest):
    try:
        embedding_api_key = get_embedding_api_key()
    except ValueError as exc:
        raise _http_error(500, str(exc)) from exc

    safe_texts = [text if text.strip() else " " for text in req.texts]

    headers = {
        "Authorization": f"Bearer {embedding_api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": get_default_embedding_model(),
        "input": safe_texts,
    }

    async with embed_semaphore:
        try:
            response = await asyncio.to_thread(
                embed_session.post,
                SILICONFLOW_EMBEDDING_URL,
                headers=headers,
                json=payload,
                timeout=EMBEDDING_TIMEOUT,
            )

            if response.status_code != 200:
                print(
                    f"[ERROR] Embedding request failed: {response.status_code} {response.text}"
                )
                raise _http_error(502, "Embedding upstream service rejected the request")

            data = response.json()
            embeddings = [item["embedding"] for item in data["data"]]
            return {"embeddings": embeddings}
        except requests.exceptions.RequestException as exc:
            print(f"[ERROR] Embedding network error: {exc}")
            raise _http_error(504, "Embedding upstream service timed out or is unreachable") from exc
        except KeyError as exc:
            print(f"[ERROR] Embedding response schema changed: missing key {exc}")
            raise _http_error(502, "Embedding upstream response schema is invalid") from exc


@router.post("/api/chat")
async def chat_stream(req: ChatRequest, x_api_key: str = Header(default=None)):
    resolved_api_key = _resolve_chat_api_key(req, x_api_key)
    client = AsyncOpenAI(
        api_key=resolved_api_key,
        base_url=DEEPSEEK_BASE_URL,
        max_retries=REQUEST_RETRY_COUNT,
        timeout=CHAT_STREAM_READ_TIMEOUT,
    )
    messages = _build_chat_messages(req)

    try:
        chat_kwargs = {
            "model": req.model,
            "messages": messages,
            "stream": True,
            "temperature": req.temperature,
            "top_p": req.top_p,
            "stream_options": {"include_usage": True},
        }
        if req.thinking:
            chat_kwargs["reasoning_effort"] = req.reasoning_effort
            chat_kwargs["extra_body"] = {"thinking": {"type": "enabled"}}

        stream = await client.chat.completions.create(
            **chat_kwargs,
        )
    except Exception as exc:
        raise _map_llm_error(exc) from exc

    async def generate():
        try:
            async for chunk in stream:
                if chunk.choices and len(chunk.choices) > 0 and chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content

                if getattr(chunk, "usage", None) and chunk.usage:
                    yield (
                        f"__USAGE__:{chunk.usage.prompt_tokens},"
                        f"{chunk.usage.completion_tokens}__"
                    )
        except Exception:
            yield "\n\n[STREAM_ERROR] Upstream stream interrupted, please retry."

    return StreamingResponse(generate(), media_type="text/plain")
