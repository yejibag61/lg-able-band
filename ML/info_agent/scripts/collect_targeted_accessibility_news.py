"""Collect real news/report metadata matching underrepresented labels."""

import re
import time
import warnings
from collections import Counter
from pathlib import Path
from urllib.parse import quote_plus, urljoin, urlparse
from urllib.robotparser import RobotFileParser

import pandas as pd
import requests
from bs4 import BeautifulSoup, XMLParsedAsHTMLWarning

from collector_utils import (
    COLUMNS,
    EXCLUSION_COLUMNS,
    RAW_DATA_DIR,
    clean_text,
    make_row,
    split_eligible_rows,
    write_excluded,
    write_rows,
)
from news_target_keywords import NEWS_TARGET_KEYWORD_GROUPS, news_target_group_value


INPUT_FILES = (
    "ablenews_rss.csv", "theindigo_news.csv", "welfarenews.csv",
    "socialfocus.csv", "policy_briefing.csv", "koddi_report_api.csv",
)
PUBLIC_API_FILES = ("public_welfare.csv", "local_welfare.csv")
SEARCH_SOURCES = (
    ("에이블뉴스", "https://www.ablenews.co.kr", "/news/articleList.html?sc_area=A&view_type=sm&sc_word={keyword}", "articleView"),
    ("더인디고", "https://theindigo.co.kr", "/?s={keyword}", "/archives/"),
    ("웰페어뉴스", "https://www.welfarenews.net", "/news/articleList.html?sc_area=A&view_type=sm&sc_word={keyword}", "articleView"),
    ("소셜포커스", "https://www.socialfocus.co.kr", "/news/articleList.html?sc_area=A&view_type=sm&sc_word={keyword}", "articleView"),
)
USER_AGENT = "AbleBandInfoAgent/1.0 (+real-news-metadata-only)"
MIN_CONTENT_LENGTH = 40
MAX_LINKS_PER_QUERY = 4

warnings.filterwarnings("ignore", category=XMLParsedAsHTMLWarning)


def _normalized(text: str) -> str:
    return re.sub(r"[^0-9a-z가-힣]", "", str(text).lower())


def _read(path: Path) -> pd.DataFrame:
    try:
        frame = pd.read_csv(path, dtype=str, encoding="utf-8-sig").fillna("")
    except (OSError, UnicodeError, pd.errors.EmptyDataError):
        return pd.DataFrame(columns=COLUMNS)
    for column in COLUMNS:
        if column not in frame:
            frame[column] = ""
    return frame[COLUMNS]


def _public_api_keys() -> tuple[set[str], set[str]]:
    titles: set[str] = set()
    contents: set[str] = set()
    for file_name in PUBLIC_API_FILES:
        frame = _read(RAW_DATA_DIR / file_name)
        titles.update(frame["title"].map(_normalized))
        contents.update(frame["content"].map(_normalized))
    return titles, contents


def _robots_allowed(base_url: str, url: str, cache: dict[str, bool]) -> bool:
    if base_url not in cache:
        try:
            parser = RobotFileParser(urljoin(base_url, "/robots.txt"))
            parser.read()
            cache[base_url] = parser.can_fetch(USER_AGENT, url)
        except Exception:
            cache[base_url] = False
    return cache[base_url]


def _meta(soup: BeautifulSoup, *names: str) -> str:
    for name in names:
        tag = soup.find("meta", attrs={"property": name}) or soup.find("meta", attrs={"name": name})
        if tag and tag.get("content"):
            return clean_text(tag["content"])
    return ""


def _article_row(session: requests.Session, source: str, url: str) -> dict[str, str] | None:
    try:
        response = session.get(url, timeout=20)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")
        title = _meta(soup, "og:title", "twitter:title") or clean_text(soup.title.string if soup.title else "")
        content = _meta(soup, "og:description", "description", "twitter:description")
        published = _meta(
            soup, "article:published_time", "datePublished", "date", "pubdate",
            "parsely-pub-date",
        )
        canonical = soup.find("link", rel="canonical")
        original_url = canonical.get("href", "") if canonical else url
        groups = news_target_group_value(f"{title} {content}")
        if not groups or len(content) < MIN_CONTENT_LENGTH:
            return None
        row = make_row(title, content, source, original_url, published, "NEWS_LIST")
        row["targetKeywordGroup"] = groups
        return row
    except Exception:
        return None


