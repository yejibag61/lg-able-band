import json
import subprocess
import sys
import time
from pathlib import Path

import requests


BASE_URL = "http://127.0.0.1:8002"


def wait_until_ready(timeout_sec=8):
    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        try:
            response = requests.get(f"{BASE_URL}/health", timeout=1)
            if response.status_code == 200:
                return True
        except requests.RequestException:
            time.sleep(0.2)
    return False


def run_case(name, payload, expected_intent):
    response = requests.post(f"{BASE_URL}/api/ai/voice-chat", json=payload, timeout=3)
    data = response.json()
    passed = response.status_code == 200 and data["intent"] == expected_intent
    print(f"\n[{name}] {'PASS' if passed else 'FAIL'}")
    print(json.dumps(data, ensure_ascii=False, indent=2))
    return passed


def sample_context():
    return {
        "unreadAlerts": [
            {
                "id": 101,
                "deviceType": "WASHER",
                "title": "세탁 완료",
                "message": "세탁이 완료되었습니다.",
                "severity": "LOW",
            }
        ],
        "dangerAlerts": [
            {
                "id": 201,
                "deviceType": "RANGE",
                "title": "주방 위험 알림",
                "message": "인덕션이 오래 켜져 있습니다.",
                "severity": "HIGH",
            }
        ],
        "recentAlert": {
            "id": 101,
            "deviceType": "WASHER",
            "title": "세탁 완료",
            "message": "세탁이 완료되었습니다.",
        },
        "lastSpokenAlert": {
            "id": 102,
            "deviceType": "REFRIGERATOR",
            "title": "냉장고 문 열림",
            "message": "냉장고 문이 열려 있습니다.",
        },
        "devices": {
            "washer": {"status": "RUNNING", "remainingMinutes": 12},
            "refrigerator": {"doorOpen": True, "temperatureStatus": "NORMAL"},
            "airSensor": {"airQuality": "GOOD", "ventilationNeeded": False},
            "tv": {"hasPopup": True, "popupMessage": "TV에 긴급 안내가 표시되어 있습니다."},
            "range": {"powerOn": True, "longOn": True},
            "doorSensor": {"doorOpen": False, "securityEvent": False},
        },
    }


def main():
    server_process = None
    if not wait_until_ready(timeout_sec=1):
        server_path = Path(__file__).with_name("server.py")
        server_process = subprocess.Popen([sys.executable, str(server_path)])
        if not wait_until_ready():
            print("Server did not start.")
            return 1

    context = sample_context()
    cases = [
        ("unread_alerts", {"text": "미확인 알림 있어?", "context": context}, "UNREAD_ALERTS_CHECK"),
        ("danger_alerts", {"text": "위험 알림 있어?", "context": context}, "DANGER_ALERTS_CHECK"),
        ("recent_alert", {"text": "최근 알림 읽어줘", "context": context}, "READ_RECENT_ALERT"),
        ("repeat_alert", {"text": "방금 알림 다시 말해줘", "context": context}, "REPEAT_LAST_ALERT"),
        ("washer_time", {"text": "세탁기 몇 분 남았어?", "context": context}, "WASHER_TIME_CHECK"),
        ("refrigerator_door", {"text": "냉장고 문 열려 있어?", "context": context}, "REFRIGERATOR_DOOR_CHECK"),
        ("air_quality", {"text": "공기질 괜찮아?", "context": context}, "AIR_QUALITY_CHECK"),
        ("range_power", {"text": "인덕션 켜져 있어?", "context": context}, "RANGE_POWER_CHECK"),
        ("door_open", {"text": "현관문 열려 있어?", "context": context}, "DOOR_OPEN_CHECK"),
        ("guardian", {"text": "보호자한테 알려줘", "user": {"guardianLinked": True}}, "NOTIFY_GUARDIAN"),
    ]

    passed = sum(run_case(*case) for case in cases)
    print(f"\nResult: {passed}/{len(cases)} PASS")

    if server_process:
        server_process.terminate()
        server_process.wait(timeout=3)

    return 0 if passed == len(cases) else 1


if __name__ == "__main__":
    raise SystemExit(main())
