"""Run the offline Bokjiro detailed-service collector.

From the repository root:
    python ML/info_agent/scripts/collect_bokjiro.py

From ML/info_agent:
    python scripts/collect_bokjiro.py
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

from dotenv import load_dotenv


INFO_AGENT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(INFO_AGENT_DIR))

from collectors.bokjiro_collector import collect_bokjiro  # noqa: E402


def main() -> int:
    load_dotenv(INFO_AGENT_DIR / ".env")
    service_key = (
        os.getenv("DATA_GO_KR_SERVICE_KEY", "").strip()
        or os.getenv("BOKJIRO_SERVICE_KEY", "").strip()
    )
    base_url = (
        os.getenv("BOKJIRO_API_URL", "").strip()
        or os.getenv("PUBLIC_WELFARE_API_URL", "").strip()
    )
    if not service_key:
        print("복지로 수집을 건너뜁니다: DATA_GO_KR_SERVICE_KEY 또는 BOKJIRO_SERVICE_KEY가 필요합니다.")
        return 0
    if not base_url:
        print("복지로 수집을 건너뜁니다: BOKJIRO_API_URL 또는 PUBLIC_WELFARE_API_URL이 필요합니다.")
        return 0
    try:
        documents = collect_bokjiro(
            base_url=base_url,
            service_key=service_key,
            output_path=INFO_AGENT_DIR / "data" / "bokjiro_documents.csv",
            max_detail_requests=max(
                1, min(99, int(os.getenv("BOKJIRO_DAILY_DETAIL_LIMIT", "99")))
            ),
        )
    except Exception as error:
        print(f"복지로 수집 중 오류가 발생했습니다: {type(error).__name__}: {error}")
        return 1
    print(f"복지로 신규 상세 문서 {len(documents)}건을 누적 저장했습니다.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

