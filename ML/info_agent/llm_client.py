"""Cost-conscious OpenAI client for optional Info Agent answer generation."""

from __future__ import annotations

import hashlib
import json
import os
import time
from pathlib import Path
from typing import Any

from dotenv import load_dotenv


MODULE_DIR = Path(__file__).resolve().parent
load_dotenv(MODULE_DIR / ".env")

LLM_PROMPT_VERSION = "2026-06-23.1"

SYSTEM_PROMPT = (
    "너는 LG Able Band의 장애 복지 정보 안내 도우미다. "
    "반드시 제공된 검색 문서 안의 정보만 사용하고, 쉽고 짧은 한국어 문장으로 답한다. "
    "앱 화면에는 답변 바로 아래에 지원 대상·이용 방법·문의처를 담은 정보카드가 함께 표시된다. "
    "따라서 answer에는 카드 내용을 반복하지 말고, 제도의 핵심을 한두 문장으로 설명한 뒤 "
    "'지원 대상과 이용 방법은 아래 정보카드에서 확인해 주세요.'처럼 카드를 안내한다. "
    "answer에 '###' 소제목, 목록, 지원 대상·이용 방법·문의처의 세부 항목을 넣지 않는다. "
    "'문서 기준으로는', '추가적인 정보는'처럼 앞 내용을 반복하는 문장이나 막연한 안내는 쓰지 않는다. "
    "지원 대상 필드가 비어 있어도 문서 요약에 연령, 소득, 거주지, 수급자, 차상위, "
    "등록장애인 같은 대상 조건 힌트가 있으면 확인 가능한 힌트와 확인 필요 사항을 구분해 설명한다. "
    "모른다고만 답하지 말고 문서에서 확인 가능한 힌트는 '문서 기준으로는'처럼 조심스럽게 안내한다. "
    "문서에 없는 자격, 전화번호, 기간, 기관, 혜택은 만들거나 단정하지 않는다. "
    "모르는 내용은 공식 출처에서 확인하라고 안내한다. "
    "긴급 상황, 위험도, SOS, 보호자 연락 여부를 판단하거나 실행하지 않는다."
)
ANSWER_SCHEMA = {
    "type": "object",
    "properties": {
        "answer": {"type": "string"},
        "shortVoiceAnswer": {"type": "string"},
        "cardTitle": {"type": "string"},
        "keyPoints": {
            "type": "array",
            "items": {"type": "string"},
            "maxItems": 3,
        },
        "disclaimer": {"type": "string"},
    },
    "required": ["answer", "shortVoiceAnswer", "cardTitle", "keyPoints", "disclaimer"],
    "additionalProperties": False,
}
_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
_CACHE_LOADED = False


def _cache_path() -> Path:
    return Path(
        os.getenv(
            "INFO_AGENT_LLM_CACHE_PATH",
            str(MODULE_DIR / "data" / "cache" / "llm_response_cache.json"),
        )
    )


def _int_env(name: str, default: int, minimum: int, maximum: int) -> int:
    try:
        value = int(os.getenv(name, str(default)))
    except ValueError:
        value = default
    return max(minimum, min(maximum, value))


def llm_enabled() -> bool:
    return os.getenv("INFO_AGENT_LLM_ENABLED", "false").strip().lower() == "true"


def llm_config() -> dict[str, Any]:
    return {
        "enabled": llm_enabled(),
        "apiKey": os.getenv("OPENAI_API_KEY", "").strip(),
        "model": os.getenv("INFO_AGENT_LLM_MODEL", "gpt-4o-mini").strip() or "gpt-4o-mini",
        "timeoutSec": _int_env("INFO_AGENT_LLM_TIMEOUT_SEC", 8, 1, 30),
        "maxInputDocs": _int_env("INFO_AGENT_LLM_MAX_INPUT_DOCS", 3, 1, 3),
        "maxTokens": _int_env("INFO_AGENT_LLM_MAX_TOKENS", 500, 100, 1000),
        "cacheTtlSec": _int_env("INFO_AGENT_LLM_CACHE_TTL_SEC", 600, 60, 1800),
    }


