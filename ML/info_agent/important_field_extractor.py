"""Extract actionable support fields from collected or existing document text."""

from __future__ import annotations

import json
import os
import re
from typing import Any


FIELD_NAMES = (
    "supportTarget", "eligibility", "applicationTarget", "selectionCriteria",
    "ageCondition", "incomeCondition", "regionCondition", "supportContent",
    "applyMethod", "applicationMethod", "applicationPeriod", "contact",
    "requiredDocuments", "region", "sourceAgency", "caution",
)
FIELD_ALIASES = {
    "supportTarget": (
        "supportTarget", "eligibility", "applicationTarget", "selectionCriteria",
        "target", "지원대상", "신청대상", "선정기준", "서비스대상", "이용대상",
    ),
    "eligibility": ("eligibility", "supportTarget", "applicationTarget", "selectionCriteria"),
    "applicationTarget": ("applicationTarget", "supportTarget", "eligibility", "target"),
    "selectionCriteria": ("selectionCriteria", "선정기준", "slctCritCn"),
    "ageCondition": ("ageCondition", "연령조건", "나이조건"),
    "incomeCondition": ("incomeCondition", "소득조건", "소득기준"),
    "regionCondition": ("regionCondition", "거주조건", "지역조건"),
    "supportContent": ("supportContent", "benefit", "benefits", "지원내용", "지원혜택"),
    "applyMethod": ("applyMethod", "applicationMethod", "howToApply", "신청방법", "신청절차"),
    "applicationMethod": ("applicationMethod", "applyMethod", "howToApply", "신청방법", "신청절차"),
    "contact": ("contact", "inquiry", "contactInfo", "문의처", "담당기관", "담당부서"),
    "sourceAgency": ("sourceAgency", "source", "출처", "제공기관"),
}
FIELD_KEYWORDS = {
    "supportTarget": (
        "지원대상", "지원 대상", "대상자", "신청대상", "신청 대상", "선정기준",
        "서비스 대상", "이용대상", "기초연금 선정기준", "만 65세", "어르신",
        "등록장애인", "등록 장애인", "수급자", "차상위",
    ),
    "selectionCriteria": ("선정기준", "선정 기준", "기준을 모두 충족", "우선순위", "지원대상 여부"),
    "supportContent": ("지원내용", "지원 내용", "지원금", "지원액", "의료비", "교통비", "보조기기", "서비스 내용"),
    "applyMethod": ("신청방법", "신청 방법", "신청절차", "신청 절차", "방문 신청", "온라인 신청", "읍·면·동", "주민센터", "복지로"),
    "contact": ("문의처", "담당부서", "전화", "연락처", "콜센터", "문의", "주민센터", "읍·면·동"),
    "applicationPeriod": ("신청기간", "신청 기간", "접수기간", "접수 기간", "마감", "상시", "연중"),
    "requiredDocuments": ("제출서류", "구비서류", "필요서류", "서류", "신청서"),
}
REGION_PATTERN = re.compile(r"(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)[^\s,.;]{0,12}")
AGE_PATTERN = re.compile(r"(?:만\s*)?\d{1,3}\s*세(?:\s*(?:이상|이하|미만|초과))?")
INCOME_PATTERNS = (
    re.compile(r"기초연금(?:법)?(?:에 따른)?\s*(?:선정기준|수급자)?"),
    re.compile(r"(?:국민기초생활보장법에 따른\s*)?(?:기초생활)?수급자"),
    re.compile(r"차상위(?:계층|초과자)?"),
    re.compile(r"(?:기준)?중위소득\s*\d{1,3}%\s*(?:이하|미만)?"),
    re.compile(r"소득인정액이?\s*[^,.;]{1,30}"),
)
REGION_CONDITION_PATTERNS = (
    re.compile(r"[가-힣]+(?:시|군|구)에?\s*\d+\s*년\s*이상[^,.;]{0,30}거주"),
    re.compile(r"[가-힣]+(?:시|군|구)\s*거주"),
    re.compile(r"(?:주소지|거주지)\s*(?:읍면동|읍·면·동|주민센터|행정복지센터)"),
)
APPLICATION_METHOD_PATTERNS = (
    re.compile(
        r"(?:주소지|거주지|관할)?\s*(?:읍면동|읍·면·동|주민센터|행정복지센터)"
        r"(?:에|에서)?\s*(?:방문\s*)?신청(?:\s*접수)?"
    ),
    re.compile(r"(?:읍면동|읍·면·동|주민센터|행정복지센터)\s*방문\s*신청"),
)
CONTACT_PATTERNS = (
    re.compile(r"(?:문의처|문의)\s*[:：]?\s*\d{2,4}-\d{3,4}-\d{4}"),
    re.compile(r"\d{2,4}-\d{3,4}-\d{4}(?:\([^)]{1,40}\))?"),
)
TARGET_HINT_PATTERN = re.compile(
    r"(어르신|노인|등록\s*장애인|등록장애인|청각장애인|시각장애인|"
    r"중증장애인|저소득\s*장애인|수급자|차상위(?:계층)?)"
)
SELECTION_HINT_PATTERNS = (
    re.compile(r"기초연금\s*선정기준"),
    re.compile(r"(?:다음의?\s*)?\d+\s*가지\s*요건을\s*모두\s*충족"),
    re.compile(r"우선순위"),
    re.compile(r"지원대상\s*여부\s*확인"),
)
SYSTEM_PROMPT = (
    "너는 장애 복지·보조기기·재난안전 문서에서 핵심 신청 정보를 추출하는 도우미다. "
    "반드시 제공된 content 안의 정보만 사용한다. content에 없는 전화번호, 신청 기간, 기관명, "
    "자격 조건은 만들지 않는다. 확인할 수 없는 항목은 빈 문자열 또는 '출처에서 확인 필요'로 둔다. "
    "행정문서 표현을 쉬운 한국어로 정리하되, 제도명과 기관명은 바꾸지 않는다. JSON만 반환한다."
)


