"""Build app, band, voice, and notification responses from RAG results."""

import json
import os
import re
from typing import Any

try:
    from .important_field_extractor import infer_condition_fields
    from .llm_client import (
        build_cache_key,
        build_llm_prompt,
        cache_llm_response,
        call_llm,
        get_cached_llm_response,
        llm_config,
    )
    from .rag_retriever import search_documents
except ImportError:
    from important_field_extractor import infer_condition_fields
    from llm_client import (
        build_cache_key,
        build_llm_prompt,
        cache_llm_response,
        call_llm,
        get_cached_llm_response,
        llm_config,
    )
    from rag_retriever import search_documents


ACCESSIBILITY_TYPES = {
    "ALL",
    "VISUAL_IMPAIRED",
    "HEARING_IMPAIRED",
    "VISUAL_HEARING_IMPAIRED",
    "PHYSICAL_IMPAIRED",
}
NO_RESULT_MESSAGE = (
    "관련 정보를 찾지 못했습니다. 나중에 다시 확인하거나 보호자 또는 담당 기관에 문의하세요."
)
ACTION_BY_CATEGORY = {
    "권리/차별": "신고 방법을 출처에서 확인하고, 필요하면 관련 기관에 상담하세요.",
    "보조기기": "지원 가능한 기기와 신청 조건을 출처에서 확인하고, 필요하면 담당 기관에 문의하세요.",
    "복지지원": "지원 대상과 이용 방법을 출처에서 확인하고, 필요하면 관할 복지 담당 부서에 문의하세요.",
    "이동/교통": "이용 대상, 신청 방법, 운행 지역을 출처에서 확인한 뒤 신청 여부를 결정하세요.",
    "취업/교육": "모집 대상, 신청 기간, 교육 내용을 출처에서 확인한 뒤 신청 여부를 검토하세요.",
    "의료/건강": "지원 대상과 신청 방법을 출처에서 확인하고, 필요하면 관할 복지 담당 부서나 의료기관에 문의하세요.",
    "일반뉴스": "관련 정책 변화나 참고 정보를 확인하고, 필요한 경우 원문을 확인하세요.",
}
CATEGORY_LABELS = {
    "권리/차별": "차별 신고 안내",
    "보조기기": "보조기기 지원",
    "복지지원": "복지 지원 안내",
    "이동/교통": "이동 지원 안내",
    "취업/교육": "취업교육 지원",
    "의료/건강": "의료비 지원",
    "일반뉴스": "관련 정보 안내",
}
URGENT_QUERY_KEYWORDS = ("폭염", "화재", "재난", "대피", "긴급", "위험", "응급")
SIGN_LANGUAGE_KEYWORDS = ("수어", "수어통역", "수화통역", "문자통역", "의사소통 지원")
FOLLOWUP_KEYWORDS_BY_TYPE = {
    "ELIGIBILITY": ("지원 대상", "대상", "누구", "누가 받을", "신청 조건", "자격 조건"),
    "APPLY_METHOD": ("신청 방법", "이용 방법", "신청"),
    "CONTACT": ("담당 기관", "전화번호", "문의"),
    "DOCUMENTS": ("필요 서류", "서류"),
    "DEADLINE": ("언제까지", "마감", "기간"),
    "DETAIL": ("자세히", "더 알려줘"),
    "SAFETY_ACTION": ("지금 어떻게", "어떻게 해야", "안전 행동", "대처 방법", "대처"),
}
BROAD_QUERY_PATTERNS = {
    "복지",
    "복지 알려줘",
    "복지 정보 알려줘",
    "지원 알려줘",
    "지원 정보 알려줘",
    "장애인 복지",
    "장애인 복지 알려줘",
    "장애인 지원 알려줘",
}
LLM_ELIGIBLE_CATEGORIES = {
    "권리/차별",
    "보조기기",
    "복지지원",
    "지원사업/모집",
    "이동/교통",
    "취업/교육",
    "의료/건강",
    "재난/안전",
}
LLM_BLOCKED_KEYWORDS = (
    "sos",
    "긴급",
    "위험",
    "화재",
    "대피",
    "보호자",
    "연락",
    "신고해줘",
    "알림 보내",
)
SIMPLE_QUERY_PATTERNS = {
    "안녕",
    "안녕하세요",
    "고마워",
    "감사합니다",
    "도움말",
    "도와줘",
    "확인",
}
SAFETY_GUIDES = {
    "폭염": {
        "title": "폭염 대처 안내",
        "summary": "폭염 때는 더운 시간대의 외출을 줄이고, 가능한 한 시원한 곳에서 쉬어야 합니다.",
        "action": "시원한 곳으로 이동하고 물을 자주 마시세요. 어지럽거나 몸 상태가 나빠지면 119 또는 주변 사람에게 도움을 요청하세요.",
    },
    "태풍": {
        "title": "태풍 대처 안내",
        "summary": "태풍 때는 외출을 피하고 창문과 출입문에서 떨어진 안전한 실내에 머물러야 합니다.",
        "action": "외출하지 말고 안전한 실내에 머무세요. 침수나 붕괴 위험이 있으면 안내에 따라 즉시 대피하세요.",
    },
    "화재": {
        "title": "화재 대피 안내",
        "summary": "화재가 발생하면 연기를 피해 낮은 자세로 이동하고 엘리베이터를 사용하지 않아야 합니다.",
        "action": "즉시 119에 신고하고 계단을 이용해 대피하세요. 혼자 대피하기 어렵다면 주변 사람에게 도움을 요청하세요.",
    },
}
PREPAREDNESS_KEYWORDS = ("대비", "예방", "준비", "미리")


def _recommended_action(category: str, priority: str) -> str:
    if priority == "URGENT":
        return "안전 행동을 먼저 확인하고, 위험 상황이면 즉시 안전한 곳으로 이동하거나 보호자에게 알리세요."
    if category == "재난/안전":
        return "안전 수칙을 확인하고 위험 상황이 있으면 보호자나 담당 기관에 문의하세요."
    return ACTION_BY_CATEGORY.get(category, ACTION_BY_CATEGORY["일반뉴스"])


