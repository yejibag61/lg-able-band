"""Collect actionable Welfare News RSS metadata."""

from collector_utils import RAW_DATA_DIR
from rss_collector import collect_rss_feeds


DEFAULT_RSS_URLS = ["https://www.welfarenews.net/rss/allArticle.xml"]
DEFAULT_LIST_URLS = ["https://www.welfarenews.net/news/articleList.html"]


def main() -> None:
    collect_rss_feeds("웰페어뉴스", DEFAULT_RSS_URLS, RAW_DATA_DIR / "welfarenews.csv")


if __name__ == "__main__":
    main()
