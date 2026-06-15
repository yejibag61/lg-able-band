"""Evaluate chatbot routing and Info Agent category quality from a CSV dataset."""

from __future__ import annotations

import argparse
import csv
from pathlib import Path
from typing import Any

try:
    from .info_agent import run_info_agent
except ImportError:
    from info_agent import run_info_agent


MODULE_DIR = Path(__file__).resolve().parent
DEFAULT_DATASET = MODULE_DIR / "data" / "chatbot_eval_questions.csv"
SOUND_CHATBOT_KEYWORDS = (
    "알림", "최근 알림", "미확인 알림", "위험 알림", "다시 읽어줘", "방금 알림",
    "세탁기", "냉장고", "공기질", "tv", "티비", "전기레인지", "인덕션", "가스레인지",
    "문 열려", "현관문", "보호자 연락", "보호자에게 연락", "보호자에게 알려줘",
    "보호자한테 알려줘", "sos", "도움 요청",
)
INFO_AGENT_KEYWORDS = (
    "지원", "지원사업", "복지", "복지서비스", "신청", "신청 조건", "보조기기", "보조공학",
    "의료비", "취업", "교육", "이동지원", "교통지원", "수어", "수어통역", "문자통역",
    "청각장애", "시각장애", "시청각장애", "농맹", "폭염", "화재", "재난", "안전", "대피",
    "차별", "신고", "인권위", "권리구제", "활동지원",
)
INFO_AGENT_FOLLOWUP_KEYWORDS = (
    "지원 대상", "대상", "누구", "누가 받을", "받을 수", "신청 조건", "자격 조건",
    "신청", "신청 방법", "이용 방법", "담당 기관", "문의",
    "전화번호", "서류", "필요 서류", "기간", "언제까지", "마감", "자세히", "더 알려줘",
    "지금 어떻게", "어떻게 해야", "안전 행동", "대처",
)


def route_question(question: str, has_info_context: bool = False) -> str:
    normalized = str(question or "").strip().lower()
    if any(keyword in normalized for keyword in SOUND_CHATBOT_KEYWORDS):
        return "SOUND_CHATBOT"
    if any(keyword in normalized for keyword in INFO_AGENT_KEYWORDS):
        return "INFO_AGENT"
    if has_info_context and any(
        keyword in normalized for keyword in INFO_AGENT_FOLLOWUP_KEYWORDS
    ):
        return "INFO_AGENT"
    return "SOUND_CHATBOT"


def load_questions(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as csv_file:
        return list(csv.DictReader(csv_file))


def build_context(row: dict[str, str]) -> dict[str, Any] | None:
    title = row.get("contextTitle", "").strip()
    if not title:
        return None
    return {
        "isFollowup": True,
        "lastInfoAgent": {
            "title": title,
            "category": row.get("contextCategory", "").strip(),
        },
    }


def evaluate_row(row: dict[str, str]) -> dict[str, Any]:
    question = row["question"].strip()
    context = build_context(row)
    expected_agent = row["expectedAgent"].strip()
    expected_category = row.get("expectedCategory", "").strip()
    actual_agent = route_question(question, has_info_context=context is not None)
    actual_category = ""
    debug: dict[str, Any] = {}

    if actual_agent == "INFO_AGENT":
        response = run_info_agent(question, context=context)
        actual_category = str(response.get("classification", {}).get("category", ""))
        debug = response.get("meta", {}).get("debug", {})

    agent_pass = actual_agent == expected_agent
    category_pass = not expected_category or actual_category == expected_category
    return {
        "id": row.get("id", ""),
        "question": question,
        "expectedAgent": expected_agent,
        "actualAgent": actual_agent,
        "expectedCategory": expected_category,
        "actualCategory": actual_category,
        "agentPass": agent_pass,
        "categoryPass": category_pass,
        "passed": agent_pass and category_pass,
        "debug": debug,
    }


def print_result(result: dict[str, Any], show_passes: bool) -> None:
    if result["passed"] and not show_passes:
        return
    status = "PASS" if result["passed"] else "FAIL"
    print(f"[{status}] #{result['id']} {result['question']}")
    print(
        f"  agent: {result['expectedAgent']} -> {result['actualAgent']} | "
        f"category: {result['expectedCategory'] or '-'} -> {result['actualCategory'] or '-'}"
    )
    if not result["passed"] and result["debug"]:
        print(
            "  debug: "
            f"priority={result['debug'].get('predictedPriority', '')}, "
            f"topScore={result['debug'].get('topDocumentScore')}, "
            f"documents={result['debug'].get('retrievedDocumentCount', 0)}, "
            f"fallback={result['debug'].get('fallbackUsed', False)}"
        )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", type=Path, default=DEFAULT_DATASET)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--show-passes", action="store_true")
    args = parser.parse_args()

    rows = load_questions(args.dataset)
    if args.limit > 0:
        rows = rows[: args.limit]
    results = [evaluate_row(row) for row in rows]
    for result in results:
        print_result(result, args.show_passes)

    total = len(results)
    passed = sum(result["passed"] for result in results)
    agent_passed = sum(result["agentPass"] for result in results)
    category_targets = [result for result in results if result["expectedCategory"]]
    category_passed = sum(result["categoryPass"] for result in category_targets)
    print("\n=== Info Agent Quality Evaluation ===")
    print(f"total: {total}")
    print(f"passed: {passed}")
    print(f"failed: {total - passed}")
    print(f"routing accuracy: {agent_passed}/{total} ({agent_passed / total:.1%})")
    if category_targets:
        print(
            "category accuracy: "
            f"{category_passed}/{len(category_targets)} "
            f"({category_passed / len(category_targets):.1%})"
        )
    return 0 if passed == total else 1


if __name__ == "__main__":
    raise SystemExit(main())