def build_cache_key(
    query: str,
    documents: list[dict[str, Any]],
    user_accessibility_type: str = "ALL",
) -> str:
    normalized_query = _canonical_query(query)
    document_signatures = []
    for document in documents:
        fields = _important_fields(document)
        document_signatures.append(
            {
                "id": str(document.get("docId") or document.get("title") or ""),
                "score": str(document.get("finalScore") or ""),
                "target": _shorten(fields.get("supportTarget"), 180),
                "eligibility": _shorten(fields.get("eligibility"), 180),
                "selectionCriteria": _shorten(fields.get("selectionCriteria"), 180),
                "ageCondition": _shorten(fields.get("ageCondition"), 80),
                "incomeCondition": _shorten(fields.get("incomeCondition"), 120),
                "regionCondition": _shorten(fields.get("regionCondition"), 120),
                "content": _shorten(fields.get("supportContent"), 180),
                "method": _shorten(fields.get("applyMethod") or fields.get("applicationMethod"), 180),
                "contact": _shorten(fields.get("contact"), 120),
            }
        )
    raw_key = json.dumps(
        [
            LLM_PROMPT_VERSION,
            normalized_query,
            str(user_accessibility_type or "ALL").upper(),
            document_signatures,
        ],
        ensure_ascii=False,
        sort_keys=True,
    )
    return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()


def get_cached_llm_response(cache_key: str) -> dict[str, Any] | None:
    _load_cache()
    cached = _CACHE.get(cache_key)
    if not cached:
        return None
    expires_at, response = cached
    if expires_at <= time.time():
        _CACHE.pop(cache_key, None)
        _write_cache()
        return None
    return response.copy()


def cache_llm_response(cache_key: str, response: dict[str, Any], ttl_sec: int) -> None:
    _load_cache()
    _CACHE[cache_key] = (time.time() + ttl_sec, response.copy())
    _write_cache()


def clear_llm_cache() -> None:
    global _CACHE_LOADED
    _CACHE.clear()
    _CACHE_LOADED = True
    try:
        _cache_path().unlink(missing_ok=True)
    except OSError:
        pass


def _load_cache() -> None:
    global _CACHE_LOADED
    if _CACHE_LOADED:
        return
    _CACHE_LOADED = True
    path = _cache_path()
    if not path.is_file():
        return
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError, TypeError, json.JSONDecodeError):
        return
    now = time.time()
    for key, item in data.items() if isinstance(data, dict) else ():
        try:
            expires_at = float(item.get("expiresAt", 0))
            response = item.get("response", {})
        except (AttributeError, TypeError, ValueError):
            continue
        if expires_at > now and isinstance(response, dict):
            _CACHE[str(key)] = (expires_at, response)


def _write_cache() -> None:
    path = _cache_path()
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        now = time.time()
        payload = {
            key: {"expiresAt": expires_at, "response": response}
            for key, (expires_at, response) in _CACHE.items()
            if expires_at > now
        }
        path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    except OSError:
        pass


def _canonical_query(query: str) -> str:
    normalized = " ".join(str(query or "").lower().split())
    if any(keyword in normalized for keyword in ("지원 대상", "대상", "누구", "자격", "조건")):
        return "intent:eligibility"
    if any(keyword in normalized for keyword in ("신청 방법", "이용 방법", "신청은", "신청")):
        return "intent:apply_method"
    if any(keyword in normalized for keyword in ("문의처", "담당 기관", "전화번호", "문의")):
        return "intent:contact"
    if any(keyword in normalized for keyword in ("필요 서류", "제출 서류", "서류")):
        return "intent:documents"
    if any(keyword in normalized for keyword in ("언제까지", "마감", "기간")):
        return "intent:deadline"
    if any(keyword in normalized for keyword in ("자세히", "더 알려")):
        return "intent:detail"
    return normalized


