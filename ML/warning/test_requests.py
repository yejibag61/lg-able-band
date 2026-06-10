"""Send dummy events to the running warning recommendation AI server."""

import json
import os
from pathlib import Path
import subprocess
import sys
import time
from typing import Optional

import requests


PORT = os.environ.get("WARNING_PORT", "8001")
API_URL = os.environ.get(
    "WARNING_API_URL",
    f"http://127.0.0.1:{PORT}/api/ai/recommend-warning",
)
HEALTH_URL = os.environ.get("WARNING_HEALTH_URL", f"http://127.0.0.1:{PORT}/health")

TEST_CASES = [
    {
        "name": "청각장애 사용자 고위험 무응답",
        "request": {
            "userId": 1,
            "accessibilityType": "HEARING",
            "category": "DANGER",
            "riskLevel": "HIGH",
            "riskScore": 85,
            "deviceType": "RANGE",
            "eventType": "LONG_ON",
            "location": "주방",
            "userResponse": "NO_RESPONSE",
        },
        "expected": {
            "vibrationPattern": "STRONG_REPEAT",
            "screenMode": "HIGH_CONTRAST_LARGE_TEXT",
            "voiceEnabled": False,
            "notifyGuardian": True,
            "escalationRequired": True,
        },
    },
    {
        "name": "시각장애 사용자 생활 알림",
        "request": {
            "userId": 2,
            "accessibilityType": "VISUAL",
            "category": "LIFE",
            "riskLevel": "LOW",
            "riskScore": 20,
            "deviceType": "WASHER",
            "eventType": "COMPLETE",
            "location": "세탁실",
            "userResponse": "RESPONDED",
        },
        "expected": {
            "vibrationPattern": "BASIC_SHORT",
            "screenMode": "SIMPLE_TEXT",
            "voiceEnabled": True,
            "notifyGuardian": False,
            "escalationRequired": False,
        },
    },
    {
        "name": "시청각장애 사용자 주의 알림",
        "request": {
            "userId": 3,
            "accessibilityType": "DEAF_BLIND",
            "category": "DANGER",
            "riskLevel": "MEDIUM",
            "riskScore": 55,
            "deviceType": "AIR_SENSOR",
            "eventType": "CO2_HIGH",
            "location": "거실",
            "userResponse": "UNKNOWN",
        },
        "expected": {
            "vibrationPattern": "BASIC_REPEAT",
            "screenMode": "HIGH_CONTRAST_LARGE_TEXT",
            "voiceEnabled": False,
            "notifyGuardian": True,
            "escalationRequired": False,
        },
    },
    {
        "name": "긴급 상황",
        "request": {
            "userId": 4,
            "accessibilityType": "NONE",
            "category": "EMERGENCY",
            "riskLevel": "CRITICAL",
            "riskScore": 98,
            "deviceType": "DOOR_SENSOR",
            "eventType": "OUTING_OPEN",
            "location": "현관",
            "userResponse": "NO_RESPONSE",
        },
        "expected": {
            "vibrationPattern": "SOS_REPEAT",
            "screenMode": "EMERGENCY_FULL_SCREEN",
            "voiceEnabled": False,
            "notifyGuardian": True,
            "escalationRequired": True,
        },
    },
    {
        "name": "UWB 위치 안내",
        "request": {
            "userId": 5,
            "accessibilityType": "VISUAL",
            "category": "LOCATION",
            "riskLevel": "MEDIUM",
            "riskScore": 40,
            "deviceType": "UWB_TAG",
            "eventType": "TARGET_NEARBY",
            "location": "거실",
            "userResponse": "RESPONDED",
        },
        "expected": {
            "vibrationPattern": "BASIC_REPEAT",
            "screenMode": "SIMPLE_TEXT",
            "voiceEnabled": True,
            "notifyGuardian": False,
            "escalationRequired": False,
        },
    },
    {
        "name": "필드가 없는 기본 요청",
        "request": {},
        "expected": {
            "vibrationPattern": "BASIC_SHORT",
            "screenMode": "LARGE_TEXT",
            "voiceEnabled": False,
            "notifyGuardian": False,
            "escalationRequired": False,
        },
    },
]


def matches_expected(result: dict, expected: dict) -> bool:
    return all(result.get(key) == value for key, value in expected.items())


def server_is_running() -> bool:
    try:
        response = requests.get(HEALTH_URL, timeout=1)
        return response.ok
    except requests.RequestException:
        return False


def start_local_server() -> Optional[subprocess.Popen]:
    if server_is_running():
        print(f"[서버 확인] 이미 실행 중입니다: {HEALTH_URL}")
        return None

    if "127.0.0.1" not in HEALTH_URL and "localhost" not in HEALTH_URL:
        print(f"[FAIL] 원격 warning 서버에 연결할 수 없습니다: {HEALTH_URL}")
        return None

    server_path = Path(__file__).with_name("server.py")
    env = os.environ.copy()
    env["WARNING_PORT"] = PORT
    print(f"[서버 시작] 테스트용 warning 서버를 자동 실행합니다: {HEALTH_URL}")
    process = subprocess.Popen(
        [sys.executable, str(server_path)],
        cwd=server_path.parent,
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    for _ in range(30):
        if server_is_running():
            print("[서버 준비 완료]")
            return process
        if process.poll() is not None:
            break
        time.sleep(0.2)

    process.terminate()
    print("[FAIL] warning 서버를 자동 실행하지 못했습니다.")
    return None


def main() -> None:
    started_server = start_local_server()
    if not server_is_running():
        print("직접 실행: python ML/warning/server.py")
        sys.exit(1)

    passed = 0

    try:
        for index, case in enumerate(TEST_CASES, 1):
            print(f"\n=== {index}. {case['name']} ===")
            print("[요청]")
            print(json.dumps(case["request"], ensure_ascii=False, indent=2))

            try:
                response = requests.post(API_URL, json=case["request"], timeout=5)
                response.raise_for_status()
                result = response.json()
            except requests.RequestException as exc:
                print(f"[FAIL] 요청 실패: {exc}")
                continue

            print("[응답]")
            print(json.dumps(result, ensure_ascii=False, indent=2))

            if matches_expected(result, case["expected"]):
                passed += 1
                print("[PASS] 예상 결과와 일치합니다.")
            else:
                print("[FAIL] 예상 결과와 다릅니다.")
                print("[예상 핵심값]")
                print(json.dumps(case["expected"], ensure_ascii=False, indent=2))

        print(f"\n테스트 결과: {passed}/{len(TEST_CASES)} PASS")
        if passed != len(TEST_CASES):
            sys.exit(1)
    finally:
        if started_server is not None:
            started_server.terminate()
            try:
                started_server.wait(timeout=5)
            except subprocess.TimeoutExpired:
                started_server.kill()
            print("[서버 종료] 자동 실행한 테스트 서버를 종료했습니다.")


if __name__ == "__main__":
    main()
