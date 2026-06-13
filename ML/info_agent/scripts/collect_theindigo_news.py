"""Collect actionable The Indigo RSS metadata."""

from collector_utils import RAW_DATA_DIR
from rss_collector import collect_rss_feeds


DEFAULT_RSS_URLS = ["https://theindigo.co.kr/feed"]
DEFAULT_LIST_URLS = ["https://theindigo.co.kr/"]


def main() -> None:
    collect_rss_feeds("더인디고", DEFAULT_RSS_URLS, RAW_DATA_DIR / "theindigo_news.csv")


if __name__ == "__main__":
    main()
