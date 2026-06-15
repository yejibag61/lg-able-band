"""Collect and cache readable HTML text for info-agent document URLs."""

from __future__ import annotations

import json
import re
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup


MODULE_DIR = Path(__file__).resolve().parent
DEFAULT_CACHE_PATH = MODULE_DIR / "data" / "cache" / "url_content_cache.jsonl"
SKIP_EXTENSIONS = (".pdf", ".hwp", ".hwpx", ".doc", ".docx", ".xls", ".xlsx", ".zip")
REMOVE_SELECTORS = (
    "script", "style", "nav", "footer", "header", "aside", "noscript", "iframe",
    ".advertisement", ".advert", ".ad", ".ads", ".comment", ".comments", ".reply",
    "#advertisement", "#comments", "#reply",
)


def now_iso() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def cache_key(doc_id: str, url: str) -> str:
    return f"{doc_id}|{url}"


def load_cache(path: Path = DEFAULT_CACHE_PATH) -> dict[str, dict[str, Any]]:
    cache: dict[str, dict[str, Any]] = {}
    if not path.exists():
        return cache
    for line in path.read_text(encoding="utf-8").splitlines():
        try:
            item = json.loads(line)
        except json.JSONDecodeError:
            continue
        cache[cache_key(str(item.get("docId", "")), str(item.get("url", "")))] = item
    return cache


def write_cache(records: Iterable[dict[str, Any]], path: Path = DEFAULT_CACHE_PATH) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as file:
        for record in records:
            file.write(json.dumps(record, ensure_ascii=False) + "\n")


def clean_html_text(html: str, limit: int = 5000) -> tuple[str, str]:
    soup = BeautifulSoup(html or "", "html.parser")
    title = " ".join((soup.title.get_text(" ", strip=True) if soup.title else "").split())
    for selector in REMOVE_SELECTORS:
        for node in soup.select(selector):
            node.decompose()

    root = soup.select_one("main, article, [role='main'], .content, #content") or soup.body or soup
    lines: list[str] = []
    seen: set[str] = set()
    for raw_line in root.get_text("\n").splitlines():
        line = re.sub(r"\s+", " ", raw_line).strip()
        key = re.sub(r"\s+", "", line)
        if len(line) < 12 or key in seen:
            continue
        seen.add(key)
        lines.append(line)
    return title, "\n".join(lines)[:limit]


def skipped_record(doc_id: str, url: str, reason: str) -> dict[str, Any]:
    return {
        "docId": doc_id,
        "url": url,
        "fetchStatus": "SKIPPED",
        "httpStatus": None,
        "fetchedAt": now_iso(),
        "title": None,
        "text": "",
        "error": reason,
    }


def collect_url(
    doc_id: str,
    url: str,
    *,
    session: requests.Session | None = None,
    timeout: float = 5.0,
) -> dict[str, Any]:
    normalized_url = str(url or "").strip()
    if not normalized_url:
        return skipped_record(doc_id, normalized_url, "URL 없음")
    path = urlparse(normalized_url).path.lower()
    if path.endswith(SKIP_EXTENSIONS):
        return skipped_record(doc_id, normalized_url, "파싱 제외 파일")

    client = session or requests.Session()
    try:
        response = client.get(
            normalized_url,
            timeout=min(timeout, 5.0),
            headers={"User-Agent": "LG-Able-Band-InfoAgent/1.0"},
        )
        if response.status_code != 200:
            raise requests.HTTPError(f"HTTP {response.status_code}", response=response)
        content_type = response.headers.get("Content-Type", "").lower()
        if "html" not in content_type and content_type:
            return skipped_record(doc_id, normalized_url, f"지원하지 않는 Content-Type: {content_type}")
        title, text = clean_html_text(response.text)
        if not text:
            raise ValueError("본문 텍스트 없음")
        return {
            "docId": doc_id,
            "url": normalized_url,
            "fetchStatus": "SUCCESS",
            "httpStatus": response.status_code,
            "fetchedAt": now_iso(),
            "title": title or None,
            "text": text,
            "error": None,
        }
    except Exception as error:
        status = getattr(getattr(error, "response", None), "status_code", None)
        return {
            "docId": doc_id,
            "url": normalized_url,
            "fetchStatus": "FAILED",
            "httpStatus": status,
            "fetchedAt": now_iso(),
            "title": None,
            "text": "",
            "error": str(error),
        }


def collect_documents(
    documents: Iterable[dict[str, Any]],
    *,
    cache_path: Path = DEFAULT_CACHE_PATH,
    sleep_seconds: float = 0.3,
    max_fetch: int | None = None,
) -> dict[str, dict[str, Any]]:
    cache = load_cache(cache_path)
    fetched = 0
    for document in documents:
        doc_id = str(document.get("docId", ""))
        url = str(document.get("url", "")).strip()
        key = cache_key(doc_id, url)
        if cache.get(key, {}).get("fetchStatus") == "SUCCESS":
            continue
        if not url:
            cache[key] = skipped_record(doc_id, url, "URL 없음")
            continue
        if max_fetch is not None and fetched >= max_fetch:
            cache.setdefault(key, skipped_record(doc_id, url, "이번 실행의 수집 제한"))
            continue
        cache[key] = collect_url(doc_id, url)
        fetched += 1
        if sleep_seconds > 0:
            time.sleep(sleep_seconds)
    write_cache(cache.values(), cache_path)
    return cache