def _is_preparedness_query(query: str) -> bool:
    normalized = str(query or "")
    return any(keyword in normalized for keyword in PREPAREDNESS_KEYWORDS)


def _is_urgent_query(query: str) -> bool:
    normalized = str(query or "")
    if _is_preparedness_query(normalized):
        return any(keyword in normalized for keyword in ("긴급", "위험", "응급", "sos"))
    return any(keyword in normalized for keyword in URGENT_QUERY_KEYWORDS)


def clean_repeated_phrases(text: str, title: str = "", category: str = "") -> str:
    """Remove card boilerplate and repeated sentences without inventing details."""
    cleaned = " ".join(str(text or "").split())
    if not cleaned:
        return ""

    title_text = " ".join(str(title or "").split())
    if title_text:
        cleaned = re.sub(
            rf"^{re.escape(title_text)}(?:\s+(?:안내|정보))?(?:입니다)?[.\s:|-]*",
            "",
            cleaned,
        )
    if category:
        cleaned = re.sub(
            rf"(?:{re.escape(category)}|복지지원|일반뉴스)\s*관련\s*정보입니다\.?",
            "",
            cleaned,
        )
    cleaned = re.sub(r"(?:안내|관련 정보|정보)입니다\.(?:\s*(?:안내|관련 정보|정보)입니다\.)+", "", cleaned)
    cleaned = _deduplicate_text(cleaned)
    return " ".join(cleaned.split()).strip(" |:-")


def build_short_answer_text(title: str, category: str, priority: str) -> str:
    natural_title = re.sub(r"(?:\s+안전)?\s+안내$", "", str(title or "관련")).strip()
    short_title = _truncate(natural_title, 60)
    if category == "재난/안전" or priority == "URGENT":
        return f"{short_title} 안전 정보를 찾았어요. 지금 해야 할 일을 확인해 주세요."
    return f"{short_title} 정보를 찾았어요."


def _simplify_support_summary(text: str) -> str:
    normalized = " ".join(str(text or "").split())
    if "저소득 장애인" in normalized and "의료비" in normalized:
        return "저소득 장애인의 의료비 부담을 줄이기 위한 지원 정보입니다."
    if "저소득 중증장애인" in normalized and "교통비" in normalized:
        return "저소득 중증장애인의 이동과 사회활동을 돕기 위한 교통비 지원 정보입니다."
    normalized = re.split(
        r"\s+(?:서울특별시|부산광역시|대구광역시|인천광역시|광주광역시|"
        r"대전광역시|울산광역시|세종특별자치시|경기도|강원특별자치도|"
        r"충청북도|충청남도|전북특별자치도|전라북도|전라남도|경상북도|"
        r"경상남도|제주특별자치도)\s+",
        normalized,
        maxsplit=1,
    )[0]
    normalized = re.split(
        r"\s+(?:현금지급|현물지급|감면|전자바우처|실물바우처|방문|온라인|우편)\s+",
        normalized,
        maxsplit=1,
    )[0]
    if normalized and normalized[-1] not in ".!?":
        normalized += "."
    return normalized


def build_clean_summary(
    title: str,
    content: str,
    category: str,
    important_fields: dict[str, str] | None = None,
) -> str:
    fields = important_fields or {}
    summary = fields.get("supportContent") or content
    summary = clean_repeated_phrases(summary, title, category)
    for field in ("applyMethod", "applicationMethod", "contact"):
        field_value = clean_repeated_phrases(fields.get(field, ""))
        if field_value and field_value != summary:
            summary = summary.replace(field_value, " ")
    summary = re.sub(
        r"\s+(?:현금지급|현물지급|감면|전자바우처|실물바우처)?\s*"
        r"(?:방문|온라인|우편)\s+(?=(?:만\s*\d+세|어르신|노인|등록\s*장애인|수급자|차상위|읍면동|주민센터))",
        " ",
        summary,
    )
    summary = _simplify_support_summary(summary)
    sentences = [
        sentence.strip()
        for sentence in re.split(r"(?<=[.!?])\s+", summary)
        if sentence.strip()
    ]
    summary = " ".join(sentences[:2])
    return _truncate(summary or "자세한 내용은 출처에서 확인해 주세요.", 120)


def build_recommended_action(
    category: str,
    priority: str,
    important_fields: dict[str, str] | None = None,
) -> str:
    fields = important_fields or {}
    apply_method = clean_repeated_phrases(fields.get("applyMethod", ""))
    contact = clean_repeated_phrases(fields.get("contact", ""))
    if apply_method:
        if contact and contact not in apply_method:
            return _truncate(f"{apply_method} 문의는 {contact}에서 확인해 주세요.", 180)
        return _truncate(apply_method, 180)
    if contact:
        return _truncate(f"자세한 신청 조건은 출처에서 확인하고, 문의는 {contact}에서 확인해 주세요.", 180)
    return _recommended_action(category, priority)


def safety_guide(query: str) -> dict[str, str] | None:
    normalized = str(query or "")
    return next(
        (guide for keyword, guide in SAFETY_GUIDES.items() if keyword in normalized),
        None,
    )


def _is_broad_query(query: str) -> bool:
    normalized = re.sub(r"[?!.,]", "", " ".join(str(query or "").split())).strip()
    return normalized in BROAD_QUERY_PATTERNS


def _llm_meta(
    *,
    used: bool = False,
    fallback: bool = False,
    cache_hit: bool = False,
    reason: str = "",
) -> dict[str, Any]:
    meta: dict[str, Any] = {
        "llmUsed": used,
        "llmFallback": fallback,
        "llmCacheHit": cache_hit,
    }
    if reason:
        meta["fallbackReason"] = reason
    return meta