def _search_news() -> tuple[list[dict[str, str]], Counter]:
    rows: list[dict[str, str]] = []
    stats = Counter()
    robots_cache: dict[str, bool] = {}
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})
    seen_urls: set[str] = set()

    search_keywords = {
        group: keywords[:4]
        for group, keywords in NEWS_TARGET_KEYWORD_GROUPS.items()
    }
    for source, base_url, search_path, article_marker in SEARCH_SOURCES:
        for keywords in search_keywords.values():
            for keyword in keywords:
                search_url = urljoin(base_url, search_path.format(keyword=quote_plus(keyword)))
                if not _robots_allowed(base_url, search_url, robots_cache):
                    stats["ROBOTS_DISALLOWED"] += 1
                    continue
                try:
                    response = session.get(search_url, timeout=20)
                    response.raise_for_status()
                    soup = BeautifulSoup(response.text, "html.parser")
                except Exception:
                    stats["SEARCH_FAILED"] += 1
                    continue
                stats["SEARCH_PAGES"] += 1
                links = []
                for anchor in soup.select("a[href]"):
                    url = urljoin(base_url, anchor.get("href", ""))
                    if article_marker not in url or urlparse(url).netloc != urlparse(base_url).netloc:
                        continue
                    if url in seen_urls:
                        continue
                    seen_urls.add(url)
                    links.append(url)
                    if len(links) >= MAX_LINKS_PER_QUERY:
                        break
                for url in links:
                    if not _robots_allowed(base_url, url, robots_cache):
                        stats["ROBOTS_DISALLOWED"] += 1
                        continue
                    row = _article_row(session, source, url)
                    if row:
                        rows.append(row)
                        stats[f"SOURCE:{source}"] += 1
                    else:
                        stats["INVALID_ARTICLE_METADATA"] += 1
                    time.sleep(0.15)
    return rows, stats


def _existing_target_rows() -> tuple[list[dict[str, str]], Counter]:
    rows: list[dict[str, str]] = []
    stats = Counter()
    for file_name in INPUT_FILES:
        frame = _read(RAW_DATA_DIR / file_name)
        stats["EXISTING_SCANNED"] += len(frame)
        for record in frame.to_dict("records"):
            groups = news_target_group_value(f"{record['title']} {record['content']}")
            if groups:
                record["targetKeywordGroup"] = groups
                rows.append(record)
                stats[f"SOURCE:{record['source']}"] += 1
    return rows, stats


def _deduplicate(rows: list[dict[str, str]]) -> tuple[list[dict[str, str]], int]:
    public_titles, public_contents = _public_api_keys()
    result = []
    seen_urls: set[str] = set()
    seen_titles: set[str] = set()
    seen_contents: set[str] = set()
    rejected = 0
    for row in rows:
        url = row.get("url", "").strip()
        title = _normalized(row.get("title", ""))
        content = _normalized(row.get("content", ""))
        if (
            not url or not title or not content
            or url in seen_urls or title in seen_titles or content in seen_contents
            or title in public_titles or content in public_contents
        ):
            rejected += 1
            continue
        seen_urls.add(url)
        seen_titles.add(title)
        seen_contents.add(content)
        result.append(row)
    return result, rejected


def main() -> None:
    existing, existing_stats = _existing_target_rows()
    searched, search_stats = _search_news()
    candidates, duplicate_count = _deduplicate([*searched, *existing])
    eligible, excluded_year, excluded_relevance = split_eligible_rows(candidates)
    write_rows(eligible, RAW_DATA_DIR / "targeted_accessibility_news.csv")
    write_excluded(excluded_year, "excluded_by_year", "targeted_accessibility_news.csv")
    write_excluded(excluded_relevance, "excluded_by_relevance", "targeted_accessibility_news.csv")

    group_counts = Counter()
    source_counts = Counter()
    for row in eligible:
        source_counts[row["source"]] += 1
        group_counts.update(filter(None, row["targetKeywordGroup"].split("|")))

    print("\n타깃 뉴스/RSS/기관자료 보강 결과")
    print(f"  기존 자료 조회: {existing_stats['EXISTING_SCANNED']}건")
    print(f"  검색 페이지 조회: {search_stats['SEARCH_PAGES']}건")
    print(f"  실제 후보 문서: {len(existing) + len(searched)}건")
    print(f"  최종 추가 후보: {len(eligible)}건")
    print(f"  중복/공공 API 중복 제외: {duplicate_count}건")
    print(f"  연도/날짜 제외: {len(excluded_year)}건")
    print(f"  관련성/내용 제외: {len(excluded_relevance)}건")
    print(f"  출처별 추가 후보: {dict(source_counts)}")
    print(f"  targetKeywordGroup별 추가 후보: {dict(group_counts)}")
    print(f"  검색 실패 통계: {dict(search_stats)}")
    if not group_counts["DEAFBLIND_TARGET"]:
        print("  DEAFBLIND_TARGET: 원문 URL·게시일·내용 기준을 충족한 실제 자료를 찾지 못했습니다.")


if __name__ == "__main__":
    main()
