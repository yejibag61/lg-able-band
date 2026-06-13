"""Collect actionable KODDI report API or bundled file metadata."""

from collector_utils import INFO_AGENT_DIR, RAW_DATA_DIR
from env_utils import KODDI_REPORT_API_URL, get_service_key
from structured_source_collector import collect_structured_file, collect_structured_source


LOCAL_REPORT_FILE = INFO_AGENT_DIR / "data" / "source_files" / "koddi_reports_20250930.csv"


def main() -> None:
    output_path = RAW_DATA_DIR / "koddi_report_api.csv"
    if KODDI_REPORT_API_URL:
        collect_structured_source(
            source="한국장애인개발원 연구보고서",
            api_url=KODDI_REPORT_API_URL,
            service_key=get_service_key("KODDI_REPORT_SERVICE_KEY"),
            output_path=output_path,
            source_type="FILE_DATA",
        )
    else:
        collect_structured_file(
            source="한국장애인개발원 연구보고서",
            file_path=LOCAL_REPORT_FILE,
            output_path=output_path,
        )


if __name__ == "__main__":
    main()
