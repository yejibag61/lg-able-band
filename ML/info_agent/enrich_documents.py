"""Build documents_enriched.csv without modifying the raw documents dataset."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd

try:
    from .important_field_extractor import extract_important_fields, important_field_quality
    from .url_content_collector import DEFAULT_CACHE_PATH, cache_key, collect_documents
except ImportError:
    from important_field_extractor import extract_important_fields, important_field_quality
    from url_content_collector import DEFAULT_CACHE_PATH, cache_key, collect_documents


MODULE_DIR = Path(__file__).resolve().parent
RAW_DOCUMENT_PATHS = (MODULE_DIR / "data" / "raw" / "documents.csv", MODULE_DIR / "documents.csv")
DEFAULT_OUTPUT_PATH = MODULE_DIR / "data" / "processed" / "documents_enriched.csv"
ENRICHED_COLUMNS = ("fetchedText", "fetchStatus", "fetchedAt", "importantFields", "importantFieldQuality")


def find_documents_path() -> Path:
    for path in RAW_DOCUMENT_PATHS:
        if path.exists():
            return path
    raise FileNotFoundError("documents.csv를 찾지 못했습니다.")


def enrich_frame(
    frame: pd.DataFrame,
    *,
    cache_path: Path = DEFAULT_CACHE_PATH,
    sleep_seconds: float = 0.3,
    max_fetch: int | None = None,
) -> pd.DataFrame:
    documents = frame.fillna("").astype(str).to_dict("records")
    cache = collect_documents(documents, cache_path=cache_path, sleep_seconds=sleep_seconds, max_fetch=max_fetch)
    rows = []
    for document in documents:
        cached = cache.get(cache_key(document.get("docId", ""), document.get("url", "")), {})
        fetched_text = cached.get("text", "") if cached.get("fetchStatus") == "SUCCESS" else ""
        fields = extract_important_fields(document, fetched_text)
        rows.append({
            **document,
            "fetchedText": fetched_text,
            "fetchStatus": cached.get("fetchStatus", "SKIPPED"),
            "fetchedAt": cached.get("fetchedAt", ""),
            "importantFields": json.dumps(fields, ensure_ascii=False),
            "importantFieldQuality": important_field_quality(fields),
        })
    return pd.DataFrame(rows, columns=[*frame.columns, *ENRICHED_COLUMNS])


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=find_documents_path())
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT_PATH)
    parser.add_argument("--cache", type=Path, default=DEFAULT_CACHE_PATH)
    parser.add_argument("--max-fetch", type=int, default=None)
    parser.add_argument("--sleep", type=float, default=0.3)
    args = parser.parse_args()

    source = pd.read_csv(args.input, dtype=str, encoding="utf-8-sig").fillna("")
    enriched = enrich_frame(source, cache_path=args.cache, sleep_seconds=args.sleep, max_fetch=args.max_fetch)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    enriched.to_csv(args.output, index=False, encoding="utf-8-sig")
    print(f"documents_enriched.csv: {len(enriched)}건")
    print(f"fetchStatus: {enriched['fetchStatus'].value_counts().to_dict()}")
    print(f"importantFieldQuality: {enriched['importantFieldQuality'].value_counts().to_dict()}")


if __name__ == "__main__":
    main()
