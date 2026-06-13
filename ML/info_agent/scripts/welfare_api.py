"""Reusable paginated public-data welfare API collector."""

import math
import time
from pathlib import Path
from typing import Any

import requests

from collector_utils import (
    collect_named_values,
    find_first_value,
    find_record_dicts,
    first_value,
    is_disability_related,
    joined_values,
    make_row,
    parse_response,
    save_filtered_rows,
    write_rows,
)
from target_keywords import infer_target_keyword_groups


TITLE_FIELDS = ("servNm", "serviceName", "welfareServiceName", "title", "svcNm")
CONTENT_FIELDS = (
    "servDgst", "summary", "content", "supportTarget", "sportTrgetCn", "slctCritCn",
    "aplyMtdCn", "servCn", "wlfareInfoOutlCn", "trgterIndvdlArray", "intrsThemaArray",
)
DETAIL_CONTENT_FIELDS = (
    "servDgst", "summary", "content", "supportTarget", "sportTrgetCn", "slctCritCn",
    "aplyMtdCn", "servCn", "wlfareInfoOutlCn", "inqplCtadr", "rprsCtadr", "bizChrDeptNm",
    "aplyMtdNm", "srvPvsnNm", "trgterIndvdlArray", "intrsThemaArray", "lifeArray",
)
URL_FIELDS = ("servDtlLink", "link", "url")
ID_FIELDS = ("servId", "svcId", "serviceId", "welfareInfoId", "servSeCode", "id")
TOTAL_COUNT_FIELDS = ("totalCount", "totalCnt")
DATE_FIELDS = (
    "publishedAt", "publishDate", "regDate", "createdAt", "svcfrstRegTs",
    "lastModYmd", "frstRegYmd", "dataStdDe", "referenceDate",
)


def _request_payload(url: str, params: dict[str, Any]) -> Any:
    response = requests.get(url, params=params, timeout=30)
    response.raise_for_status()
    return parse_response(response)


def collect_welfare_api(
    *,
    api_url: str,
    service_key: str | None,
    source: str,
    output_path: Path,
    detail_url: str = "",
    detail_id_param: str = "servId",
    service_key_param: str = "serviceKey",
    page_param: str = "pageNo",
    rows_param: str = "numOfRows",
    response_type_param: str = "",
    response_type_value: str = "",
    target_max_items: int = 1000,
    row_count: int = 100,
    detail_lookup_limit: int = 50,
    request_sleep_seconds: float = 0.1,
    extra_params: dict[str, Any] | None = None,
    detail_extra_params: dict[str, Any] | None = None,
    actionable_score_bonus: int = 0,
) -> list[dict[str, str]]:
    if not api_url or not service_key:
        reason = "API URL" if not api_url else "서비스 키"
        print(f"[{source}] {reason}가 없어 수집을 건너뜁니다.")
        write_rows([], output_path)
        return []

    base_params: dict[str, Any] = {service_key_param: service_key, rows_param: row_count}
    if response_type_param:
        base_params[response_type_param] = response_type_value
    base_params.update(extra_params or {})

    records: list[dict[str, Any]] = []
    page_number = 1
    total_count: int | None = None
    previous_signature: tuple[str, ...] | None = None
    try:
        while len(records) < target_max_items:
            payload = _request_payload(api_url, {**base_params, page_param: page_number})
            page_records = find_record_dicts(payload, TITLE_FIELDS)
            if not page_records:
                break
            signature = tuple(first_value(record, ID_FIELDS + TITLE_FIELDS) for record in page_records)
            if signature == previous_signature:
                break
            previous_signature = signature
            records.extend(page_records[: target_max_items - len(records)])
            if total_count is None:
                total_text = find_first_value(payload, TOTAL_COUNT_FIELDS)
                total_count = int(total_text) if total_text.isdigit() else None
            if total_count is not None and page_number >= math.ceil(min(total_count, target_max_items) / row_count):
                break
            if len(page_records) < row_count:
                break
            page_number += 1
            time.sleep(request_sleep_seconds)
    except requests.HTTPError as exc:
        status = exc.response.status_code if exc.response is not None else "unknown"
        print(f"[{source}] 목록 API 수집 중단: HTTP {status}")
    except Exception as exc:
        print(f"[{source}] 목록 API 수집 중단: {type(exc).__name__}")

    # Spend the limited detail-call budget on underrepresented target groups first.
    ordered_records = sorted(
        records,
        key=lambda record: (
            not bool(infer_target_keyword_groups(
                f"{first_value(record, TITLE_FIELDS)} {joined_values(record, CONTENT_FIELDS)}"
            )),
            not is_disability_related(make_row(
                first_value(record, TITLE_FIELDS), joined_values(record, CONTENT_FIELDS), source,
                first_value(record, URL_FIELDS), first_value(record, DATE_FIELDS), "PUBLIC_API",
            )),
        ),
    )
    rows: list[dict[str, str]] = []
    detail_success = 0
    detail_failure = 0
    for record in ordered_records:
        title = first_value(record, TITLE_FIELDS)
        content = joined_values(record, CONTENT_FIELDS)
        detail_content = ""
        record_id = first_value(record, ID_FIELDS)
        if detail_url and record_id and detail_success + detail_failure < detail_lookup_limit:
            try:
                detail_payload = _request_payload(
                    detail_url,
                    {service_key_param: service_key, detail_id_param: record_id, **(detail_extra_params or {})},
                )
                detail_content = collect_named_values(detail_payload, DETAIL_CONTENT_FIELDS)
                detail_success += 1
            except Exception:
                detail_failure += 1
            time.sleep(request_sleep_seconds)
        row = make_row(
            title,
            " ".join(part for part in (content, detail_content) if part),
            source,
            first_value(record, URL_FIELDS),
            first_value(record, DATE_FIELDS),
            "PUBLIC_API",
        )
        if row["targetKeywordGroup"] and actionable_score_bonus:
            action_hits = sum(
                keyword in f"{row['title']} {row['content']}"
                for keyword in ("신청", "대상", "방법", "지원내용", "지원 내용", "접수", "문의")
            )
            if action_hits >= 2:
                row["appRelevanceScore"] = str(min(100, int(row["appRelevanceScore"]) + actionable_score_bonus))
        if row["title"]:
            rows.append(row)

    eligible = save_filtered_rows(rows, output_path)
    total_label = str(total_count) if total_count is not None else "확인 불가"
    print(
        f"[{source}] API 전체 {total_label}건, 목록 수집 {len(records)}건, "
        f"앱 적합·연도 필터 통과 {len(eligible)}건, 상세조회 성공 {detail_success}건/실패 {detail_failure}건"
    )
    group_counts: dict[str, int] = {}
    for row in eligible:
        for group in row["targetKeywordGroup"].split("|"):
            if group:
                group_counts[group] = group_counts.get(group, 0) + 1
    print(f"[{source}] 부족 라벨 타깃 그룹: {group_counts}")
    return eligible
