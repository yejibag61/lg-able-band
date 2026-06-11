"""Intent rules for the LG Able Band user voice chatbot.

Rules are based on:

    device or sensor keyword + question or request pattern -> intent
"""

from dataclasses import dataclass
from typing import Dict, List, Optional


DEVICE_KEYWORDS: Dict[str, List[str]] = {
    "WASHER": ["세탁기", "빨래", "세탁물"],
    "REFRIGERATOR": ["냉장고", "냉장실", "냉동실"],
    "AIR_SENSOR": ["공기", "공기질", "미세먼지", "환기", "이산화탄소", "온도", "습도"],
    "TV": ["tv", "티비", "화면", "팝업"],
    "RANGE": ["인덕션", "가스레인지", "불", "화구", "주방"],
    "DOOR_SENSOR": ["문", "현관문", "도어"],
    "ALERT": ["알림", "알람"],
    "GUARDIAN": ["보호자", "엄마", "아빠", "가족"],
}


PATTERN_KEYWORDS: Dict[str, List[str]] = {
    "TIME_LEFT": ["몇 분", "남았어", "얼마나", "언제 끝나", "다 됐어"],
    "UNREAD": ["미확인", "안 읽은", "새"],
    "DANGER": ["위험", "긴급", "위험한"],
    "RECENT": ["최근", "마지막", "읽어줘"],
    "REPEAT": ["다시", "방금", "못 들었어", "한번 더"],
    "NOTIFY": ["알려줘", "연락", "전화", "보내줘"],
    "DOOR_OPEN": ["열려", "닫혀", "문"],
    "POWER": ["켜져", "꺼져", "전원", "불"],
    "STATUS": ["상태", "어때", "괜찮아", "문제", "확인"],
    "ALERT": ["알림", "알람", "뭐 왔어", "있어"],
    "HELP": ["도움말", "뭐 할 수", "사용법", "기능"],
}


INTENT_MAP: Dict[tuple[str, str], str] = {
    ("WASHER", "TIME_LEFT"): "WASHER_TIME_CHECK",
    ("WASHER", "STATUS"): "WASHER_STATUS_CHECK",
    ("WASHER", "ALERT"): "WASHER_ALERT_CHECK",
    ("REFRIGERATOR", "DOOR_OPEN"): "REFRIGERATOR_DOOR_CHECK",
    ("REFRIGERATOR", "STATUS"): "REFRIGERATOR_STATUS_CHECK",
    ("REFRIGERATOR", "ALERT"): "REFRIGERATOR_ALERT_CHECK",
    ("AIR_SENSOR", "STATUS"): "AIR_QUALITY_CHECK",
    ("AIR_SENSOR", "DANGER"): "AIR_QUALITY_CHECK",
    ("TV", "ALERT"): "TV_ALERT_CHECK",
    ("TV", "RECENT"): "TV_ALERT_CHECK",
    ("RANGE", "POWER"): "RANGE_POWER_CHECK",
    ("RANGE", "DANGER"): "RANGE_DANGER_CHECK",
    ("RANGE", "STATUS"): "RANGE_POWER_CHECK",
    ("DOOR_SENSOR", "DOOR_OPEN"): "DOOR_OPEN_CHECK",
    ("DOOR_SENSOR", "STATUS"): "DOOR_OPEN_CHECK",
    ("DOOR_SENSOR", "DANGER"): "DOOR_SECURITY_CHECK",
    ("ALERT", "UNREAD"): "UNREAD_ALERTS_CHECK",
    ("ALERT", "DANGER"): "DANGER_ALERTS_CHECK",
    ("ALERT", "RECENT"): "READ_RECENT_ALERT",
    ("ALERT", "REPEAT"): "REPEAT_LAST_ALERT",
    ("GUARDIAN", "NOTIFY"): "NOTIFY_GUARDIAN",
}


GLOBAL_INTENTS: Dict[str, str] = {
    "HELP": "HELP",
    "REPEAT": "REPEAT_LAST_ALERT",
    "RECENT": "READ_RECENT_ALERT",
    "UNREAD": "UNREAD_ALERTS_CHECK",
    "DANGER": "DANGER_ALERTS_CHECK",
}


@dataclass(frozen=True)
class IntentMatch:
    intent: str
    device: Optional[str]
    pattern: Optional[str]
    confidence: float


def normalize(text: str) -> str:
    return text.strip().lower()


def find_first_match(text: str, rules: Dict[str, List[str]]) -> Optional[str]:
    normalized = normalize(text)
    for name, keywords in rules.items():
        if any(keyword.lower() in normalized for keyword in keywords):
            return name
    return None


def detect_device(text: str) -> Optional[str]:
    return find_first_match(text, DEVICE_KEYWORDS)


def detect_pattern(text: str) -> Optional[str]:
    return find_first_match(text, PATTERN_KEYWORDS)


def detect_intent(text: str, intent_hint: Optional[str] = None) -> IntentMatch:
    hinted = normalize(intent_hint or "").replace("-", "_")
    if hinted:
        return IntentMatch(hinted.upper(), None, None, 1.0)

    if not normalize(text):
        return IntentMatch("EMPTY", None, None, 0.4)

    device = detect_device(text)
    pattern = detect_pattern(text)

    if device and pattern:
        intent = INTENT_MAP.get((device, pattern))
        if intent:
            return IntentMatch(intent, device, pattern, 0.9)

    if pattern and pattern in GLOBAL_INTENTS:
        return IntentMatch(GLOBAL_INTENTS[pattern], device, pattern, 0.72)

    if device:
        return IntentMatch("DEVICE_STATUS_CHECK", device, pattern, 0.6)

    return IntentMatch("UNKNOWN", None, pattern, 0.45)
