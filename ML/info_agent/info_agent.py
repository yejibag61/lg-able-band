"""Final integration entry point for the LG Able Band information agent."""

from typing import Any

try:
    from .response_builder import build_info_response
except ImportError:
    from response_builder import build_info_response


AGENT_TYPE = "INFO_AGENT"
VERSION = "1.0.0"
ACCESSIBILITY_TYPES = {
    "ALL",
    "VISUAL_IMPAIRED",
    "HEARING_IMPAIRED",
    "VISUAL_HEARING_IMPAIRED",
    "PHYSICAL_IMPAIRED",
}


def normalize_accessibility_type(value: str) -> str:
    """Normalize an accessibility type and safely fall back to ALL."""
    normalized = str(value or "ALL").strip().upper()
    return normalized if normalized in ACCESSIBILITY_TYPES else "ALL"


def normalize_top_k(value: int) -> int:
    """Clamp top_k to the supported range of 1 through 10."""
    normalized = int(value)
    return max(1, min(10, normalized))


def _meta(
    top_k: int,
    safe_mode: bool,
    llm_meta: dict[str, Any] | None = None,
    quality_debug: dict[str, Any] | None = None,
) -> dict[str, Any]:
    llm_values = llm_meta or {}
    debug_values = quality_debug or {}
    return {
        "topK": top_k,
        "safeMode": safe_mode,
        "version": VERSION,
        **llm_values,
        "llmFallbackReason": llm_values.get("fallbackReason", ""),
        "predictedCategory": debug_values.get("predictedCategory", ""),
        "predictedPriority": debug_values.get("predictedPriority", ""),
        "topDocCount": debug_values.get("retrievedDocumentCount", 0),
        "topDocScore": debug_values.get("topDocumentScore"),
        "extractedFields": debug_values.get("extractedFields", {}),
        **({"debug": debug_values} if debug_values else {}),
    }


def build_error_response(
    error: Exception,
    query: str,
    user_accessibility_type: str,
    top_k: int,
    safe_mode: bool,
) -> dict:
    """Build a stable fallback response for safe mode failures."""
    return {
        "success": False,
        "agentType": AGENT_TYPE,
        "responseType": "NO_RESULT",
        "query": query,
        "userAccessibilityType": user_accessibility_type,
        "error": {
            "type": type(error).__name__,
            "message": str(error),
        },
        "fallbackResponse": {
            "appCard": {
                "title": "정보 안내를 불러오지 못했습니다",
                "summary": "잠시 후 다시 시도하거나 보호자 또는 담당 기관에 문의하세요.",
                "recommendedAction": "나중에 다시 확인하세요.",
                "source": "",
                "url": "",
            },
            "bandMessage": "정보 확인 필요",
            "voiceMessage": "정보 안내를 불러오지 못했습니다. 잠시 후 다시 시도하세요.",
            "notificationTabMessage": "정보 안내를 불러오지 못했습니다. 잠시 후 다시 시도하세요.",
            "recommendedChannels": ["APP", "BAND"],
            "notifyGuardian": False,
        },
        "meta": _meta(
            top_k,
            safe_mode,
            quality_debug={
                "routingResult": AGENT_TYPE,
                "responseIntent": "INFO_AGENT_ERROR",
                "predictedCategory": "",
                "predictedPriority": "",
                "topDocumentScore": None,
                "retrievedDocumentCount": 0,
                "extractedFields": {},
                "extractedFieldNames": [],
                "fallbackUsed": True,
                "fallbackLevel": "error",
                "isFollowup": False,
                "errorType": type(error).__name__,
            },
        ),
    }


def run_info_agent(
    query: str,
    user_accessibility_type: str = "ALL",
    top_k: int = 5,
    safe_mode: bool = True,
    context: dict[str, Any] | None = None,
) -> dict:
    """Run the complete information-agent pipeline through response_builder."""
    normalized_type = normalize_accessibility_type(user_accessibility_type)
    normalized_query = query.strip() if isinstance(query, str) else ""

    try:
        normalized_top_k = normalize_top_k(top_k)
        if not isinstance(query, str) or not normalized_query:
            raise ValueError("query must not be empty")

        response = build_info_response(
            query=normalized_query,
            user_accessibility_type=normalized_type,
            top_k=normalized_top_k,
            context=context,
        )
        llm_meta = response.pop("_llmMeta", {})
        quality_debug = response.pop("_qualityDebug", {})
        return {
            "success": True,
            "agentType": AGENT_TYPE,
            **response,
            "meta": _meta(normalized_top_k, safe_mode, llm_meta, quality_debug),
        }
    except Exception as error:
        if not safe_mode:
            raise
        try:
            error_top_k = normalize_top_k(top_k)
        except (TypeError, ValueError):
            error_top_k = 5
        return build_error_response(
            error=error,
            query=normalized_query,
            user_accessibility_type=normalized_type,
            top_k=error_top_k,
            safe_mode=safe_mode,
        )
