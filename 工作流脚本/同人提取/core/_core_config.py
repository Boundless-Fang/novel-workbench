import os
from typing import Optional

from dotenv import load_dotenv

from paths_config import (
    CODE_DIR,
    DICT_DIR,
    ENV_PATH,
    HUGGINGFACE_CACHE_DIR,
    PROJECT_ROOT,
    PROJ_DIR,
    REF_DIR,
    STYLE_DIR,
    TEST_DIR,
)


REFERENCE_DIR = REF_DIR
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

DEFAULT_CHAT_MODEL = "deepseek-v4-flash"
DEFAULT_EMBEDDING_MODEL = "BAAI/bge-m3"
DEEPSEEK_BASE_URL = "https://api.deepseek.com"
SILICONFLOW_EMBEDDING_URL = "https://api.siliconflow.cn/v1/embeddings"
HF_ENDPOINT = "https://hf-mirror.com"

_ENV_LOADED = False
_EMBEDDING_KEY_ALIASES = (
    "SILICONFLOW_API_KEY",
    "EMBEDDING_API_KEY",
    "SILICONFLOW_KEY",
    "SILICONFLOW_APIKEY",
)


def setup_runtime_environment() -> None:
    os.environ.setdefault("HF_ENDPOINT", HF_ENDPOINT)
    os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS", "1")
    os.environ.setdefault("HUGGINGFACE_HUB_CACHE", HUGGINGFACE_CACHE_DIR)


def load_project_env() -> None:
    global _ENV_LOADED
    if _ENV_LOADED:
        return

    setup_runtime_environment()
    if os.path.exists(ENV_PATH):
        load_dotenv(dotenv_path=ENV_PATH, override=False)

    _normalize_embedding_api_key()
    _ENV_LOADED = True


def _normalize_embedding_api_key() -> None:
    canonical = (os.environ.get("SILICONFLOW_API_KEY") or "").strip()
    if canonical:
        os.environ["SILICONFLOW_API_KEY"] = canonical
        return

    for alias in _EMBEDDING_KEY_ALIASES[1:]:
        alias_value = (os.environ.get(alias) or "").strip()
        if alias_value:
            os.environ["SILICONFLOW_API_KEY"] = alias_value
            return


def get_env(name: str, default: Optional[str] = None, *, strip: bool = True) -> Optional[str]:
    load_project_env()
    value = os.environ.get(name, default)
    if isinstance(value, str) and strip:
        value = value.strip()
    return value


def get_required_env(name: str, *, message: Optional[str] = None) -> str:
    value = get_env(name)
    if value:
        return value
    raise ValueError(message or f"Missing required environment variable: {name}")


def get_deepseek_api_key() -> str:
    return get_required_env(
        "DEEPSEEK_API_KEY",
        message="Missing DEEPSEEK_API_KEY. Set it in the project .env file before running.",
    )


def get_embedding_api_key() -> str:
    return get_required_env(
        "SILICONFLOW_API_KEY",
        message=(
            "Missing SILICONFLOW_API_KEY. Set it in the project .env file before running. "
            "Legacy aliases are still supported, but SILICONFLOW_API_KEY is recommended."
        ),
    )


def get_default_chat_model() -> str:
    return get_env("DEFAULT_CHAT_MODEL", DEFAULT_CHAT_MODEL) or DEFAULT_CHAT_MODEL


def get_default_embedding_model() -> str:
    return get_env("DEFAULT_EMBEDDING_MODEL", DEFAULT_EMBEDDING_MODEL) or DEFAULT_EMBEDDING_MODEL


load_project_env()
