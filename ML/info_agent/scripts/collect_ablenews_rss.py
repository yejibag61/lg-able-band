"""Collect actionable Able News RSS metadata."""

from collector_utils import RAW_DATA_DIR
from rss_collector import collect_rss_feeds


DEFAULT_RSS_URLS = ["https://www.ablenews.co.kr/rss/allArticle.xml"]


def main() -> None:
    collect_rss_feeds("에이블뉴스", DEFAULT_RSS_URLS, RAW_DATA_DIR / "ablenews_rss.csv")


if __name__ == "__main__":
    main()
