"""Collect detailed Bokjiro/public-data welfare services for the RAG store."""

from __future__ import annotations

import csv
import hashlib
import html
import json
import re
import time
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any, Callable

import requests


LIST_OPERATION = "NationalWelfarelistV001"
DETAIL_OPERATION = "NationalWelfaredetailedV001"
SOURCE = "복지로/공공데이터포털"
FIELDS = (
    "docId", "title", "summary", "content", "source", "url", "category", "priority",
    "accessibilityTarget", "supportTarget", "selectionCriteria", "applicationMethod",
    "contact", "department", "updatedAt", "sourceType", "detailStatus", "importantFields",
)
TITLE_FIELDS = ("servNm", "serviceName", "welfareServiceName", "title", "svcNm")
ID_FIELDS = ("servId", "svcId", "serviceId", "welfareInfoId", "id")
SUMMARY_FIELDS = ("servDgst", "summary", "wlfareInfoOutlCn", "description")
URL_FIELDS = ("servDtlLink", "link", "url")
UPDATED_FIELDS = ("lastModYmd", "updatedAt", "dataStdDe", "referenceDate", "frstRegYmd")
SUPPORT_FIELDS = ("supportTarget", "sportTrgetCn", "trgterIndvdlArray", "eligibility")
SELECTION_FIELDS = ("selectionCriteria", "slctCritCn", "selectionCriterion")
APPLICATION_FIELDS = (
    "applicationMethod", "applyMethod", "aplyMtdCn", "aplyMtdNm", "howToApply",
)
CONTACT_FIELDS = ("contact", "inqplCtadr", "rprsCtadr", "contactInfo", "phone")
DEPARTMENT_FIELDS = ("department", "bizChrDeptNm", "agency", "organization")
DETAIL_TEXT_FIELDS = (
    *SUMMARY_FIELDS, *SUPPORT_FIELDS, *SELECTION_FIELDS, *APPLICATION_FIELDS,
    *CONTACT_FIELDS, *DEPARTMENT_FIELDS, "content", "servCn", "supportContent",
    "srvPvsnNm", "lifeArray", "intrsThemaArray",
)
APPLICATION_KEYWORDS = (
    "신청", "신청방법", "신청 방법", "접수", "방문", "온라인", "주민센터",
    "읍면동", "읍·면·동", "행정복지센터", "문의", "제출서류",
)
TAG_PATTERN = re.compile(r"<[^>]+>")
PRIORITY_DETAIL_KEYWORDS = (
    "장애인의료비", "장애인 의료비", "장애인활동지원", "장애인 활동지원",
    "장애인", "시각장애", "청각장애", "보조기기", "의료비", "신청",
)


def clean_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, dict):
        value = " ".join(clean_text(item) for item in value.values())
    elif isinstance(value, (list, tuple)):
        value = " ".join(clean_text(item) for item in value)
    return re.sub(r"\s+", " ", TAG_PATTERN.sub(" ", html.unescape(str(value)))).strip()


def _parse_payload(response: Any) -> Any:
    try:
        return response.json()
    except ValueError:
        root = ET.fromstring(response.text)

        def convert(element: ET.Element) -> Any:
            children = list(element)
            if not children:
                return element.text or ""
            result: dict[str, Any] = {}
            for child in children:
                key = child.tag.split("}")[-1]
                item = convert(child)
                if key in result:
                    result[key] = result[key] if isinstance(result[key], list) else [result[key]]
                    result[key].append(item)
                else:
                    result[key] = item
            return result

        return convert(root)


def _values(payload: Any, names: tuple[str, ...]) -> list[str]:
    found: list[str] = []

    def visit(value: Any) -> None:
        if isinstance(value, dict):
            for key, child in value.items():
                if key in names:
                    cleaned = clean_text(child)
                    if cleaned and cleaned not in found:
                        found.append(cleaned)
                visit(child)
        elif isinstance(value, list):
            for child in value:
                visit(child)

    visit(payload)
    return found


def _first(payload: Any, names: tuple[str, ...]) -> str:
    values = _values(payload, names)
    return values[0] if values else ""


def _records(payload: Any) -> list[dict[str, Any]]:
    candidates: list[list[dict[str, Any]]] = []

    def visit(value: Any) -> None:
        if isinstance(value, list):
            rows = [item for item in value if isinstance(item, dict)]
            if rows:
                candidates.append(rows)
            for item in value:
                visit(item)
        elif isinstance(value, dict):
            if any(name in value for name in TITLE_FIELDS):
                candidates.append([value])
            for item in value.values():
                visit(item)

    visit(payload)
    return max(candidates, key=len) if candidates else []


