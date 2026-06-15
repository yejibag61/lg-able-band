"""Build app, band, voice, and notification responses from RAG results."""

import re
from typing import Any

try:
    from .rag_retriever import search_documents
except ImportError:
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
    "권리/차별": "차별이나 권리 침해가 의심되면 관련 기관에 상담하거나 신고 방법을 확인하세요.",
    "보조기기": "신청 대상, 지원 품목, 신청 방법을 확인한 뒤 담당 기관에 문의하세요.",
    "복지지원": "지원 대상과 신청 방법을 확인하고 거주 지역 담당 기관에 문의하세요.",
    "이동/교통": "이용 대상, 신청 방법, 운행 지역을 확인한 뒤 서비스를 신청하세요.",
    "취업/교육": "모집 기간, 신청 조건, 교육 내용을 확인한 뒤 신청 여부를 결정하세요.",
    "의료/건강": "지원 대상과 이용 방법을 확인하고 필요한 경우 의료기관이나 담당 기관에 문의하세요.",
    "일반뉴스": "관련 정책 변화나 참고 정보를 확인하고 필요한 경우 원문을 확인하세요.",
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
    "ELIGIBILITY": ("지원 대상", "대상", "누구"),
    "APPLY_METHOD": ("신청 방법", "이용 방법", "신청"),
    "CONTACT": ("담당 기관", "전화번호", "문의"),
    "DOCUMENTS": ("필요 서류", "서류"),
    "DEADLINE": ("언제까지", "마감", "기간"),
    "DETAIL": ("자세히", "더 알려줘"),
}


def _recommended_action(category: str, priority: str) -> str:
    if category == "재난/안전":
        if priority == "URGENT":
            return "즉시 안전한 곳으로 이동하고, 필요하면 보호자나 119에 연락하세요."
        return "안전 수칙을 확인하고 위험 상황이 있으면 보호자나 담당 기관에 문의하세요."
    return ACTION_BY_CATEGORY.get(category, ACTION_BY_CATEGORY["일반뉴스"])


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
    )
    return [{field: result.get(field, "") for field in fields} for result in results]


def classify_followup_type(query: str) -> str | None:
    normalized = str(query or "").strip()
    for followup_type, keywords in FOLLOWUP_KEYWORDS_BY_TYPE.items():
        if any(keyword in normalized for keyword in keywords):
            return followup_type
    return None


def build_followup_answer(
    followup_type: str,
    last_info_agent: dict[str, Any],
) -> dict[str, str]:
    title = str(last_info_agent.get("title") or "해당 정보").strip()
    source = str(last_info_agent.get("source") or "").strip()
    summary = str(last_info_agent.get("summary") or "관련 지원 및 이용 안내 정보입니다.").strip()
    answers = {
        "ELIGIBILITY": (
            f"{title} 지원 대상은 장애 유형, 소득 기준, 거주지 조건 등에 따라 달라질 수 있습니다. "
            "출처 링크에서 대상 조건을 확인해 주세요."
        ),
        "APPLY_METHOD": (
            f"{title} 신청 방법은 서비스나 지역에 따라 다를 수 있습니다. "
            "출처 링크에서 신청 절차를 확인하거나 관할 복지 담당 부서에 문의해 주세요."
        ),
        "CONTACT": (
            f"{title} 문의는 출처 링크를 먼저 확인하고, 필요한 경우 주민등록지 관할 읍·면·동 "
            "주민센터나 복지 담당 부서에 문의해 주세요."
        ),
        "DOCUMENTS": (
            f"{title} 신청에 필요한 서류는 기관과 서비스 조건에 따라 다를 수 있습니다. "
            "출처 링크나 담당 기관에서 제출 서류를 확인해 주세요."
        ),
        "DEADLINE": (
            f"{title} 신청 기간은 공고나 지역별 운영 일정에 따라 달라질 수 있습니다. "
            "최신 일정은 출처 링크에서 확인해 주세요."
        ),
        "DETAIL": f"{title}은(는) {summary} 자세한 내용은 출처 링크에서 확인해 주세요.",
    }
    answer = answers[followup_type]
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
    if any(keyword in query for keyword in URGENT_QUERY_KEYWORDS):
        classification["priority"] = "URGENT"
    category = classification["category"]
    priority = classification["priority"]
    results = rag_result.get("results", [])
    request_context = context if isinstance(context, dict) else {}
    last_info_agent = request_context.get("lastInfoAgent")
    followup_type = classify_followup_type(query)
    is_followup = (
        isinstance(last_info_agent, dict)
        and bool(last_info_agent.get("title"))
        and followup_type is not None
        and (request_context.get("isFollowup") is True or bool(last_info_agent))
    )
    if is_followup:
        followup_answer = build_followup_answer(followup_type, last_info_agent)
        answer = followup_answer["answer"]
        return {
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
    note = _response_note(
        query,
        classification,
        results,
        rag_result.get("fallbackUsed", False),
    )
    action = _recommended_action(category, priority)

    if results:
        representative = results[0]
        title = representative.get("title") or "관련 정보 안내"
        app_summary = _app_summary(representative, category, priority)
        source = representative.get("source", "")
        url = representative.get("url", "")
        notification = _notification_message(title, action, priority)
        voice = _voice_message(title, action, priority)
        band_message = _truncate(_band_message(query, category, priority), 24)
    else:
        title = "관련 정보 안내"
        app_summary = NO_RESULT_MESSAGE
        source = ""
        url = ""
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
    app_card = {
        "title": title,
        "summary": app_summary,
        "recommendedAction": action,
        "source": source,
        "url": url,
    } if results else None
    answer_text = notification

    return {
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
        "bandMessage": band_message,
        "voiceMessage": voice,
        "notificationTabMessage": notification,
        "recommendedChannels": _channels(user_type, priority),
        "notifyGuardian": notify_guardian,
        "note": note,
        "sourceDocuments": _source_documents(results),
        "rag": {
            "resultCount": rag_result.get("resultCount", len(results)),
            "fallbackUsed": rag_result.get("fallbackUsed", False),
            "fallbackLevel": rag_result.get("fallbackLevel", "all"),
        },
    }
