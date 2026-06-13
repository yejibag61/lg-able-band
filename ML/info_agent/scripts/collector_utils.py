"""Common normalization, parsing, and CSV helpers for collectors."""

import html
import re
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable

import pandas as pd

from date_utils import parse_publication_date
from labeling_rules import (
    infer_accessibility_target,
    infer_app_relevance_score,
    infer_app_use_case,
    infer_category,
    infer_priority,
    is_app_relevant,
    is_disability_related_text,
)
from target_keywords import target_keyword_group_value


INFO_AGENT_DIR = Path(__file__).resolve().parents[1]
RAW_DATA_DIR = INFO_AGENT_DIR / "data" / "raw"
COLUMNS = [
    "docId", "title", "content", "source", "url", "publishedAt", "year", "collectedAt",
    "accessibilityTarget", "category", "priority", "isDisabilityRelated", "sourceType",
    "appRelevanceScore", "appUseCase",
    "targetKeywordGroup",
]
EXCLUSION_COLUMNS = COLUMNS + ["exclusionReason"]
ALLOWED_SOURCE_TYPES = {"PUBLIC_API", "RSS", "NEWS_LIST", "FILE_DATA"}
TAG_PATTERN = re.compile(r"<[^>]+>")


def clean_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (list, tuple)):
        value = " ".join(clean_text(item) for item in value)
    elif isinstance(value, dict):
        value = " ".join(clean_text(item) for item in value.values())
    text = html.unescape(str(value))
    return re.sub(r"\s+", " ", TAG_PATTERN.sub(" ", text)).strip()


def make_row(
    title: Any,
    content: Any,
    source: str,
    url: Any = "",
    published_at: Any = "",
    source_type: str = "PUBLIC_API",
) -> dict[str, str]:
    clean_title = clean_text(title)
    clean_content = clean_text(content)
    combined = f"{clean_title} {clean_content}"
    relevance_text = combined.replace("장애인신문", "")
    category = infer_category(relevance_text)
    priority = infer_priority(relevance_text)
    target = infer_accessibility_target(relevance_text)
    score = infer_app_relevance_score(relevance_text, category, priority, target)
    explicit_mentions = len(re.findall(
        r"(?:시각|청각|시청각|발달|중증|지체|정신|척수)?장애인|장애학생|교통약자|안전취약계층",
        relevance_text,
    ))
    title_is_direct = is_disability_related_text(clean_title)
    if not title_is_direct and explicit_mentions == 0:
        score = min(score, 35)
    elif not title_is_direct and explicit_mentions == 1:
        score = min(score, 55)
    if category == "재난/안전" and priority == "URGENT":
        score = max(score, 70)
    if source_type in {"RSS", "NEWS_LIST"} and not title_is_direct:
        score = min(score, 55)
    parsed_date, year = parse_publication_date(published_at)
    return {
        "docId": "",
        "title": clean_title,
        "content": clean_content,
        "source": source,
        "url": clean_text(url),
        "publishedAt": parsed_date,
        "year": year,
        "collectedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "accessibilityTarget": target,
        "category": category,
        "priority": priority,
        "isDisabilityRelated": "TRUE" if title_is_direct or explicit_mentions > 0 else "FALSE",
        "sourceType": source_type,
        "appRelevanceScore": str(score),
        "appUseCase": infer_app_use_case(combined, category, priority, target),
        "targetKeywordGroup": target_keyword_group_value(relevance_text),
    }


def is_disability_related(row: dict[str, str]) -> bool:
    text = f"{row.get('title', '')} {row.get('content', '')}".lower()
    return is_disability_related_text(text)