def extract_application_method(detail: Any, detail_text: str = "") -> str:
    direct = _first(detail, APPLICATION_FIELDS)
    if direct:
        return direct
    sentences = re.split(r"(?<=[.!?])\s+|[\r\n]+|(?=[가-힣 ]{2,12}\s*[:：])", detail_text)
    matches = [clean_text(sentence) for sentence in sentences if any(word in sentence for word in APPLICATION_KEYWORDS)]
    return " ".join(dict.fromkeys(match for match in matches if match))[:1000]


def _classify(text: str) -> tuple[str, str, str]:
    normalized = text.lower()
    category_rules = (
        ("의료/건강", ("의료", "건강", "진료", "재활", "의료비")),
        ("보조기기", ("보조기기", "보청기", "점자", "휠체어")),
        ("이동/교통", ("이동", "교통", "차량", "보행")),
        ("교육/고용", ("교육", "고용", "취업", "직업")),
        ("재난/안전", ("재난", "안전", "화재", "대피", "응급")),
        ("생활지원", ("생활", "돌봄", "활동지원", "생계")),
    )
    category = next((label for label, words in category_rules if any(word in normalized for word in words)), "복지서비스")
    priority = "URGENT" if any(word in normalized for word in ("긴급", "응급", "위기", "재난")) else (
        "HIGH" if any(word in normalized for word in ("신청", "접수", "마감")) else "MEDIUM"
    )
    visual = any(word in normalized for word in ("시각장애", "점자", "화면해설"))
    hearing = any(word in normalized for word in ("청각장애", "수어", "자막", "보청기"))
    if visual and hearing:
        target = "VISUAL_HEARING_IMPAIRED"
    elif visual:
        target = "VISUAL_IMPAIRED"
    elif hearing:
        target = "HEARING_IMPAIRED"
    elif any(word in normalized for word in ("장애인", "등록장애인", "장애 정도", "발달장애", "중증장애")):
        target = "DISABLED_GENERAL"
    else:
        target = "ALL"
    return category, priority, target


def normalize_service(
    list_record: dict[str, Any],
    detail: Any,
    detail_status: str = "DETAIL_OK",
) -> dict[str, str]:
    service_id = _first(list_record, ID_FIELDS) or _first(detail, ID_FIELDS)
    title = _first(detail, TITLE_FIELDS) or _first(list_record, TITLE_FIELDS)
    summary = _first(detail, SUMMARY_FIELDS) or _first(list_record, SUMMARY_FIELDS)
    detail_text = " ".join(_values(detail, DETAIL_TEXT_FIELDS))
    support = _first(detail, SUPPORT_FIELDS)
    selection = _first(detail, SELECTION_FIELDS)
    application = extract_application_method(detail, detail_text)
    contact = _first(detail, CONTACT_FIELDS)
    department = _first(detail, DEPARTMENT_FIELDS)
    url = _first(detail, URL_FIELDS) or _first(list_record, URL_FIELDS)
    updated = _first(detail, UPDATED_FIELDS) or _first(list_record, UPDATED_FIELDS)
    combined = " ".join(filter(None, (title, summary, support, selection, application, contact, detail_text)))
    category, priority, target = _classify(combined)
    content = "\n".join(
        line for line in (
            f"제목: {title}" if title else "",
            f"요약: {summary}" if summary else "",
            f"지원대상: {support}" if support else "",
            f"선정기준: {selection}" if selection else "",
            f"신청방법: {application}" if application else "",
            f"문의처: {contact}" if contact else "",
            f"담당부서: {department}" if department else "",
            f"출처: {SOURCE}",
        ) if line
    )
    important = {
        "supportTarget": support,
        "eligibility": support,
        "selectionCriteria": selection,
        "applyMethod": application,
        "applicationMethod": application,
        "contact": contact,
        "sourceAgency": SOURCE,
    }
    doc_id = service_id or hashlib.sha256(f"{title}|{url}".encode("utf-8")).hexdigest()[:16]
    return {
        "docId": f"BOKJIRO-{doc_id}", "title": title, "summary": summary, "content": content,
        "source": SOURCE, "url": url, "category": category, "priority": priority,
        "accessibilityTarget": target, "supportTarget": support,
        "selectionCriteria": selection, "applicationMethod": application, "contact": contact,
        "department": department, "updatedAt": updated, "sourceType": "PUBLIC_API",
        "detailStatus": detail_status,
        "importantFields": json.dumps(important, ensure_ascii=False),
    }