def empty_fields() -> dict[str, str]:
    return {name: "" for name in FIELD_NAMES}


def split_sentences(text: str) -> list[str]:
    normalized = re.sub(r"\s+", " ", str(text or "")).strip()
    return [sentence.strip() for sentence in re.split(r"(?<=[.!?])\s+|[\r\n]+", normalized) if sentence.strip()]


def extract_around_keywords(text: str, keywords: tuple[str, ...], radius: int = 1) -> str:
    sentences = split_sentences(text)
    selected: list[str] = []
    for index, sentence in enumerate(sentences):
        if not any(keyword in sentence for keyword in keywords):
            continue
        for candidate in sentences[max(0, index - radius): min(len(sentences), index + radius + 1)]:
            if candidate not in selected:
                selected.append(candidate)
        if selected:
            break
    return " ".join(selected)[:250]


def _clean_field_value(value: Any) -> str:
    normalized = re.sub(r"\s+", " ", str(value or "")).strip(" \t\r\n:|-")
    if normalized in {"", "없음", "미정", "해당 없음", "출처에서 확인 필요"}:
        return ""
    return normalized[:250]


def _direct_field(document: dict[str, Any], field: str) -> str:
    for alias in FIELD_ALIASES.get(field, (field,)):
        value = _clean_field_value(document.get(alias))
        if value:
            return value
    return ""


def _extract_labeled_value(text: str, keywords: tuple[str, ...]) -> str:
    labels = "|".join(re.escape(keyword) for keyword in sorted(keywords, key=len, reverse=True))
    match = re.search(
        rf"(?:^|[\n\r|•·])\s*(?:{labels})\s*[:：\-]\s*([^\n\r|]{{2,250}})",
        str(text or ""),
        flags=re.IGNORECASE,
    )
    return _clean_field_value(match.group(1)) if match else ""


def _unique_matches(patterns: tuple[re.Pattern[str], ...], text: str) -> str:
    values: list[str] = []
    for pattern in patterns:
        for match in pattern.finditer(text):
            value = _clean_field_value(match.group(0))
            if value and value not in values:
                values.append(value)
    return ", ".join(values)[:250]


def infer_condition_fields(text: str) -> dict[str, str]:
    normalized = re.sub(r"\s+", " ", str(text or "")).strip()
    age = _unique_matches((AGE_PATTERN,), normalized)
    income = _unique_matches(INCOME_PATTERNS, normalized)
    region = _unique_matches(REGION_CONDITION_PATTERNS, normalized)
    application_method = _unique_matches(APPLICATION_METHOD_PATTERNS, normalized)
    contact = _unique_matches(CONTACT_PATTERNS, normalized)
    target_hints = _unique_matches((TARGET_HINT_PATTERN,), normalized)
    selection = (
        _extract_labeled_value(normalized, FIELD_KEYWORDS["selectionCriteria"])
        or _unique_matches(SELECTION_HINT_PATTERNS, normalized)
    )
    eligibility_parts = [
        value for value in (target_hints, age, income, region, selection) if value
    ]
    eligibility = ", ".join(dict.fromkeys(eligibility_parts))[:250]
    return {
        "eligibility": eligibility,
        "applicationTarget": eligibility,
        "selectionCriteria": selection,
        "ageCondition": age,
        "incomeCondition": income,
        "regionCondition": region,
        "applicationMethod": application_method,
        "applyMethod": application_method,
        "contact": contact,
    }


