"""Environment loading and API credential helpers."""

import os
from pathlib import Path

from dotenv import load_dotenv


INFO_AGENT_DIR = Path(__file__).resolve().parents[1]
load_dotenv(INFO_AGENT_DIR / ".env")

DATA_GO_KR_SERVICE_KEY = os.getenv("DATA_GO_KR_SERVICE_KEY", "").strip()
PUBLIC_WELFARE_API_URL = os.getenv("PUBLIC_WELFARE_API_URL", "").strip()
LOCAL_WELFARE_API_URL = os.getenv("LOCAL_WELFARE_API_URL", "").strip()
KODDI_REPORT_API_URL = os.getenv("KODDI_REPORT_API_URL", "").strip()
KODDI_REPORT_SERVICE_KEY = os.getenv("KODDI_REPORT_SERVICE_KEY", "").strip()
KPF_NEWS_METADATA_API_URL = os.getenv("KPF_NEWS_METADATA_API_URL", "").strip()
KPF_NEWS_METADATA_SERVICE_KEY = os.getenv("KPF_NEWS_METADATA_SERVICE_KEY", "").strip()


def get_service_key(env_key: str) -> str | None:
    return os.getenv(env_key, "").strip() or DATA_GO_KR_SERVICE_KEY or None


def masked(value: str | None) -> str:
    if not value:
        return "(not set)"
    return f"****{value[-4:]}" if len(value) > 4 else "****"
