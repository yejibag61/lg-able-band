"""Shared, robots-friendly RSS metadata collector."""

import time
from pathlib import Path

import feedparser

from collector_utils import clean_text, make_row, save_filtered_rows


def collect_rss_feeds(source: str, rss_urls: list[str], output_path: Path, sleep_seconds: float = 0.3) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for rss_url in rss_urls:
        feed_count = 0
        try:
            feed = feedparser.parse(rss_url)
            if getattr(feed, "bozo", False) and not feed.entries:
                raise ValueError("RSS parsing failed")
            for entry in feed.entries:
                title = clean_text(entry.get("title", ""))
                link = clean_text(entry.get("link", ""))
                key = (title.lower(), link)
                if not title or key in seen:
                    continue
                summary = clean_text(entry.get("summary", entry.get("description", "")))
                published = entry.get("published", entry.get("updated", ""))
                rows.append(make_row(title, summary, source, link, published, "RSS"))
                seen.add(key)
                feed_count += 1
            print(f"[{source}] RSS {rss_url}: 메타데이터 {feed_count}건")
        except Exception as exc:
            print(f"[{source}] RSS 수집 실패 ({type(exc).__name__}), 다음 피드를 계속합니다.")
        time.sleep(sleep_seconds)
    eligible = save_filtered_rows(rows, output_path)
    print(f"[{source}] 앱 적합·연도 필터 통과 {len(eligible)}건을 저장했습니다.")
    return eligible
