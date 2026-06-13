"""Collect actionable KPF news metadata without article full text."""

from collector_utils import RAW_DATA_DIR
from env_utils import KPF_NEWS_METADATA_API_URL, get_service_key
from structured_source_collector import collect_structured_source


def main() -> None:
    collect_structured_source(
        source="한국언론진흥재단 뉴스메타데이터",
        api_url=KPF_NEWS_METADATA_API_URL,
        service_key=get_service_key("KPF_NEWS_METADATA_SERVICE_KEY"),
        output_path=RAW_DATA_DIR / "kpf_news_metadata.csv",
        source_type="FILE_DATA",
    )


if __name__ == "__main__":
    main()