def save_documents(documents: list[dict[str, str]], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=FIELDS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows({field: document.get(field, "") for field in FIELDS} for document in documents)


def load_documents(output_path: Path) -> list[dict[str, str]]:
    if not output_path.is_file() or not output_path.stat().st_size:
        return []
    try:
        with output_path.open("r", encoding="utf-8-sig", newline="") as file:
            return list(csv.DictReader(file))
    except (OSError, csv.Error, UnicodeError):
        return []


def _detail_priority(record: dict[str, Any]) -> tuple[int, str]:
    text = " ".join(_values(record, (*TITLE_FIELDS, *SUMMARY_FIELDS, *SUPPORT_FIELDS)))
    score = sum(keyword in text for keyword in PRIORITY_DETAIL_KEYWORDS)
    return -score, _first(record, ID_FIELDS)


def _is_quota_error(error: Exception) -> bool:
    response = getattr(error, "response", None)
    return getattr(response, "status_code", None) == 429 or "quota" in str(error).lower()


def collect_bokjiro(
    *,
    base_url: str,
    service_key: str,
    output_path: Path,
    max_items: int = 1000,
    rows_per_page: int = 1000,
    max_list_requests: int = 1,
    max_detail_requests: int = 99,
    sleep_seconds: float = 0.1,
    request_get: Callable[..., Any] = requests.get,
) -> list[dict[str, str]]:
    base = base_url.rstrip("/")
    list_url = base if base.endswith(LIST_OPERATION) else f"{base}/{LIST_OPERATION}"
    detail_base = base[: -len(LIST_OPERATION)].rstrip("/") if base.endswith(LIST_OPERATION) else base
    detail_url = f"{detail_base}/{DETAIL_OPERATION}"
    records: list[dict[str, Any]] = []
    page = 1
    list_requests = 0
    while len(records) < max_items and list_requests < max_list_requests:
        response = request_get(
            list_url,
            params={"serviceKey": service_key, "pageNo": page, "numOfRows": rows_per_page, "callTp": "L", "srchKeyCode": "003"},
            timeout=30,
        )
        list_requests += 1
        response.raise_for_status()
        page_records = _records(_parse_payload(response))
        if not page_records:
            break
        records.extend(page_records[: max_items - len(records)])
        if len(page_records) < rows_per_page:
            break
        page += 1
        time.sleep(sleep_seconds)

    existing_documents = load_documents(output_path)
    detail_fields = ("supportTarget", "selectionCriteria", "applicationMethod", "contact")
    existing_ids = {
        str(document.get("docId", "")).removeprefix("BOKJIRO-")
        for document in existing_documents
        if str(document.get("detailStatus", "")).strip() == "DETAIL_OK"
        or any(str(document.get(field, "")).strip() for field in detail_fields)
    }
    pending_records = [
        record for record in records
        if _first(record, ID_FIELDS) not in existing_ids
    ]
    pending_records.sort(key=_detail_priority)

    documents: list[dict[str, str]] = []
    detail_success = 0
    detail_failure = 0
    detail_requests = 0
    first_detail_error = ""
    quota_exceeded = False
    for record in pending_records:
        if detail_requests >= max_detail_requests:
            break
        service_id = _first(record, ID_FIELDS)
        detail: Any = {}
        detail_status = "DETAIL_ID_MISSING"
        if service_id:
            try:
                detail_requests += 1
                response = request_get(
                    detail_url,
                    params={"serviceKey": service_key, "servId": service_id},
                    timeout=30,
                )
                response.raise_for_status()
                detail = _parse_payload(response)
                detail_status = "DETAIL_OK"
                detail_success += 1
            except (requests.RequestException, ValueError, ET.ParseError) as error:
                detail = {}
                detail_status = f"DETAIL_FAILED:{type(error).__name__}"
                detail_failure += 1
                if not first_detail_error:
                    first_detail_error = str(error)
                if _is_quota_error(error):
                    quota_exceeded = True
                    break
            time.sleep(sleep_seconds)
        document = normalize_service(record, detail, detail_status)
        if document["title"] and detail_status == "DETAIL_OK":
            documents.append(document)
    merged = {
        document.get("docId", ""): document
        for document in existing_documents
        if document.get("docId")
    }
    merged.update({document["docId"]: document for document in documents})
    if documents or existing_documents:
        save_documents(list(merged.values()), output_path)
    elif records:
        print(
            "상세조회에 성공한 문서가 없어 기존 bokjiro_documents.csv를 유지합니다."
        )
    else:
        save_documents([], output_path)
    print(
        f"복지로 목록 호출 {list_requests}회/{len(records)}건, 기존 상세 {len(existing_ids)}건, "
        f"이번 상세 호출 {detail_requests}회/성공 {detail_success}건/실패 {detail_failure}건, "
        f"누적 저장 {len(merged)}건입니다."
    )
    if detail_failure:
        print(
            "상세조회 실패 문서는 목록 정보만 포함합니다. "
            f"API 할당량과 키 권한을 확인하세요. 첫 오류: {first_detail_error}"
        )
    if quota_exceeded:
        print("일일 API 할당량 초과를 감지해 추가 상세조회를 즉시 중단했습니다.")
    return documents
