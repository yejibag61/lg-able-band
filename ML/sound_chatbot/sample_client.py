import json

import requests


BASE_URL = "http://127.0.0.1:8002"


def make_context():
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
            "tv": {"hasPopup": False},
            "range": {"powerOn": True, "longOn": True},
            "doorSensor": {"doorOpen": False, "securityEvent": False},
        },
    }


def ask(text):
    payload = {
        "sessionId": "local-demo",
        "text": text,
        "language": "ko-KR",
        "user": {
            "userId": 1,
            "name": "민수",
            "accessibilityType": "VISUAL",
            "guardianLinked": True,
        },
        "context": make_context(),
    }
    response = requests.post(f"{BASE_URL}/api/ai/voice-chat", json=payload, timeout=3)
    response.raise_for_status()
    return response.json()


def main():
    print("LG Able Band sound chatbot sample client")
    print("Type a sentence, for example: 세탁기 몇 분 남았어?")
    print("Type q to exit.\n")

    while True:
        text = input("user> ").strip()
        if text.lower() in {"q", "quit", "exit"}:
            break
        if not text:
            continue

        data = ask(text)
        print(json.dumps(data, ensure_ascii=False, indent=2))
        print(f"voiceText> {data['voiceText']}\n")


if __name__ == "__main__":
    main()