def _shorten(value: Any, limit: int) -> str:
    normalized = " ".join(str(value or "").split())
    return normalized if len(normalized) <= limit else normalized[: limit - 3].rstrip() + "..."


def _important_fields(document: dict[str, Any]) -> dict[str, Any]:
    fields = document.get("importantFields", {})
    return fields if isinstance(fields, dict) else {}


def compact_documents(
    documents: list[dict[str, Any]],
    max_documents: int,
) -> list[dict[str, str]]:
    compacted = []
    for document in documents[:max_documents]:
        fields = _important_fields(document)
        compacted.append(
            {
                "title": _shorten(document.get("title"), 80),
                "summary": _shorten(
                    document.get("summary") or document.get("content"),
                    280,
                ),
                "category": _shorten(document.get("category"), 30),
                "accessibilityTarget": _shorten(document.get("accessibilityTarget"), 30),
                "priority": _shorten(document.get("priority"), 20),
                "applicationTarget": _shorten(
                    fields.get("applicationTarget")
                    or fields.get("eligibility")
                    or fields.get("supportTarget")
                    or document.get("applicationTarget"),
                    180,
                ),
                "selectionCriteria": _shorten(fields.get("selectionCriteria"), 180),
                "ageCondition": _shorten(fields.get("ageCondition"), 80),
                "incomeCondition": _shorten(fields.get("incomeCondition"), 120),
                "regionCondition": _shorten(fields.get("regionCondition"), 120),
                "applicationMethod": _shorten(
                    fields.get("applicationMethod")
                    or fields.get("applyMethod")
                    or document.get("applicationMethod"),
                    180,
                ),
                "contact": _shorten(fields.get("contact") or document.get("contact"), 120),
                "source": _shorten(document.get("source"), 80),
            }
        )
    return compacted


def build_llm_prompt(
    query: str,
    user_accessibility_type: str,
    documents: list[dict[str, Any]],
    max_documents: int,
) -> str:
    payload = {
        "question": _shorten(query, 300),
        "userAccessibilityType": _shorten(user_accessibility_type, 30),
        "documents": compact_documents(documents, max_documents),
    }
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


def _fallback_reason(error: Exception) -> str:
    name = type(error).__name__.lower()
    message = str(error).lower()
    if "ratelimit" in name or "rate_limit" in message or "429" in message:
        return "rate_limit"
    if "timeout" in name or "timed out" in message:
        return "timeout"
    if isinstance(error, (json.JSONDecodeError, ValueError, TypeError, KeyError, AttributeError)):
        return "invalid_response"
    return "api_error"


def _validate_response(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError("LLM response must be an object")
    answer = str(value.get("answer") or "").strip()
    voice = str(value.get("shortVoiceAnswer") or "").strip()
    if not answer or not voice:
        raise ValueError("LLM response answer is empty")
    key_points = value.get("keyPoints")
    if not isinstance(key_points, list):
        raise ValueError("LLM response keyPoints must be a list")
    return {
        "answer": _shorten(answer, 500),
        "shortVoiceAnswer": _shorten(voice, 220),
        "cardTitle": _shorten(value.get("cardTitle"), 80),
        "keyPoints": [_shorten(item, 120) for item in key_points[:3] if str(item).strip()],
        "disclaimer": _shorten(value.get("disclaimer"), 180),
    }


def call_llm(prompt: str, config: dict[str, Any]) -> tuple[dict[str, Any] | None, str | None]:
    try:
        from openai import OpenAI

        response = OpenAI(
            api_key=config["apiKey"],
            timeout=config["timeoutSec"],
            max_retries=0,
        ).responses.create(
            model=config["model"],
            instructions=SYSTEM_PROMPT,
            input=prompt,
            max_output_tokens=config["maxTokens"],
            text={
                "format": {
                    "type": "json_schema",
                    "name": "info_agent_answer",
                    "strict": True,
                    "schema": ANSWER_SCHEMA,
                }
            },
        )
        return _validate_response(json.loads(response.output_text)), None
    except Exception as error:
        return None, _fallback_reason(error)
