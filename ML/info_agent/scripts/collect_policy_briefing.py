"""Collect actionable official policy briefing RSS metadata."""

from collector_utils import RAW_DATA_DIR
from rss_collector import collect_rss_feeds


DEFAULT_RSS_URLS = [
    "https://www.korea.kr/rss/dept_mw.xml",
    "https://www.korea.kr/rss/dept_moel.xml",
    "https://www.korea.kr/rss/dept_mois.xml",
    "https://www.korea.kr/rss/dept_nfa.xml",
]


def main() -> None:
    collect_rss_feeds("정책브리핑", DEFAULT_RSS_URLS, RAW_DATA_DIR / "policy_briefing.csv")


if __name__ == "__main__":
    main()