def rule_based_extract(document: dict[str, Any], fetched_text: str = "") -> dict[str, str]:
    text = str(fetched_text or document.get("content") or "")
    fields = empty_fields()
    for field, keywords in FIELD_KEYWORDS.items():
        fields[field] = (
            _direct_field(document, field)
            or _extract_labeled_value(text, keywords)
            or extract_around_keywords(text, keywords, radius=0)
        )
    inferred = infer_condition_fields(text)
    for field, value in inferred.items():
        fields[field] = fields.get(field) or _direct_field(document, field) or value
    fields["supportTarget"] = (
        fields.get("supportTarget")
        or fields.get("eligibility")
        or fields.get("applicationTarget")
        or fields.get("selectionCriteria")
    )
    fields["eligibility"] = fields.get("eligibility") or fields.get("supportTarget")
    fields["applicationTarget"] = fields.get("applicationTarget") or fields.get("supportTarget")
    if inferred.get("selectionCriteria"):
        fields["selectionCriteria"] = inferred["selectionCriteria"]
    if inferred.get("applicationMethod"):
        fields["applyMethod"] = inferred["applicationMethod"]
        fields["applicationMethod"] = inferred["applicationMethod"]
    else:
        fields["applicationMethod"] = fields.get("applyMethod") or fields.get("applicationMethod")
        fields["applyMethod"] = fields.get("applyMethod") or fields.get("applicationMethod")
    if inferred.get("contact"):
        fields["contact"] = inferred["contact"]
    region = REGION_PATTERN.search(text)
    fields["region"] = region.group(0) if region else ""
    fields["sourceAgency"] = _direct_field(document, "sourceAgency")
    fields["caution"] = extract_around_keywords(text, ("주의", "유의", "제외", "중복", "변경"))
    return fields


def _llm_enabled() -> bool:
    return os.getenv("INFO_AGENT_USE_LLM", "false").strip().lower() == "true" and bool(os.getenv("OPENAI_API_KEY"))


def llm_extract(document: dict[str, Any], content: str) -> dict[str, str] | None:
    if not _llm_enabled():
        return None
    try:
        from openai import OpenAI

        schema = {
            "type": "object",
            "properties": {name: {"type": "string"} for name in FIELD_NAMES},
            "required": list(FIELD_NAMES),
            "additionalProperties": False,
        }
        payload = {
            "title": str(document.get("title") or ""),
            "source": str(document.get("source") or ""),
            "url": str(document.get("url") or ""),
            "category": str(document.get("category") or ""),
            "content": str(content or "")[:3000],
        }
        response = OpenAI().responses.create(
            model=os.getenv("INFO_AGENT_LLM_MODEL", "gpt-5.4-mini"),
            instructions=SYSTEM_PROMPT,
            input=json.dumps(payload, ensure_ascii=False),
            text={"format": {"type": "json_schema", "name": "important_fields", "strict": True, "schema": schema}},
        )
        parsed = json.loads(response.output_text)
        return {name: _clean_field_value(parsed.get(name)) for name in FIELD_NAMES}
    except Exception:
        return None


def extract_important_fields(document: dict[str, Any], fetched_text: str = "") -> dict[str, str]:
    content = str(fetched_text or document.get("content") or "")
    rule_fields = rule_based_extract(document, fetched_text)
    llm_fields = llm_extract(document, content)
    if not llm_fields:
        return rule_fields
    return {name: llm_fields.get(name) or rule_fields.get(name, "") for name in FIELD_NAMES}


def important_field_quality(fields: dict[str, str]) -> str:
    core_count = sum(
        bool(str(fields.get(name, "")).strip())
        for name in ("eligibility", "supportContent", "applicationMethod", "contact")
    )
    if core_count >= 2:
        return "HIGH"
    if fields.get("supportContent") or fields.get("applyMethod"):
        return "MEDIUM"
    return "LOW"