def write_rows(rows: Iterable[dict[str, Any]], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    normalized = [{column: row.get(column, "") for column in COLUMNS} for row in rows]
    pd.DataFrame(normalized, columns=COLUMNS).to_csv(output_path, index=False, encoding="utf-8-sig")


def exclusion_reason(row: dict[str, Any]) -> str:
    if not row.get("year"):
        return "MISSING_YEAR"
    try:
        if int(str(row["year"])) < 2020:
            return "BEFORE_2020"
    except ValueError:
        return "MISSING_YEAR"
    if str(row.get("isDisabilityRelated", "")).upper() != "TRUE":
        return "NOT_DISABILITY_RELATED"
    text = f"{row.get('title', '')} {row.get('content', '')}"
    score = int(str(row.get("appRelevanceScore", 0) or 0))
    if len(clean_text(row.get("content"))) < 40:
        return "NO_ACTIONABLE_CONTENT"
    if score < 40:
        return "GENERAL_NEWS_ONLY" if row.get("category") == "일반뉴스" else "LOW_APP_RELEVANCE"
    return ""


def split_eligible_rows(rows: Iterable[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    eligible, excluded_year, excluded_relevance = [], [], []
    for row in rows:
        reason = exclusion_reason(row)
        if not reason:
            eligible.append(row)
        else:
            excluded = {**row, "exclusionReason": reason}
            (excluded_year if reason in {"MISSING_YEAR", "BEFORE_2020"} else excluded_relevance).append(excluded)
    return eligible, excluded_year, excluded_relevance


def write_excluded(rows: Iterable[dict[str, Any]], folder_name: str, file_name: str) -> None:
    output = RAW_DATA_DIR / folder_name / file_name
    output.parent.mkdir(parents=True, exist_ok=True)
    normalized = [{column: row.get(column, "") for column in EXCLUSION_COLUMNS} for row in rows]
    pd.DataFrame(normalized, columns=EXCLUSION_COLUMNS).to_csv(output, index=False, encoding="utf-8-sig")


def save_filtered_rows(rows: Iterable[dict[str, Any]], output_path: Path) -> list[dict[str, Any]]:
    eligible, excluded_year, excluded_relevance = split_eligible_rows(rows)
    write_rows(eligible, output_path)
    write_excluded(excluded_year, "excluded_by_year", output_path.name)
    write_excluded(excluded_relevance, "excluded_by_relevance", output_path.name)
    return eligible


def parse_response(response: Any) -> Any:
    try:
        return response.json()
    except ValueError:
        pass
    try:
        import xmltodict

        return xmltodict.parse(response.text)
    except (ImportError, Exception):
        root = ET.fromstring(response.text)
        return _element_to_value(root)


def _element_to_value(element: ET.Element) -> Any:
    children = list(element)
    if not children:
        return element.text or ""
    result: dict[str, Any] = {}
    for child in children:
        key = child.tag.split("}")[-1]
        value = _element_to_value(child)
        if key in result:
            result[key] = result[key] if isinstance(result[key], list) else [result[key]]
            result[key].append(value)
        else:
            result[key] = value
    return result


def find_record_dicts(payload: Any, title_fields: tuple[str, ...]) -> list[dict[str, Any]]:
    candidates: list[list[dict[str, Any]]] = []

    def visit(value: Any) -> None:
        if isinstance(value, list):
            dicts = [item for item in value if isinstance(item, dict)]
            if dicts:
                candidates.append(dicts)
            for item in value:
                visit(item)
        elif isinstance(value, dict):
            if any(field in value for field in title_fields):
                candidates.append([value])
            for item in value.values():
                visit(item)

    visit(payload)
    if not candidates:
        return []
    return max(candidates, key=lambda records: sum(any(field in record for field in title_fields) for record in records))


def first_value(record: dict[str, Any], fields: tuple[str, ...]) -> str:
    for field in fields:
        value = clean_text(record.get(field))
        if value:
            return value
    return ""


def joined_values(record: dict[str, Any], fields: tuple[str, ...]) -> str:
    values = [clean_text(record.get(field)) for field in fields]
    return " ".join(dict.fromkeys(value for value in values if value))


def find_first_value(payload: Any, field_names: tuple[str, ...]) -> str:
    """Find the first non-empty field value anywhere in a nested response."""
    if isinstance(payload, dict):
        for field in field_names:
            value = clean_text(payload.get(field))
            if value:
                return value
        for value in payload.values():
            found = find_first_value(value, field_names)
            if found:
                return found
    elif isinstance(payload, list):
        for value in payload:
            found = find_first_value(value, field_names)
            if found:
                return found
    return ""


def collect_named_values(payload: Any, field_names: tuple[str, ...]) -> str:
    """Join selected fields found anywhere in a nested response."""
    values: list[str] = []

    def visit(value: Any) -> None:
        if isinstance(value, dict):
            for key, child in value.items():
                if key in field_names:
                    cleaned = clean_text(child)
                    if cleaned:
                        values.append(cleaned)
                visit(child)
        elif isinstance(value, list):
            for child in value:
                visit(child)

    visit(payload)
    return " ".join(dict.fromkeys(values))
