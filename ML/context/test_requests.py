"""Send representative backend events to the running AI judgment server."""

import json
import os

import requests


PORT = os.environ.get("ML_PORT", "8000")
API_URL = os.environ.get("ML_JUDGMENT_URL", f"http://127.0.0.1:{PORT}/api/ai/judge-event")

TEST_EVENTS = [
    {
        "userId": 1,
        "accessibilityType": "HEARING",
        "deviceType": "WASHER",
        "eventType": "COMPLETE",
        "location": "세탁실",
        "value": "세탁 완료",
        "durationSec": 0,
        "userResponse": "NONE",
    },
    {
        "userId": 1,
        "accessibilityType": "VISUAL",
        "deviceType": "TV",
        "eventType": "EMERGENCY_POPUP",
        "location": "거실",
        "value": "긴급 도움 요청 팝업",
        "durationSec": 0,
        "userResponse": "NONE",
    },
    {
        "userId": 1,
        "accessibilityType": "VISUAL",
        "deviceType": "RANGE",
        "eventType": "LONG_ON",
        "location": "주방",
        "value": "전기레인지 장시간 사용",
        "durationSec": 600,
        "userResponse": "NONE",
    },
    {
        "userId": 1,
        "accessibilityType": "VISUAL",
        "deviceType": "DOOR_SENSOR",
        "eventType": "LONG_OPEN",
        "location": "현관",
        "value": "문 장시간 열림",
        "durationSec": 600,
        "userResponse": "NO_RESPONSE",
    },
    {
        "userId": 1,
        "accessibilityType": "HEARING",
        "deviceType": "AIR_SENSOR",
        "eventType": "CO2_HIGH",
        "location": "거실",
        "value": "이산화탄소 농도 높음",
        "durationSec": 0,
        "userResponse": "NONE",
        "sensorValue": 1300,
        "unit": "ppm",
    },
    {
        "userId": 1,
        "accessibilityType": "HEARING",
        "deviceType": "REFRIGERATOR",
        "eventType": "TEMP_ABNORMAL",
        "location": "주방",
        "value": "냉장고 온도 이상",
        "durationSec": 120,
        "userResponse": "NONE",
    },
]


def main() -> None:
    for event in TEST_EVENTS:
        print(f"\n[{event['deviceType']} / {event['eventType']}]")
        try:
            response = requests.post(API_URL, json=event, timeout=5)
            response.raise_for_status()
            print(json.dumps(response.json(), ensure_ascii=False, indent=2))
        except requests.RequestException as exc:
            print(f"Request failed: {exc}")


if __name__ == "__main__":
    main()
