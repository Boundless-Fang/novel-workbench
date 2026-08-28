from typing import Any, Dict, List, Literal, Optional, Union

from pydantic import BaseModel, Field, field_validator

PROJECT_BRANCHES = {"原创", "original", "同人", "fanfic", "默认", "default"}
SETTING_COMPLETION_MODES = {"worldview", "character"}
SAFE_TEXT_MAX = 20000
SAFE_NAME_MAX = 120


def _strip_text(value: Any, *, field_name: str, allow_empty: bool = False, max_length: Optional[int] = None) -> str:
    if value is None:
        if allow_empty:
            return ""
        raise ValueError(f"{field_name} is required")

    cleaned = str(value).strip()
    if not cleaned and not allow_empty:
        raise ValueError(f"{field_name} cannot be empty")
    if max_length is not None and len(cleaned) > max_length:
        raise ValueError(f"{field_name} is too long")
    return cleaned


def _validate_safe_name(value: Any, *, field_name: str) -> str:
    cleaned = _strip_text(value, field_name=field_name, max_length=SAFE_NAME_MAX)
    forbidden_chars = set('\\/:*?"<>|')
    if any(char in forbidden_chars for char in cleaned):
        raise ValueError(f"{field_name} contains forbidden path characters")
    return cleaned


class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str = Field(..., min_length=1, max_length=SAFE_TEXT_MAX)

    @field_validator("content")
    @classmethod
    def validate_content(cls, value: str) -> str:
        return _strip_text(value, field_name="content", max_length=SAFE_TEXT_MAX)


class ChatRequest(BaseModel):
    api_key: str = Field(default="", max_length=200)
    model: str = Field(default="deepseek-v4-flash", min_length=1, max_length=100)
    messages: List[ChatMessage] = Field(..., min_length=1)
    system_prompt: str = Field(default="", max_length=SAFE_TEXT_MAX)
    temperature: float = Field(default=0.5, ge=0.0, le=2.0)
    top_p: float = Field(default=1.0, gt=0.0, le=1.0)
    thinking: bool = False
    reasoning_effort: Literal["high", "max"] = "high"

    @field_validator("api_key")
    @classmethod
    def validate_api_key(cls, value: str) -> str:
        return _strip_text(value, field_name="api_key", allow_empty=True, max_length=200)

    @field_validator("model")
    @classmethod
    def validate_required_text(cls, value: str, info) -> str:
        return _strip_text(value, field_name=info.field_name, max_length=100)

    @field_validator("system_prompt")
    @classmethod
    def validate_system_prompt(cls, value: str) -> str:
        return _strip_text(value, field_name="system_prompt", allow_empty=True, max_length=SAFE_TEXT_MAX)


class ProjectCreate(BaseModel):
    name: str
    branch: str = "original"
    reference_style: str = ""

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        return _validate_safe_name(value, field_name="project name")

    @field_validator("branch")
    @classmethod
    def validate_branch(cls, value: str) -> str:
        cleaned = _strip_text(value, field_name="branch", max_length=20).lower()
        branch_map = {
            "原创": "original",
            "original": "original",
            "同人": "fanfic",
            "fanfic": "fanfic",
            "默认": "default",
            "default": "default",
        }
        if cleaned not in PROJECT_BRANCHES:
            raise ValueError("branch must be one of: 原创/original/同人/fanfic/默认/default")
        return branch_map[cleaned]

    @field_validator("reference_style")
    @classmethod
    def validate_reference_style(cls, value: str) -> str:
        return _strip_text(value, field_name="reference_style", allow_empty=True, max_length=SAFE_NAME_MAX)


class ChapterUpdate(BaseModel):
    content: str = Field(default="", max_length=200000)

    @field_validator("content")
    @classmethod
    def validate_content(cls, value: str) -> str:
        if value is None:
            return ""
        value = str(value)
        if len(value) > 200000:
            raise ValueError("content is too long")
        return value


class AppendContent(BaseModel):
    content: str = Field(..., min_length=1, max_length=50000)
    chapter_name: str = Field(..., min_length=1, max_length=SAFE_NAME_MAX)

    @field_validator("content")
    @classmethod
    def validate_content(cls, value: str) -> str:
        return _strip_text(value, field_name="content", max_length=50000)

    @field_validator("chapter_name")
    @classmethod
    def validate_chapter_name(cls, value: str) -> str:
        cleaned = _strip_text(value, field_name="chapter_name", max_length=SAFE_NAME_MAX)
        if cleaned.endswith(".txt"):
            cleaned = cleaned[:-4]
        return _validate_safe_name(cleaned, field_name="chapter_name")