def build_quality_debug(
    rag_result: dict[str, Any],
    classification: dict[str, str],
    results: list[dict[str, Any]],
    *,
    is_followup: bool = False,
) -> dict[str, Any]:
    representative = results[0] if results else {}
    extracted_fields = _important_fields(representative)
    return {
        "routingResult": "INFO_AGENT",
        "responseIntent": "INFO_AGENT_FOLLOWUP" if is_followup else "INFO_AGENT_QUERY",
        "predictedCategory": classification.get("category", ""),
        "predictedPriority": classification.get("priority", ""),
        "predictedAccessibilityTarget": classification.get("accessibilityTarget", ""),
        "rawPrediction": rag_result.get("rawPrediction", {}),
        "ruleApplied": bool(rag_result.get("ruleApplied", False)),
        "topDocumentId": representative.get("docId", ""),
        "topDocumentTitle": representative.get("title", ""),
        "topDocumentScore": representative.get("finalScore"),
        "retrievedDocumentCount": int(rag_result.get("resultCount", len(results))),
        "extractedFields": extracted_fields,
        "extractedFieldNames": sorted(extracted_fields),
        "fallbackUsed": bool(rag_result.get("fallbackUsed", False)),
        "fallbackLevel": rag_result.get("fallbackLevel", "all"),
        "isFollowup": is_followup,
    }


def attach_quality_debug(
    response: dict[str, Any],
    rag_result: dict[str, Any],
    classification: dict[str, str],
    results: list[dict[str, Any]],
    *,
    is_followup: bool = False,
) -> dict[str, Any]:
    response["_qualityDebug"] = build_quality_debug(
        rag_result,
        classification,
        results,
        is_followup=is_followup,
    )
    return response


def should_use_llm(
    query: str,
    classification: dict[str, str],
    results: list[dict[str, Any]],
    rag_result: dict[str, Any],
    config: dict[str, Any],
) -> tuple[bool, str]:
    if not config["enabled"]:
        return False, "disabled"
    normalized = " ".join(str(query or "").lower().split())
    if not normalized or normalized in SIMPLE_QUERY_PATTERNS or len(normalized) < 6:
        return False, "simple_query"
    if any(keyword in normalized for keyword in LLM_BLOCKED_KEYWORDS):
        return False, "safety_rule"
    if classification.get("category") not in LLM_ELIGIBLE_CATEGORIES:
        return False, "ineligible_category"
    if classification.get("priority") == "URGENT" and not _is_preparedness_query(query):
        return False, "safety_rule"
    if not results:
        return False, "no_results"
    if rag_result.get("fallbackUsed") is True:
        return False, "low_confidence"
    fields = _important_fields(results[0])
    requested_field = {
        "ELIGIBILITY": "supportTarget",
        "APPLY_METHOD": "applyMethod",
        "CONTACT": "contact",
        "DOCUMENTS": "requiredDocuments",
        "DEADLINE": "applicationPeriod",
        "DETAIL": "supportContent",
    }.get(classify_followup_type(query) or "")
    if requested_field and not fields.get(requested_field):
        return False, "insufficient_fields"
    try:
        top_score = float(results[0].get("finalScore", 0))
        minimum_score = float(os.getenv("INFO_AGENT_LLM_MIN_SCORE", "0.45"))
    except (TypeError, ValueError):
        return False, "low_confidence"
    if top_score < minimum_score:
        return False, "low_confidence"
    if not config["apiKey"]:
        return False, "missing_api_key"
    return True, ""


def build_llm_augmented_response(
    response: dict[str, Any],
    query: str,
    user_type: str,
    results: list[dict[str, Any]],
    rag_result: dict[str, Any],
) -> dict[str, Any]:
    config = llm_config()
    allowed, reason = should_use_llm(
        query,
        response.get("classification", {}),
        results,
        rag_result,
        config,
    )
    if not allowed:
        response["_llmMeta"] = _llm_meta(
            fallback=reason == "missing_api_key",
            reason=reason,
        )
        return response

    selected_documents = results[: config["maxInputDocs"]]
    cache_key = build_cache_key(query, selected_documents, user_type)
    cached = get_cached_llm_response(cache_key)
    if cached:
        llm_response = cached
        cache_hit = True
    else:
        prompt = build_llm_prompt(
            query,
            user_type,
            selected_documents,
            config["maxInputDocs"],
        )
        llm_response, fallback_reason = call_llm(prompt, config)
        if not llm_response:
            response["_llmMeta"] = _llm_meta(
                fallback=True,
                reason=fallback_reason or "api_error",
            )
            return response
        cache_llm_response(cache_key, llm_response, config["cacheTtlSec"])
        cache_hit = False

    response["answerText"] = llm_response["answer"]
    response["voiceText"] = llm_response["shortVoiceAnswer"]
    response["voiceMessage"] = llm_response["shortVoiceAnswer"]
    response["_llmMeta"] = _llm_meta(used=True, cache_hit=cache_hit)
    return response


def _band_message(query: str, category: str, priority: str) -> str:
    if priority == "URGENT":
        if "화재" in query or "대피" in query:
            return "화재 대피 필요"
        if "폭염" in query:
            return "폭염 위험. 외출 자제"
        if category == "재난/안전":
            return "긴급 재난 안내"
        return "긴급 안전 안내"

    if "수어" in query or "수화" in query or "통역" in query:
        return "수어통역 지원"
    if "보청기" in query or "인공와우" in query:
        return "보청기 지원"
    if "점자" in query:
        return "점자기기 지원"
    if "폭염" in query:
        return "폭염 안전 안내"
    return _truncate(CATEGORY_LABELS.get(category, "관련 정보 안내"), 24)


def _truncate(text: str, limit: int) -> str:
    normalized = " ".join(str(text).split())
    if len(normalized) <= limit:
        return normalized
    return normalized[: limit - 3].rstrip(" ,.;…") + "..."


