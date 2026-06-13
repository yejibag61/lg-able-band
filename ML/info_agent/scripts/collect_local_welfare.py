"""Collect local-government welfare services from a configured public API."""

from collector_utils import RAW_DATA_DIR
from env_utils import LOCAL_WELFARE_API_URL, get_service_key
from welfare_api import collect_welfare_api


# TODO: Adjust these constants if data.go.kr changes the selected API operation.
LIST_OPERATION = "LcgvWelfarelist"
DETAIL_OPERATION = "LcgvWelfaredetailed"
TARGET_MAX_ITEMS = 5000
NUM_OF_ROWS = 100
DETAIL_LOOKUP_LIMIT = 200
REQUEST_SLEEP_SECONDS = 0.1
SERVICE_KEY_PARAM = "serviceKey"
PAGE_PARAM = "pageNo"
ROWS_PARAM = "numOfRows"
RESPONSE_TYPE_PARAM = ""
RESPONSE_TYPE_VALUE = ""
EXTRA_PARAMS = {"callTp": "L"}


def _list_url(api_url: str) -> str:
    stripped = api_url.rstrip("/")
    return stripped if stripped.endswith(LIST_OPERATION) else f"{stripped}/{LIST_OPERATION}"


def _detail_url(api_url: str) -> str:
    stripped = api_url.rstrip("/")
    if stripped.endswith(LIST_OPERATION):
        stripped = stripped[: -len(LIST_OPERATION)].rstrip("/")
    return stripped if stripped.endswith(DETAIL_OPERATION) else f"{stripped}/{DETAIL_OPERATION}"


def main() -> None:
    collect_welfare_api(
        api_url=_list_url(LOCAL_WELFARE_API_URL) if LOCAL_WELFARE_API_URL else "",
        detail_url=_detail_url(LOCAL_WELFARE_API_URL) if LOCAL_WELFARE_API_URL else "",
        service_key=get_service_key("DATA_GO_KR_SERVICE_KEY"),
        source="공공데이터포털 지자체복지서비스",
        output_path=RAW_DATA_DIR / "local_welfare.csv",
        service_key_param=SERVICE_KEY_PARAM,
        page_param=PAGE_PARAM,
        rows_param=ROWS_PARAM,
        response_type_param=RESPONSE_TYPE_PARAM,
        response_type_value=RESPONSE_TYPE_VALUE,
        target_max_items=TARGET_MAX_ITEMS,
        row_count=NUM_OF_ROWS,
        detail_lookup_limit=DETAIL_LOOKUP_LIMIT,
        request_sleep_seconds=REQUEST_SLEEP_SECONDS,
        extra_params=EXTRA_PARAMS,
        actionable_score_bonus=8,
    )


if __name__ == "__main__":
    main()