class SettingUpdate(BaseModel):
    content: str = Field(default="", max_length=200000)

    @field_validator("content")
    @classmethod
    def validate_content(cls, value: str) -> str:
        if value is None:
            return ""
        value = str(value)
        if len(value) > 200000:
            raise ValueError("content is too long")
        return value


class SettingCompletionRequest(BaseModel):
    target_file: str = ""
    mode: str
    project_name: str = ""
    form_data: Dict[str, Any]
    model: str = "deepseek-v4-flash"
    thinking: bool = False
    reasoning_effort: Literal["high", "max"] = "high"

    @field_validator("target_file")
    @classmethod
    def validate_target_file(cls, value: str) -> str:
        return _strip_text(value, field_name="target_file", allow_empty=True, max_length=300)

    @field_validator("mode")
    @classmethod
    def validate_mode(cls, value: str) -> str:
        cleaned = _strip_text(value, field_name="mode", max_length=30).lower()
        if cleaned not in SETTING_COMPLETION_MODES:
            raise ValueError("mode must be one of: worldview/character")
        return cleaned

    @field_validator("project_name")
    @classmethod
    def validate_project_name(cls, value: str) -> str:
        return _strip_text(value, field_name="project_name", allow_empty=True, max_length=SAFE_NAME_MAX)

    @field_validator("model")
    @classmethod
    def validate_model(cls, value: str) -> str:
        return _strip_text(value, field_name="model", max_length=100)

    @field_validator("form_data")
    @classmethod
    def validate_form_data(cls, value: Dict[str, Any]) -> Dict[str, Any]:
        if not isinstance(value, dict):
            raise ValueError("form_data must be an object")
        if not value:
            raise ValueError("form_data cannot be empty")
        return value


class ChapterOutlineRequest(BaseModel):
    project_name: str
    chapter_name: str
    chapter_brief: Union[str, Dict[str, Any]]
    model: str = "deepseek-v4-flash"
    thinking: bool = False
    reasoning_effort: Literal["high", "max"] = "high"

    @field_validator("project_name", "chapter_name")
    @classmethod
    def validate_names(cls, value: str, info) -> str:
        return _validate_safe_name(value, field_name=info.field_name)

    @field_validator("model")
    @classmethod
    def validate_model(cls, value: str) -> str:
        return _strip_text(value, field_name="model", max_length=100)

    @field_validator("chapter_brief")
    @classmethod
    def validate_chapter_brief(cls, value: Union[str, Dict[str, Any]]) -> Union[str, Dict[str, Any]]:
        if isinstance(value, str):
            return _strip_text(value, field_name="chapter_brief", max_length=SAFE_TEXT_MAX)
        if isinstance(value, dict):
            if not value:
                raise ValueError("chapter_brief cannot be an empty object")
            return value
        raise ValueError("chapter_brief must be a string or object")


class NovelGenerationRequest(BaseModel):
    project_name: str
    chapter_name: str
    model: str = "deepseek-v4-flash"
    thinking: bool = False
    reasoning_effort: Literal["high", "max"] = "high"

    @field_validator("project_name", "chapter_name")
    @classmethod
    def validate_names(cls, value: str, info) -> str:
        return _validate_safe_name(value, field_name=info.field_name)

    @field_validator("model")
    @classmethod
    def validate_model(cls, value: str) -> str:
        return _strip_text(value, field_name="model", max_length=100)


class ChapterRewriteRequest(BaseModel):
    project_name: str
    chapter_name: str
    mode: Literal["prefix", "fim"]
    original_content: str = Field(..., max_length=200000)
    prefix_text: str = Field(default="", max_length=150000)
    suffix_text: str = Field(default="", max_length=150000)
    selected_text: str = Field(default="", max_length=150000)
    model: str = "deepseek-v4-flash"
    thinking: bool = False
    reasoning_effort: Literal["high", "max"] = "high"

    @field_validator("project_name", "chapter_name")
    @classmethod
    def validate_names(cls, value: str, info) -> str:
        return _validate_safe_name(value, field_name=info.field_name)

    @field_validator("original_content", "prefix_text", "suffix_text", "selected_text")
    @classmethod
    def validate_text_fields(cls, value: str, info) -> str:
        limit = 200000 if info.field_name == "original_content" else 150000
        return _strip_text(value, field_name=info.field_name, allow_empty=True, max_length=limit)

    @field_validator("model")
    @classmethod
    def validate_model(cls, value: str) -> str:
        return _strip_text(value, field_name="model", max_length=100)