def _deduplicate_text(text: str, title: str = "") -> str:
    normalized = " ".join(str(text).split())
    if not normalized:
        return ""

    title_text = " ".join(str(title).split())
    if title_text and normalized.startswith(title_text):
        normalized = normalized[len(title_text) :].lstrip(" |:-")

    sentences = re.split(r"(?<=[.!?])\s+|[\r\n]+", normalized)
    unique_sentences = []
    seen = set()
    for sentence in sentences:
        sentence = sentence.strip()
        key = re.sub(r"\s+", "", sentence)
        if not sentence or key in seen:
            continue
        seen.add(key)
        unique_sentences.append(sentence)

    cleaned = " ".join(unique_sentences)
    words = cleaned.split()
    for size in range(len(words) // 2, 5, -1):
        for start in range(0, len(words) - size * 2 + 1):
            if words[start : start + size] == words[start + size : start + size * 2]:
                words = words[: start + size] + words[start + size * 2 :]
                cleaned = " ".join(words)
                return cleaned
    return cleaned


def _app_summary(document: dict[str, Any], category: str, priority: str) -> str:
    title = str(document.get("title") or "관련 정보").strip()
    summary = _deduplicate_text(document.get("summary", ""), title)
    priority_text = (
        "긴급하게 확인해야 하는 정보입니다."
        if priority == "URGENT"
        else f"{category} 관련 정보입니다."
    )
    title_intro = f"{_truncate(title, 60)} 안내입니다."
    if not summary:
        return _truncate(f"{title_intro} {priority_text}", 220)

    sentences = re.split(r"(?<=[.!?])\s+", summary)
    summary = sentences[0]
    return _truncate(f"{title_intro} {summary} {priority_text}", 220)


def _message_title(title: str, limit: int = 45) -> str:
    return _truncate(title, limit)


def _voice_message(title: str, action: str, priority: str) -> str:
    short_title = _message_title(title, 40)
    if priority == "URGENT":
        return _truncate(f"긴급 안내입니다. {action}", 140)
    return _truncate(f"{short_title} 안내입니다. {action}", 140)


def _notification_message(title: str, action: str, priority: str) -> str:
    short_title = _message_title(title, 50)
    prefix = "긴급 정보입니다." if priority == "URGENT" else f"{short_title} 정보입니다."
    return _truncate(f"{prefix} {action}", 160)


def _channels(user_type: str, priority: str) -> list[str]:
    channels_by_type = {
        "VISUAL_IMPAIRED": ["APP", "BAND", "VOICE"],
        "HEARING_IMPAIRED": ["APP", "BAND", "NOTIFICATION_TAB"],
        "VISUAL_HEARING_IMPAIRED": ["APP", "BAND", "HIGH_CONTRAST", "GUARDIAN"],
        "PHYSICAL_IMPAIRED": ["APP", "BAND"],
        "ALL": ["APP", "BAND"],
    }
    channels = channels_by_type[user_type].copy()
    if priority == "URGENT" and "GUARDIAN" not in channels:
        channels.append("GUARDIAN")
    return channels


def _source_documents(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    fields = (
        "rank",
        "docId",
        "title",
        "source",
        "url",
        "category",
        "accessibilityTarget",
        "priority",
        "finalScore",
        "importantFields",
        "importantFieldQuality",
    )
    return [{field: result.get(field, "") for field in fields} for result in results]


def _sanitize_important_field(field: str, value: str, document: dict[str, Any]) -> str:
    text = clean_repeated_phrases(value)
    if not text:
        return ""
    if field in {"applyMethod", "applicationMethod"}:
        labeled = re.search(r"신청방법\s*[:：]\s*(.+)$", text)
        if labeled:
            text = labeled.group(1).strip()
        route = re.fullmatch(r"(.+?)\s*(?:->|→)\s*(.+)", text)
        if route:
            applicant = route.group(1).strip().replace("퇴소장애인", "퇴소 장애인")
            destination = route.group(2).strip().replace("구군", "구·군")
            return _truncate(f"{applicant}이 {destination}에 신청합니다.", 180)
        if len(text) > 180:
            return ""
    if field in {"supportTarget", "eligibility", "applicationTarget"} and (
        len(text) > 120
        or any(marker in text for marker in ("신청방법:", "신청방법：", "현금지급", "현물지급", "상단 지원대상"))
    ):
        title_summary = " ".join(
            str(document.get(name) or "") for name in ("title", "summary")
        )
        target = re.search(
            r"((?:저소득\s+|등록\s+|중증\s+|탈시설\s+|시각\s+|청각\s+|발달\s+)?장애인)",
            title_summary,
        )
        return target.group(1).strip() if target else ""
    if field == "selectionCriteria" and len(text) > 200:
        return ""
    return _truncate(text, 300)


def _important_fields(document: dict[str, Any]) -> dict[str, str]:
    value = document.get("importantFields", {})
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except (TypeError, ValueError, json.JSONDecodeError):
            value = {}
    if not isinstance(value, dict):
        value = {}

    aliases = {
        "supportTarget": (
            "supportTarget", "eligibility", "applicationTarget", "selectionCriteria",
            "target", "지원대상", "신청대상",
        ),
        "eligibility": ("eligibility", "supportTarget", "applicationTarget", "selectionCriteria"),
        "applicationTarget": ("applicationTarget", "supportTarget", "eligibility"),
        "selectionCriteria": ("selectionCriteria", "선정기준"),
        "ageCondition": ("ageCondition", "연령조건"),
        "incomeCondition": ("incomeCondition", "소득조건"),
        "regionCondition": ("regionCondition", "거주조건"),
        "supportContent": ("supportContent", "benefit", "benefits", "지원내용", "지원혜택"),
        "applyMethod": ("applyMethod", "applicationMethod", "howToApply", "신청방법", "신청절차"),
        "applicationMethod": ("applicationMethod", "applyMethod", "howToApply", "신청방법", "신청절차"),
        "contact": ("contact", "inquiry", "contactInfo", "문의처", "담당기관", "담당부서"),
        "sourceAgency": ("sourceAgency", "source", "출처", "제공기관"),
        "applicationPeriod": ("applicationPeriod", "applicationDeadline", "신청기간"),
        "requiredDocuments": ("requiredDocuments", "documents", "필요서류", "제출서류"),
        "region": ("region", "지역"),
        "caution": ("caution", "주의사항"),
    }
    fields: dict[str, str] = {}
    for field, field_aliases in aliases.items():
        for container in (value, document):
            direct_value = next(
                (
                    str(container.get(alias) or "").strip()
                    for alias in field_aliases
                    if str(container.get(alias) or "").strip()
                ),
                "",
            )
            if direct_value and direct_value not in {
                "없음",
                "미정",
                "해당 없음",
                "출처에서 확인 필요",
                "공식 기관 확인 필요",
            }:
                sanitized = _sanitize_important_field(field, direct_value, document)
                if sanitized:
                    fields[field] = sanitized
                    break
    return fields


def _condition_hint_fields(card: dict[str, Any]) -> dict[str, str]:
    hint_text = " ".join(
        str(card.get(field) or "")
        for field in ("summary", "content", "recommendedAction")
    )
    return {
        field: value
        for field, value in infer_condition_fields(hint_text).items()
        if value
    }


def _eligibility_answer(title: str, fields: dict[str, str]) -> str:
    primary_target = (
        fields.get("eligibility")
        or fields.get("applicationTarget")
        or fields.get("supportTarget")
    )
    candidates = [
        primary_target,
        fields.get("selectionCriteria"),
        fields.get("ageCondition"),
        fields.get("incomeCondition"),
        fields.get("regionCondition"),
    ]
    hints: list[str] = []
    for value in candidates:
        if (
            not value
            or len(value) > 160
            or value in hints
            or any(value in existing for existing in hints)
        ):
            continue
        hints.append(value)
    if not hints:
        return (
            f"현재 검색된 {title} 문서에는 지원 대상 조건을 확인할 수 있는 내용이 부족합니다. "
            "정확한 조건은 공식 출처에서 확인해야 합니다."
        )
    hint_text = _truncate(", ".join(hints), 300)
    if primary_target and len(primary_target) <= 80:
        details = [
            value for value in hints
            if value != primary_target and value not in primary_target
        ]
        detail_text = f" 추가 조건으로는 {', '.join(dict.fromkeys(details))} 등이 확인됩니다." if details else ""
        return (
            f"지원 대상은 {primary_target}입니다.{detail_text} "
            "최종 자격 여부는 공식 출처나 담당 기관에서 확인해 주세요."
        )
    return (
        f"문서 기준으로는 {hint_text} 조건과 관련된 대상이 지원받을 수 있는 것으로 보입니다. "
        "정확한 연령, 소득, 거주지 조건은 공식 출처나 담당 기관에서 확인해야 합니다."
    )


def _compact_bullets(items: list[str]) -> str:
    cleaned: list[str] = []
    for item in items:
        text = " ".join(str(item or "").split()).strip()
        if text and text not in cleaned:
            cleaned.append(text)
    return "\n".join(f"- {item}" for item in cleaned)


def _safe_summary(summary: str) -> str:
    text = " ".join(str(summary or "").split()).strip()
    return _truncate(text, 120) if text else ""


def _missing_field_followup_answer(
    *,
    followup_type: str,
    title: str,
    summary: str,
    source: str,
    category: str = "",
) -> str:
    if followup_type == "APPLY_METHOD":
        return (
            f"현재 '{title}' 문서에는 신청방법이 명확히 제공되지 않았습니다. "
            "정확한 내용은 공식 기관 확인이 필요합니다. "
            "자세히 보기에서 공식 출처를 확인하거나, 관할 주민센터 또는 복지 담당 부서에 문의해 주세요."
        )
    if followup_type == "CONTACT":
        return (
            f"현재 '{title}' 문서에는 담당 기관의 전화번호나 문의처가 제공되지 않았습니다. "
            f"자세히 보기에서 문의처를 확인하거나, 관할 주민센터에 '{title} 문의'라고 말씀해 주세요."
        )
    if followup_type == "DOCUMENTS":
        return (
            f"현재 '{title}' 문서에는 필요한 제출 서류가 제공되지 않았습니다. "
            "신청 전에 공식 출처 또는 담당 기관에서 준비 서류를 확인해 주세요."
        )
    if followup_type == "DEADLINE":
        return (
            f"현재 '{title}' 문서에는 신청 기간이나 마감일이 제공되지 않았습니다. "
            "자세히 보기 또는 담당 기관에서 최신 일정을 확인해 주세요."
        )

    confirmed = [f"'{title}' 정보를 기준으로 안내할게요."]
    safe_summary = _safe_summary(summary)
    if safe_summary:
        confirmed.append(safe_summary)
    if source:
        confirmed.append(f"출처는 {source}입니다.")
    if category:
        confirmed.append(f"분류는 {category}입니다.")

    missing_by_type = {
        "ELIGIBILITY": "현재 카드만으로는 정확한 지원 대상 조건을 확정하기 어려워요.",
        "APPLY_METHOD": "현재 카드에는 자세한 신청 절차가 따로 적혀 있지 않아요.",
        "CONTACT": "현재 카드에는 전화번호나 담당 부서명이 따로 표시되어 있지 않아요.",
        "DOCUMENTS": "현재 카드에는 필요한 서류가 따로 적혀 있지 않아요.",
        "DEADLINE": "현재 카드에는 신청 기간이나 마감일이 따로 적혀 있지 않아요.",
        "SAFETY_ACTION": "현재 카드에는 구체적인 대처 행동이 충분히 적혀 있지 않아요.",
        "DETAIL": "현재 카드에는 요청한 세부 정보가 충분히 적혀 있지 않아요.",
    }
    next_actions_by_type = {
        "ELIGIBILITY": [
            "자세히 보기를 눌러 공식 출처에서 지원 대상 조건을 확인해 주세요.",
            "연령, 소득, 거주지 조건은 주민센터나 관련 복지 담당 부서에 문의해 주세요.",
        ],
        "APPLY_METHOD": [
            "자세히 보기를 눌러 공식 출처의 신청 절차를 확인해 주세요.",
            "방문 전 주민센터나 관련 복지 담당 부서에 신청 방법을 문의해 주세요.",
        ],
        "CONTACT": [
            "자세히 보기를 눌러 공식 출처의 문의처를 확인해 주세요.",
            f"문의할 때는 '{title} 신청 문의'라고 말하면 더 정확한 안내를 받을 수 있어요.",
        ],
        "DOCUMENTS": [
            "자세히 보기를 눌러 공식 출처의 제출 서류를 확인해 주세요.",
            "신청 전 주민센터나 해당 기관에 필요한 서류를 다시 확인해 주세요.",
        ],
        "DEADLINE": [
            "자세히 보기를 눌러 공식 출처의 신청 기간을 확인해 주세요.",
            "지원 사업 일정은 바뀔 수 있으므로 신청 전에 최신 일정을 확인해 주세요.",
        ],
        "SAFETY_ACTION": [
            "위험한 상황이면 정보 확인보다 안전 확보를 먼저 해 주세요.",
            "긴급하면 119 또는 주변 사람에게 도움을 요청해 주세요.",
        ],
        "DETAIL": [
            "자세히 보기를 눌러 공식 출처의 상세 내용을 확인해 주세요.",
            "필요하면 관련 복지 담당 부서에 본인 상황이 해당하는지 문의해 주세요.",
        ],
    }
    return (
        "확인된 내용:\n"
        + _compact_bullets(confirmed)
        + "\n\n확인이 필요한 내용:\n"
        + _compact_bullets(
            [
                missing_by_type.get(followup_type, missing_by_type["DETAIL"]),
                "정확한 내용은 공식 기관 확인이 필요합니다.",
            ]
        )
        + "\n\n다음에 할 일:\n"
        + _compact_bullets(next_actions_by_type.get(followup_type, next_actions_by_type["DETAIL"]))
    )


def _field_value_for_followup(followup_type: str, fields: dict[str, str]) -> str:
    candidates_by_type = {
        "APPLY_METHOD": ("applyMethod", "applicationMethod"),
        "CONTACT": ("contact",),
        "DOCUMENTS": ("requiredDocuments",),
        "DEADLINE": ("applicationPeriod",),
        "DETAIL": ("supportContent",),
    }
    for field in candidates_by_type.get(followup_type, ()):
        value = clean_repeated_phrases(fields.get(field, ""))
        if value:
            return value
    return ""


def _detail_answer(title: str, summary: str, fields: dict[str, str], source: str) -> str:
    parts = [f"{title}: {_safe_summary(summary)}"]
    target = fields.get("supportTarget") or fields.get("eligibility")
    method = fields.get("applicationMethod") or fields.get("applyMethod")
    contact = fields.get("contact")
    if target:
        parts.append(f"지원 대상은 {target}입니다.")
    if method:
        parts.append(
            f"신청방법: {method}" if method.endswith((".", "요.", "다.")) else f"신청방법은 {method}입니다."
        )
    if contact:
        parts.append(f"문의처는 {contact}입니다.")
    elif source:
        parts.append("추가 조건과 문의처는 자세히 보기의 공식 출처에서 확인해 주세요.")
    return " ".join(parts)


def _missing_core_fields(fields: dict[str, str]) -> list[str]:
    checks = (
        (("eligibility", "applicationTarget", "supportTarget", "selectionCriteria"), "신청 대상"),
        (("supportContent",), "지원 내용"),
        (("applicationMethod", "applyMethod"), "신청 방법"),
        (("contact",), "문의처"),
        (("sourceAgency",), "출처"),
    )
    return [
        label
        for fields_to_check, label in checks
        if not any(fields.get(field) for field in fields_to_check)
    ]


def _official_confirmation_notice(fields: dict[str, str]) -> str:
    return "정확한 내용은 공식 기관 확인이 필요합니다." if _missing_core_fields(fields) else ""


def _last_info_card(context: dict[str, Any]) -> dict[str, Any] | None:
    for key in ("lastInfoAgent", "lastInfoCard"):
        last_info_agent = context.get(key)
        if isinstance(last_info_agent, dict) and last_info_agent.get("title"):
            return last_info_agent
    history = context.get("history")
    if not isinstance(history, list):
        return None
    for item in reversed(history):
        if not isinstance(item, dict):
            continue
        card = (
            item.get("infoCard")
            or item.get("appCard")
            or item.get("lastInfoCard")
            or item.get("lastInfoAgent")
        )
        if isinstance(card, dict) and card.get("title"):
            return card
    return None


def build_field_priority_answer(
    query: str,
    title: str,
    fields: dict[str, str],
    default_answer: str,
    summary: str = "",
    source: str = "",
    category: str = "",
) -> str:
    requested_field = classify_followup_type(query)
    if requested_field == "ELIGIBILITY":
        if any(
            fields.get(field)
            for field in (
                "eligibility", "applicationTarget", "supportTarget", "selectionCriteria",
                "ageCondition", "incomeCondition", "regionCondition",
            )
        ):
            return _eligibility_answer(title, fields)
        return _missing_field_followup_answer(
            followup_type=requested_field,
            title=title,
            summary=summary,
            source=source,
            category=category,
        )
    if requested_field:
        value = _field_value_for_followup(requested_field, fields)
        if value:
            return _truncate(value, 240)
        return _missing_field_followup_answer(
            followup_type=requested_field,
            title=title,
            summary=summary,
            source=source,
            category=category,
        )
    return default_answer


def classify_followup_type(query: str) -> str | None:
    normalized = str(query or "").strip()
    for followup_type, keywords in FOLLOWUP_KEYWORDS_BY_TYPE.items():
        if any(keyword in normalized for keyword in keywords):
            return followup_type
    return None


def build_followup_answer(
    followup_type: str,
    last_info_agent: dict[str, Any],
    retrieved_document: dict[str, Any] | None = None,
) -> dict[str, str]:
    title = str(last_info_agent.get("title") or "해당 정보").strip()
    source = str(last_info_agent.get("source") or "").strip()
    summary = str(last_info_agent.get("summary") or "관련 지원 및 이용 안내 정보입니다.").strip()
    category = str(last_info_agent.get("category") or "").strip()
    retrieved_title = str((retrieved_document or {}).get("title") or "").strip()
    normalized_topic = re.sub(r"\s+", "", title)
    normalized_retrieved_title = re.sub(r"\s+", "", retrieved_title)
    same_topic = bool(
        normalized_topic
        and normalized_retrieved_title
        and (
            normalized_topic in normalized_retrieved_title
            or normalized_retrieved_title in normalized_topic
        )
    )
    retrieved_fields = _important_fields(retrieved_document or {}) if same_topic else {}
    inferred_fields = {
        **_condition_hint_fields(retrieved_document or {}),
        **_condition_hint_fields(last_info_agent),
    }
    fields = {
        **inferred_fields,
        **retrieved_fields,
        **_important_fields(last_info_agent),
    }
    if followup_type == "ELIGIBILITY" and any(
        fields.get(field)
        for field in (
            "eligibility", "applicationTarget", "supportTarget", "selectionCriteria",
            "ageCondition", "incomeCondition", "regionCondition",
        )
    ):
        answer = _eligibility_answer(title, fields)
    elif followup_type == "SAFETY_ACTION":
        answer = str(last_info_agent.get("recommendedAction") or "").strip()
        if not answer:
            answer = _missing_field_followup_answer(
                followup_type=followup_type,
                title=title,
                summary=summary,
                source=source,
                category=category,
            )
    elif followup_type == "DETAIL":
        answer = _detail_answer(title, summary, fields, source)
    else:
        value = _field_value_for_followup(followup_type, fields)
        answer = _truncate(value, 240) if value else _missing_field_followup_answer(
            followup_type=followup_type,
            title=title,
            summary=summary,
            source=source,
            category=category,
        )
    return {
        "type": followup_type,
        "topic": title,
        "answer": answer,
        "source": source,
    }


def _response_note(
    query: str,
    classification: dict[str, str],
    results: list[dict[str, Any]],
    fallback_used: bool,
) -> str:
    notes = []
    if fallback_used:
        notes.append("관련 문서가 부족하여 검색 범위를 넓힌 결과를 함께 제공합니다.")
    if classification["accessibilityTarget"] == "VISUAL_HEARING_IMPAIRED":
        deafblind_count = sum(
            "DEAFBLIND_TARGET" in str(result.get("targetKeywordGroup", ""))
            for result in results
        )
        if deafblind_count < len(results):
            notes.append("관련 원천 문서가 부족하여 일반 복지지원 문서를 함께 제공합니다.")
    if any(keyword in query for keyword in SIGN_LANGUAGE_KEYWORDS):
        direct_count = sum(
            any(
                keyword in " ".join(
                    str(result.get(field, ""))
                    for field in ("title", "summary", "targetKeywordGroup")
                )
                for keyword in SIGN_LANGUAGE_KEYWORDS
            )
            for result in results
        )
        if direct_count == 0:
            notes.append("수어통역 관련 직접 문서가 없어 일반 복지지원 문서를 제공합니다.")
    if results and not str(results[0].get("url", "")).strip():
        notes.append("대표 원문 URL이 없어 출처 정보를 함께 확인하세요.")
    return " ".join(dict.fromkeys(notes))


def build_info_response(
    query: str,
    user_accessibility_type: str = "ALL",
    top_k: int = 5,
    context: dict[str, Any] | None = None,
) -> dict:
    """Convert classified RAG results into user-facing response formats."""
    if not isinstance(query, str) or not query.strip():
        raise ValueError("query must be a non-empty string")

    user_type = str(user_accessibility_type or "ALL").upper()
    if user_type not in ACCESSIBILITY_TYPES:
        user_type = "ALL"

    rag_result = search_documents(query=query.strip(), top_k=top_k)
    classification = rag_result["classification"].copy()
    if _is_urgent_query(query):
        classification["priority"] = "URGENT"
    elif _is_preparedness_query(query) and classification.get("category") == "재난/안전":
        classification["priority"] = "HIGH"
    category = classification["category"]
    priority = classification["priority"]
    results = rag_result.get("results", [])
    request_context = context if isinstance(context, dict) else {}
    last_info_agent = _last_info_card(request_context)
    followup_type = classify_followup_type(query)
    is_followup = (
        isinstance(last_info_agent, dict)
        and bool(last_info_agent.get("title"))
        and followup_type is not None
        and (request_context.get("isFollowup") is True or bool(last_info_agent))
    )
    if is_followup:
        representative = results[0] if results else None
        followup_answer = build_followup_answer(
            followup_type,
            last_info_agent,
            representative,
        )
        answer = followup_answer["answer"]
        response = {
            "responseType": "FOLLOWUP_ANSWER",
            "intent": "INFO_AGENT_FOLLOWUP",
            "action": "ANSWER_FOLLOWUP",
            "answerText": answer,
            "voiceText": _truncate(answer, 180),
            "infoCard": None,
            "query": rag_result.get("query", query.strip()),
            "classification": classification,
            "userAccessibilityType": user_type,
            "appCard": None,
            "followupAnswer": followup_answer,
            "bandMessage": "",
            "voiceMessage": _truncate(answer, 180),
            "notificationTabMessage": "",
            "recommendedChannels": ["APP"],
            "notifyGuardian": False,
            "note": "",
            "sourceDocuments": _source_documents(results),
            "rag": {
                "resultCount": rag_result.get("resultCount", len(results)),
                "fallbackUsed": rag_result.get("fallbackUsed", False),
                "fallbackLevel": rag_result.get("fallbackLevel", "all"),
            },
        }
        response["_llmMeta"] = _llm_meta(reason="followup_template")
        return attach_quality_debug(
            response,
            rag_result,
            classification,
            results,
            is_followup=True,
        )
    if _is_broad_query(query):
        overview_action = "의료비, 보조기기, 이동, 취업·교육 중 필요한 분야를 알려주세요."
        overview_card = {
            "title": "복지 지원 정보",
            "summary": "여러 복지 지원 중 필요한 분야와 거주 지역을 알려주시면 더 알맞은 정보를 찾을 수 있어요.",
            "recommendedAction": overview_action,
            "source": "",
            "url": "",
        }
        overview_answer = "찾고 계신 복지 분야를 알려주세요."
        response = {
            "responseType": "INFO_OVERVIEW",
            "intent": "INFO_AGENT_QUERY",
            "action": "SHOW_INFO_OVERVIEW",
            "answerText": overview_answer,
            "voiceText": f"{overview_answer} {overview_action}",
            "infoCard": overview_card,
            "query": rag_result.get("query", query.strip()),
            "classification": classification,
            "userAccessibilityType": user_type,
            "appCard": overview_card,
            "followupAnswer": None,
            "bandMessage": "",
            "voiceMessage": f"{overview_answer} {overview_action}",
            "notificationTabMessage": "",
            "recommendedChannels": [],
            "notifyGuardian": False,
            "note": "",
            "sourceDocuments": _source_documents(results),
            "rag": {
                "resultCount": rag_result.get("resultCount", len(results)),
                "fallbackUsed": rag_result.get("fallbackUsed", False),
                "fallbackLevel": rag_result.get("fallbackLevel", "all"),
            },
        }
        response["_llmMeta"] = _llm_meta(reason="broad_query")
        return attach_quality_debug(response, rag_result, classification, results)
    note = _response_note(
        query,
        classification,
        results,
        rag_result.get("fallbackUsed", False),
    )
    if results:
        representative = results[0]
        important_fields = _important_fields(representative)
        title = representative.get("title") or "관련 정보 안내"
        app_summary = build_clean_summary(
            title,
            representative.get("summary", ""),
            category,
            important_fields,
        )
        action = build_recommended_action(category, priority, important_fields)
        source = representative.get("source", "")
        url = representative.get("url", "")
        answer_text = build_short_answer_text(title, category, priority)
        answer_text = build_field_priority_answer(
            query,
            title,
            important_fields,
            answer_text,
            summary=app_summary,
            source=source,
            category=category,
        )
        notification = answer_text
        voice = _truncate(f"{answer_text} {action}", 180)
        band_message = _truncate(_band_message(query, category, priority), 24)
        guide = safety_guide(query) if category == "재난/안전" or priority == "URGENT" else None
        if guide:
            title = guide["title"]
            app_summary = guide["summary"]
            action = guide["action"]
            answer_text = action
            notification = action
            voice = _truncate(f"{title}입니다. {action}", 180)
            band_message = _truncate(_band_message(query, category, priority), 24)
    else:
        title = "관련 정보 안내"
        app_summary = NO_RESULT_MESSAGE
        action = _recommended_action(category, priority)
        source = ""
        url = ""
        answer_text = NO_RESULT_MESSAGE
        notification = NO_RESULT_MESSAGE
        voice = NO_RESULT_MESSAGE
        band_message = "관련 정보 없음"

    notify_guardian = (
        priority == "URGENT"
        or user_type == "VISUAL_HEARING_IMPAIRED"
        or (category == "재난/안전" and priority in {"HIGH", "URGENT"})
    )
    response_type = (
        "NO_RESULT"
        if not results
        else "URGENT_INFO_CARD"
        if priority == "URGENT"
        else "INFO_CARD"
    )
    show_delivery_channels = response_type == "URGENT_INFO_CARD"
    app_card = {
        "title": title,
        "summary": app_summary,
        "recommendedAction": action,
        "source": source,
        "url": url,
    } if results else None
    if app_card:
        for field in (
            "supportTarget",
            "eligibility",
            "applicationTarget",
            "selectionCriteria",
            "ageCondition",
            "incomeCondition",
            "regionCondition",
            "supportContent",
            "applyMethod",
            "applicationMethod",
            "applicationPeriod",
            "contact",
            "requiredDocuments",
        ):
            if important_fields.get(field):
                app_card[field] = important_fields[field]
        verification_notice = _official_confirmation_notice(important_fields)
        if verification_notice and not guide:
            app_card["verificationNotice"] = verification_notice
            missing_labels = ", ".join(_missing_core_fields(important_fields))
            note = " ".join(
                part for part in (note, f"{missing_labels} 정보가 부족합니다. {verification_notice}") if part
            )
    response = {
        "responseType": response_type,
        "intent": "INFO_AGENT_QUERY",
        "action": "INFO_AGENT_NO_RESULT" if response_type == "NO_RESULT" else "SHOW_INFO_CARD",
        "answerText": answer_text,
        "voiceText": voice,
        "infoCard": app_card,
        "query": rag_result.get("query", query.strip()),
        "classification": classification,
        "userAccessibilityType": user_type,
        "appCard": app_card,
        "followupAnswer": None,
        "bandMessage": band_message if show_delivery_channels else "",
        "voiceMessage": voice,
        "notificationTabMessage": notification if show_delivery_channels else "",
        "recommendedChannels": _channels(user_type, priority) if show_delivery_channels else [],
        "notifyGuardian": notify_guardian if show_delivery_channels else False,
        "note": note,
        "sourceDocuments": _source_documents(results),
        "rag": {
            "resultCount": rag_result.get("resultCount", len(results)),
            "fallbackUsed": rag_result.get("fallbackUsed", False),
            "fallbackLevel": rag_result.get("fallbackLevel", "all"),
        },
    }
    response = build_llm_augmented_response(
        response=response,
        query=query.strip(),
        user_type=user_type,
        results=results,
        rag_result=rag_result,
    )
    return attach_quality_debug(response, rag_result, classification, results)
