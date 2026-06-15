"""Small CSV-backed retrieval service that can later be replaced by FAISS."""

import csv
import re
from pathlib import Path
from typing import Dict, List, Optional


DATA_PATH = Path(__file__).resolve().parent / "data" / "raw" / "documents.csv"
BOKJIRO_DATA_PATH = Path(__file__).resolve().parent / "data" / "bokjiro_documents.csv"
TOKEN_PATTERN = re.compile(r"[0-9A-Za-z가-힣]+")

FALLBACK_DOCUMENT = {
    "docId": "fallback-001",
    "title": "장애인 생활 정보 안내",
    "content": "필요한 장애인 복지와 안전 정보를 확인하고 관련 기관에 문의하세요.",
    "source": "LG Able Band",
    "url": "",
    "accessibilityTarget": "ALL",
    "category": "복지지원",
    "priority": "MEDIUM",
    "_score": 0.1,
}


def _tokens(text: str) -> set[str]:
    return {token.lower() for token in TOKEN_PATTERN.findall(text) if len(token) > 1}


def _load_documents() -> List[Dict[str, str]]:
    documents: List[Dict[str, str]] = []
    for path in (DATA_PATH, BOKJIRO_DATA_PATH):
        if not path.exists() or not path.stat().st_size:
            continue
        try:
            with path.open("r", encoding="utf-8-sig", newline="") as csv_file:
                rows = list(csv.DictReader(csv_file))
                if path == BOKJIRO_DATA_PATH:
                    detail_fields = (
                        "supportTarget", "selectionCriteria", "applicationMethod", "contact"
                    )
                    rows = [
                        row for row in rows
                        if any(str(row.get(field, "")).strip() for field in detail_fields)
                    ]
                documents.extend(rows)
        except (OSError, csv.Error, UnicodeError):
            continue
    return documents


def search_documents(
    query: str,
    accessibility_type: Optional[str],
    interests: List[str],
    top_k: int = 3,
) -> List[Dict[str, str]]:
    documents = _load_documents()
    if not documents:
        return [FALLBACK_DOCUMENT.copy()]

    search_text = " ".join([query, *interests]).strip()
    query_tokens = _tokens(search_text)
    accessibility = (accessibility_type or "").upper()
    ranked = []

    for document in documents:
        title_tokens = _tokens(document.get("title", ""))
        content_tokens = _tokens(document.get("content", ""))
        title_matches = len(query_tokens & title_tokens)
        content_matches = len(query_tokens & content_tokens)
        substring_matches = sum(
            token in (document.get("title", "") + document.get("content", "")).lower()
            for token in query_tokens
        )
        target = document.get("accessibilityTarget", "ALL").upper()
        target_bonus = 2.0 if accessibility and target == accessibility else 0.7 if target == "ALL" else 0.0
        score = title_matches * 3.0 + content_matches * 1.5 + substring_matches + target_bonus
        if score > target_bonus or (not query_tokens and target_bonus > 0):
            ranked.append({**document, "_score": score})

    if not ranked:
        return [FALLBACK_DOCUMENT.copy()]
    ranked.sort(key=lambda item: float(item["_score"]), reverse=True)
    return ranked[: max(1, top_k)]
