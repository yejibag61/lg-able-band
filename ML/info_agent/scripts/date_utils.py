"""Parse source publication dates without inventing missing dates."""

import re
from datetime import datetime
from email.utils import parsedate_to_datetime
from typing import Any


DATE_FORMATS = (
    "%Y-%m-%d", "%Y.%m.%d", "%Y/%m/%d", "%Y%m%d",
    "%Y-%m-%d %H:%M:%S", "%Y.%m.%d %H:%M:%S", "%Y/%m/%d %H:%M:%S", "%Y%m%d%H%M%S",
    "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%SZ",
    "%Y년 %m월 %d일",
)


def parse_publication_date(value: Any) -> tuple[str, str]:
    text = str(value or "").strip()
    if not text:
        return "", ""
    if re.fullmatch(r"(19|20)\d{2}", text):
        return text, text
    for parser in (_parse_known_formats, _parse_rfc822):
        parsed = parser(text)
        if parsed:
            return parsed.strftime("%Y-%m-%d"), str(parsed.year)
    match = re.search(r"((?:19|20)\d{2})[.\-/년]\s*(\d{1,2})[.\-/월]\s*(\d{1,2})", text)
    if match:
        try:
            parsed = datetime(int(match.group(1)), int(match.group(2)), int(match.group(3)))
            return parsed.strftime("%Y-%m-%d"), str(parsed.year)
        except ValueError:
            pass
    return "", ""


def _parse_known_formats(text: str) -> datetime | None:
    for date_format in DATE_FORMATS:
        try:
            return datetime.strptime(text, date_format)
        except ValueError:
            continue
    return None


def _parse_rfc822(text: str) -> datetime | None:
    try:
        return parsedate_to_datetime(text)
    except (TypeError, ValueError, OverflowError):
        return None
