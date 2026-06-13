"""Simple integration requests for a running info-agent server."""

import os
import sys

import requests


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE_URL = os.environ.get("INFO_AGENT_BASE_URL", "http://127.0.0.1:8010")
TEST_CASES = [
    ("폭염 때 장애인은 어떻게 해야 해?", None),
    ("청각장애인 보조기기 지원사업 있어?", "HEARING_IMPAIRED"),
    ("장애인 활동지원 알려줘", None),
    ("장애인 취업 지원 알려줘", None),
    ("시각장애인 이동 안전 정보 알려줘", "VISUAL_IMPAIRED"),
]


def main() -> None:
    for query, accessibility_type in TEST_CASES:
        response = requests.post(
            f"{BASE_URL}/api/ai/info-agent/query",
            json={
                "query": query,
                "accessibilityType": accessibility_type,
                "interests": [],
                "guardianConnected": True,
            },
            timeout=10,
        )
        response.raise_for_status()
        result = response.json()
        card = result["cards"][0]
        actions = result["agentActions"]
        print(f"\nquery: {query}")
        print(f"accessibilityType: {accessibility_type or 'GENERAL'}")
        print(f"spokenText: {result['spokenText']}")
        print(f"cards[0].title: {card['title']}")
        print(f"cards[0].category: {card['category']}")
        print(f"cards[0].priority: {card['priority']}")
        print(f"agentActions.notifyBand: {actions['notifyBand']}")
        print(f"agentActions.bandMessage: {actions['bandMessage']}")
        print(f"agentActions.vibrationPattern: {actions['vibrationPattern']}")


if __name__ == "__main__":
    main()
