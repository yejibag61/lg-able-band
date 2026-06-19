"""Update the info-agent RAG document collection from public APIs and RSS.

Run from the repository root:
    python -m ML.info_agent.update_rag_documents

or:
    python ML/info_agent/update_rag_documents.py
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from collections import Counter
from datetime import datetime
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

import pandas as pd


MODULE_DIR = Path(__file__).resolve().parent
SCRIPT_DIR = MODULE_DIR / "scripts"
if str(MODULE_DIR) not in sys.path:
    sys.path.insert(0, str(MODULE_DIR))
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from important_field_extractor import extract_important_fields, important_field_quality  # noqa: E402
from predict_classifier import predict_info_agent  # noqa: E402
from scripts.collect_local_welfare import (  # noqa: E402
    DETAIL_LOOKUP_LIMIT as LOCAL_DETAIL_LOOKUP_LIMIT,
)
from scripts.collect_local_welfare import (  # noqa: E402
    EXTRA_PARAMS as LOCAL_EXTRA_PARAMS,
)
from scripts.collect_local_welfare import (  # noqa: E402
    NUM_OF_ROWS as LOCAL_NUM_OF_ROWS,
)
from scripts.collect_local_welfare import (  # noqa: E402
    REQUEST_SLEEP_SECONDS as LOCAL_REQUEST_SLEEP_SECONDS,
)
from scripts.collect_local_welfare import _detail_url as local_detail_url  # noqa: E402
from scripts.collect_local_welfare import _list_url as local_list_url  # noqa: E402
from scripts.collect_public_welfare import (  # noqa: E402
    DETAIL_LOOKUP_LIMIT as PUBLIC_DETAIL_LOOKUP_LIMIT,
)
from scripts.collect_public_welfare import (  # noqa: E402
    EXTRA_PARAMS as PUBLIC_EXTRA_PARAMS,
)
from scripts.collect_public_welfare import (  # noqa: E402
    NUM_OF_ROWS as PUBLIC_NUM_OF_ROWS,
)
from scripts.collect_public_welfare import (  # noqa: E402
    REQUEST_SLEEP_SECONDS as PUBLIC_REQUEST_SLEEP_SECONDS,
)
from scripts.collect_public_welfare import _detail_url as public_detail_url  # noqa: E402
from scripts.collect_public_welfare import _list_url as public_list_url  # noqa: E402
from scripts.collector_utils import COLUMNS, RAW_DATA_DIR, clean_text  # noqa: E402
from scripts.env_utils import (  # noqa: E402
    LOCAL_WELFARE_API_URL,
    PUBLIC_WELFARE_API_URL,
    get_service_key,
)
from scripts.rss_collector import collect_rss_feeds  # noqa: E402
from scripts.welfare_api import collect_welfare_api  # noqa: E402


DOCUMENT_PATH = MODULE_DIR / "data" / "processed" / "documents_enriched.csv"
BACKUP_STAMP_FORMAT = "%Y%m%d_%H%M"
DEFAULT_RECENT_LIMIT = 0

COMMON_COLUMNS = [
    "docId",
    "title",
    "content",
    "source",
    "url",
    "publishedAt",
    "year",
    "collectedAt",
    "accessibilityTarget",
    "category",
    "priority",
    "isDisabilityRelated",
    "sourceType",
    "serviceScope",
    "region",
    "appRelevanceScore",
    "appUseCase",
    "targetKeywordGroup",
    "fetchedText",
    "fetchStatus",
    "fetchedAt",
    "importantFields",
    "importantFieldQuality",
]

RSS_SOURCES = [
    {
        "name": "정책브리핑 RSS",
        "output": RAW_DATA_DIR / "policy_briefing.csv",
        "urls": [
            "https://www.korea.kr/rss/dept_mw.xml",
            "https://www.korea.kr/rss/dept_moel.xml",
            "https://www.korea.kr/rss/dept_mois.xml",
            "https://www.korea.kr/rss/dept_nfa.xml",
        ],
    },
    {
        "name": "에이블뉴스 RSS",
        "output": RAW_DATA_DIR / "ablenews_rss.csv",
        "urls": ["https://www.ablenews.co.kr/rss/allArticle.xml"],
    },
    {
        "name": "웰페어뉴스 RSS",
        "output": RAW_DATA_DIR / "welfarenews.csv",
        "urls": ["https://www.welfarenews.net/rss/allArticle.xml"],
    },
    {
        "name": "더인디고 RSS",
        "output": RAW_DATA_DIR / "theindigo_news.csv",
        "urls": ["https://theindigo.co.kr/feed"],
    },
    {
        "name": "소셜포커스 RSS",
        "output": RAW_DATA_DIR / "socialfocus.csv",
        "urls": ["https://www.socialfocus.co.kr/rss/allArticle.xml"],
    },
]

NATIONWIDE_SOURCE_HINTS = (
    "중앙부처",
    "보건복지부",
    "고용노동부",
    "행정안전부",
    "소방청",
    "정책브리핑",
    "복지로",
    "공공기관",
    "한국장애인개발원",
)
LOCAL_SOURCE_HINTS = ("지자체", "시청", "구청", "군청", "도청", "읍사무소", "면사무소", "동주민센터")
LOCAL_TITLE_HINTS = ("시 ", "군 ", "구 ", "특별시", "광역시", "특별자치", "도 ")
REGION_ALIASES = {
    "서울": ("서울", "서울시", "서울특별시"),
    "부산": ("부산", "부산시", "부산광역시"),
    "대구": ("대구", "대구시", "대구광역시"),
    "인천": ("인천", "인천시", "인천광역시"),
    "광주": ("광주", "광주시", "광주광역시"),
    "대전": ("대전", "대전시", "대전광역시"),
    "울산": ("울산", "울산시", "울산광역시"),
    "세종": ("세종", "세종시", "세종특별자치시"),
    "경기": ("경기", "경기도"),
    "강원": ("강원", "강원도", "강원특별자치도"),
    "충북": ("충북", "충청북도"),
    "충남": ("충남", "충청남도"),
    "전북": ("전북", "전라북도", "전북특별자치도"),
    "전남": ("전남", "전라남도"),
    "경북": ("경북", "경상북도"),
    "경남": ("경남", "경상남도"),
    "제주": ("제주", "제주도", "제주특별자치도"),
    "수원": ("수원", "수원시"),
    "성남": ("성남", "성남시"),
    "고양": ("고양", "고양시"),
    "용인": ("용인", "용인시"),
    "평택": ("평택", "평택시"),
    "창원": ("창원", "창원시"),
}
REGION_PARENTS = {
    "수원": "경기",
    "성남": "경기",
    "고양": "경기",
    "용인": "경기",
    "평택": "경기",
    "창원": "경남",
}


def _timestamp() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def _normalize_for_duplicate(text: Any) -> str:
    return re.sub(r"[^0-9a-zA-Z가-힣]+", "", str(text or "").lower())


def _read_documents(path: Path) -> pd.DataFrame:
    if not path.exists():
        return pd.DataFrame(columns=COMMON_COLUMNS)
    frame = pd.read_csv(path, dtype=str, encoding="utf-8-sig").fillna("")
    for column in COMMON_COLUMNS:
        if column not in frame.columns:
            frame[column] = ""
    for index, row in frame.iterrows():
        if not str(row.get("serviceScope", "")).strip() or not str(row.get("region", "")).strip():
            scope, region = _infer_scope_region(row.to_dict())
            if not str(row.get("serviceScope", "")).strip():
                frame.at[index, "serviceScope"] = scope
            if not str(row.get("region", "")).strip():
                frame.at[index, "region"] = region
    return frame[COMMON_COLUMNS]


def _backup(path: Path) -> Path:
    stamp = datetime.now().strftime(BACKUP_STAMP_FORMAT)
    backup_path = path.with_name(f"{path.stem}_backup_{stamp}{path.suffix}")
    counter = 1
    while backup_path.exists():
        backup_path = path.with_name(f"{path.stem}_backup_{stamp}_{counter}{path.suffix}")
        counter += 1
    shutil.copy2(path, backup_path)
    return backup_path


def _predict_labels(row: dict[str, Any]) -> dict[str, str]:
    text = " ".join(
        part
        for part in (str(row.get("title", "")).strip(), str(row.get("content", "")).strip())
        if part
    )
    if not text:
        return {"category": "", "accessibilityTarget": "", "priority": ""}
    prediction = predict_info_agent(text)
    final = prediction["finalPrediction"]
    return {
        "category": final.get("category", ""),
        "accessibilityTarget": final.get("accessibilityTarget", ""),
        "priority": final.get("priority", ""),
    }


def _detect_region(text: str) -> str:
    matches: list[str] = []
    for canonical, aliases in REGION_ALIASES.items():
        if any(alias in text for alias in aliases):
            matches.append(canonical)
            parent = REGION_PARENTS.get(canonical)
            if parent:
                matches.append(parent)
    return "/".join(dict.fromkeys(matches))


def _infer_scope_region(row: dict[str, Any]) -> tuple[str, str]:
    source = str(row.get("source", "") or "")
    source_type = str(row.get("sourceType", "") or "")
    text = " ".join(
        str(row.get(column, "") or "")
        for column in ("source", "title", "content", "url")
    )
    region = _detect_region(text)
    if any(hint in source for hint in NATIONWIDE_SOURCE_HINTS):
        return "nationwide", "전국"
    if "PUBLIC_API" == source_type and "중앙부처" in source:
        return "nationwide", "전국"
    if any(hint in source for hint in LOCAL_SOURCE_HINTS) or "지자체" in source:
        return "local", region or "지역 미상"
    if region:
        return "local", region
    if any(hint in text for hint in LOCAL_TITLE_HINTS) and any(hint in text for hint in LOCAL_SOURCE_HINTS):
        return "local", "지역 미상"
    if any(hint in text for hint in NATIONWIDE_SOURCE_HINTS):
        return "nationwide", "전국"
    return "unknown", "unknown"


def _default_important_fields(row: dict[str, Any]) -> tuple[str, str]:
    fields = extract_important_fields(row, "")
    return json.dumps(fields, ensure_ascii=False), important_field_quality(fields)


def _normalize_row(row: dict[str, Any]) -> dict[str, Any]:
    normalized = {column: clean_text(row.get(column, "")) for column in COMMON_COLUMNS}
    normalized["title"] = clean_text(row.get("title", ""))
    normalized["content"] = clean_text(row.get("content", ""))
    normalized["source"] = clean_text(row.get("source", ""))
    normalized["url"] = clean_text(row.get("url", ""))
    normalized["collectedAt"] = normalized.get("collectedAt") or _timestamp()
    labels = _predict_labels(normalized)
    normalized.update(labels)
    service_scope, region = _infer_scope_region(normalized)
    normalized["serviceScope"] = service_scope
    normalized["region"] = region
    normalized["fetchStatus"] = normalized.get("fetchStatus") or "SKIPPED"
    normalized["fetchedText"] = normalized.get("fetchedText") or ""
    normalized["fetchedAt"] = normalized.get("fetchedAt") or ""
    if not normalized.get("importantFields"):
        normalized["importantFields"], normalized["importantFieldQuality"] = _default_important_fields(normalized)
    if not normalized.get("importantFieldQuality"):
        normalized["importantFieldQuality"] = "LOW"
    return normalized


def _collect_public_welfare(limit: int) -> list[dict[str, str]]:
    return collect_welfare_api(
        api_url=public_list_url(PUBLIC_WELFARE_API_URL) if PUBLIC_WELFARE_API_URL else "",
        detail_url=public_detail_url(PUBLIC_WELFARE_API_URL) if PUBLIC_WELFARE_API_URL else "",
        service_key=get_service_key("DATA_GO_KR_SERVICE_KEY"),
        source="공공데이터포털 중앙부처복지서비스",
        output_path=RAW_DATA_DIR / "public_welfare.csv",
        target_max_items=limit,
        row_count=PUBLIC_NUM_OF_ROWS,
        detail_lookup_limit=min(PUBLIC_DETAIL_LOOKUP_LIMIT, limit),
        request_sleep_seconds=PUBLIC_REQUEST_SLEEP_SECONDS,
        extra_params=PUBLIC_EXTRA_PARAMS,
        actionable_score_bonus=5,
    )


def _collect_local_welfare(limit: int) -> list[dict[str, str]]:
    return collect_welfare_api(
        api_url=local_list_url(LOCAL_WELFARE_API_URL) if LOCAL_WELFARE_API_URL else "",
        detail_url=local_detail_url(LOCAL_WELFARE_API_URL) if LOCAL_WELFARE_API_URL else "",
        service_key=get_service_key("DATA_GO_KR_SERVICE_KEY"),
        source="공공데이터포털 지자체복지서비스",
        output_path=RAW_DATA_DIR / "local_welfare.csv",
        target_max_items=limit,
        row_count=LOCAL_NUM_OF_ROWS,
        detail_lookup_limit=min(LOCAL_DETAIL_LOOKUP_LIMIT, limit),
        request_sleep_seconds=LOCAL_REQUEST_SLEEP_SECONDS,
        extra_params=LOCAL_EXTRA_PARAMS,
        actionable_score_bonus=8,
    )


def collect_new_documents(limit_per_source: int, include_public_api: bool) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []
    if include_public_api:
        rows.extend(_collect_public_welfare(limit_per_source))
        rows.extend(_collect_local_welfare(limit_per_source))
    else:
        print("공공 API 수집은 --skip-public-api 옵션으로 건너뜁니다.")

    for source in RSS_SOURCES:
        rows.extend(
            collect_rss_feeds(
                source["name"],
                source["urls"],
                source["output"],
            )[:limit_per_source]
        )

    normalized_rows = []
    for row in rows:
        if clean_text(row.get("title")) and clean_text(row.get("content")):
            normalized_rows.append(_normalize_row(row))
    return pd.DataFrame(normalized_rows, columns=COMMON_COLUMNS)


def _is_near_duplicate(left: str, right: str) -> bool:
    if not left or not right:
        return False
    shorter, longer = sorted((left, right), key=len)
    if len(shorter) < 80:
        return False
    if shorter in longer and len(shorter) / max(len(longer), 1) >= 0.82:
        return True
    return SequenceMatcher(None, left[:1200], right[:1200]).ratio() >= 0.92


def merge_and_deduplicate(existing: pd.DataFrame, incoming: pd.DataFrame) -> tuple[pd.DataFrame, int, int]:
    if incoming.empty:
        return existing.copy(), 0, 0

    for column in COMMON_COLUMNS:
        if column not in existing.columns:
            existing[column] = ""
        if column not in incoming.columns:
            incoming[column] = ""

    merged = pd.concat(
        [existing[COMMON_COLUMNS].assign(_origin="existing"), incoming[COMMON_COLUMNS].assign(_origin="incoming")],
        ignore_index=True,
    ).fillna("")
    before = len(merged)
    kept_indices: list[int] = []
    seen_urls: set[str] = set()
    seen_title_sources: set[tuple[str, str]] = set()
    seen_texts: list[str] = []

    for index, row in merged.iterrows():
        url_key = str(row["url"]).strip().lower()
        title_key = _normalize_for_duplicate(row["title"])
        source_key = _normalize_for_duplicate(row["source"])
        text_key = _normalize_for_duplicate(f"{row['title']} {row['content']}")

        if url_key and url_key in seen_urls:
            continue
        if title_key and (title_key, source_key) in seen_title_sources:
            continue
        if any(_is_near_duplicate(text_key, seen_text) for seen_text in seen_texts[-3000:]):
            continue

        kept_indices.append(index)
        if url_key:
            seen_urls.add(url_key)
        if title_key:
            seen_title_sources.add((title_key, source_key))
        if text_key:
            seen_texts.append(text_key)

    result = merged.loc[kept_indices, COMMON_COLUMNS + ["_origin"]].copy()
    new_added = int(result["_origin"].eq("incoming").sum())
    duplicate_removed = before - len(result)
    result = result.drop(columns=["_origin"]).reset_index(drop=True)
    result["docId"] = [f"REAL-{index:04d}" for index in range(1, len(result) + 1)]
    return result, new_added, duplicate_removed


def _print_distribution(frame: pd.DataFrame, column: str) -> None:
    counts = Counter(str(value or "unknown") for value in frame[column].fillna(""))
    print(f"{column}별 분포: {dict(counts)}")


def print_summary(
    *,
    existing_count: int,
    collected_count: int,
    duplicate_removed: int,
    final_frame: pd.DataFrame,
    added_count: int,
    backup_path: Path,
) -> None:
    print("\nRAG 자료집 업데이트 결과")
    print(f"기존 문서 수: {existing_count}")
    print(f"새로 수집한 문서 수: {collected_count}")
    print(f"중복 제거된 문서 수: {duplicate_removed}")
    print(f"새로 추가된 문서 수: {added_count}")
    print(f"최종 documents_enriched.csv 문서 수: {len(final_frame)}")
    print(f"백업 파일: {backup_path}")
    for column in ("category", "accessibilityTarget", "priority", "serviceScope"):
        _print_distribution(final_frame, column)
    print("\n중복 제거 기준: 동일 url, 동일 title+source, title+content 92% 이상 유사")
    print("서버 안내: rag_retriever가 CSV를 모듈 로드시 읽으므로 실행 중인 ML 서버는 재기동이 필요합니다.")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Update ML/info_agent RAG documents.")
    parser.add_argument("--documents", type=Path, default=DOCUMENT_PATH)
    parser.add_argument("--limit-per-source", type=int, default=DEFAULT_RECENT_LIMIT)
    parser.add_argument("--skip-public-api", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    limit_per_source = args.limit_per_source if args.limit_per_source > 0 else 100000
    documents_path = args.documents
    existing = _read_documents(documents_path)
    if not documents_path.exists():
        raise FileNotFoundError(f"documents_enriched.csv not found: {documents_path}")

    incoming = collect_new_documents(
        limit_per_source=limit_per_source,
        include_public_api=not args.skip_public_api,
    )
    final_frame, added_count, duplicate_removed = merge_and_deduplicate(existing, incoming)
    backup_path = _backup(documents_path)
    documents_path.parent.mkdir(parents=True, exist_ok=True)
    final_frame.to_csv(documents_path, index=False, encoding="utf-8-sig")
    print_summary(
        existing_count=len(existing),
        collected_count=len(incoming),
        duplicate_removed=duplicate_removed,
        final_frame=final_frame,
        added_count=added_count,
        backup_path=backup_path,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
