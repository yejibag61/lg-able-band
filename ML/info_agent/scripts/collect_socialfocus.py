"""Collect actionable Social Focus RSS metadata."""

from collector_utils import RAW_DATA_DIR
from rss_collector import collect_rss_feeds


DEFAULT_RSS_URLS = ["https://www.socialfocus.co.kr/rss/allArticle.xml"]
DEFAULT_LIST_URLS = ["https://www.socialfocus.co.kr/news/articleList.html"]


def main() -> None:
    collect_rss_feeds("소셜포커스", DEFAULT_RSS_URLS, RAW_DATA_DIR / "socialfocus.csv")


if __name__ == "__main__":
    main()
