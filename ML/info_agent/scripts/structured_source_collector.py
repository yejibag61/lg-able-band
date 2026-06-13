"""Defensive JSON/XML/CSV/Excel API or file-data collector."""

from io import BytesIO, StringIO
from pathlib import Path
from typing import Any

import pandas as pd
import requests

from collector_utils import (
    clean_text,
    find_record_dicts,
    first_value,
    joined_values,
    make_row,
    parse_response,
    save_filtered_rows,
    write_rows,
)


TITLE_FIELDS = ("title", "subject", "reportTitle", "newsTitle", "자료명", "제목", "연구보고서명")
CONTENT_FIELDS = (
    "summary", "content", "description", "abstract", "keywords", "요약", "내용", "키워드",
    "연구목적", "연구책임자", "보고서종류",
)
URL_FIELDS = ("url", "link", "detailUrl", "자료URL", "링크")
DATE_FIELDS = ("publishedAt", "publishDate", "date", "regDate", "createdAt", "year", "발행일", "등록일", "연도")


def _records_from_response(response: requests.Response) -> list[dict[str, Any]]:
    content_type = response.headers.get("content-type", "").lower()
    url = response.url.lower()
    if "spreadsheet" in content_type or url.endswith((".xlsx", ".xls")):
        return pd.read_excel(BytesIO(response.content)).fillna("").to_dict("records")
    if "csv" in content_type or url.endswith(".csv"):
        return pd.read_csv(StringIO(response.content.decode("utf-8-sig"))).fillna("").to_dict("records")
    return find_record_dicts(parse_response(response), TITLE_FIELDS)


def _records_from_file(path: Path) -> list[dict[str, Any]]:
    if path.suffix.lower() in {".xlsx", ".xls"}:
        return pd.read_excel(path).fillna("").to_dict("records")
    for encoding in ("utf-8-sig", "cp949", "euc-kr"):
        try:
            return pd.read_csv(path, encoding=encoding).fillna("").to_dict("records")
        except UnicodeDecodeError:
            continue
    raise UnicodeError(f"지원하는 인코딩으로 읽을 수 없습니다: {path.name}")


def _records_to_rows(records: list[dict[str, Any]], source: str, source_type: str) -> list[dict[str, str]]:
    return [
        make_row(
            first_value(record, TITLE_FIELDS),
            joined_values(record, CONTENT_FIELDS),
            source,
            first_value(record, URL_FIELDS),
            first_value(record, DATE_FIELDS),
            source_type,
        )
        for record in records
    ]


def collect_structured_file(
    *,
    source: str,
    file_path: Path,
    output_path: Path,
) -> list[dict[str, str]]:
    if not file_path.exists():
        print(f"[{source}] 파일이 없어 수집을 건너뜁니다: {file_path.name}")
        write_rows([], output_path)
        return []
    try:
        records = _records_from_file(file_path)
        rows = [row for row in _records_to_rows(records, source, "FILE_DATA") if row["title"]]
        eligible = save_filtered_rows(rows, output_path)
        print(f"[{source}] 파일 원천 {len(records)}건, 앱 적합·연도 필터 통과 {len(eligible)}건")
        return eligible
    except Exception as exc:
        print(f"[{source}] 파일 수집 실패: {type(exc).__name__}")
        write_rows([], output_path)
        return []


def collect_structured_source(
    *,
    source: str,
    api_url: str,
    service_key: str | None,
    output_path: Path,
    source_type: str = "FILE_DATA",
) -> list[dict[str, str]]:
    if not api_url:
        print(f"[{source}] API URL이 없어 수집을 건너뜁니다.")
        write_rows([], output_path)
        return []
    params = {"serviceKey": service_key} if service_key else {}
    try:
        response = requests.get(api_url, params=params, timeout=45)
        response.raise_for_status()
        records = _records_from_response(response)
        rows = _records_to_rows(records, source, source_type)
        rows = [row for row in rows if row["title"]]
        eligible = save_filtered_rows(rows, output_path)
        print(f"[{source}] 원천 {len(records)}건, 앱 적합·연도 필터 통과 {len(eligible)}건")
        return eligible
    except Exception as exc:
        print(f"[{source}] 수집 실패: {type(exc).__name__}")
        write_rows([], output_path)
        return []
