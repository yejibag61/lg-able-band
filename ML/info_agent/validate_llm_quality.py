"""Validate selective LLM eligibility against the current Info Agent dataset."""

from __future__ import annotations

import json
import os
from typing import Any

try:
    from . import response_builder
    from .eval_info_agent_quality import route_question
    from .info_agent import run_info_agent
    from .llm_client import clear_llm_cache
except ImportError:
    import response_builder
    from eval_info_agent_quality import route_question
    from info_agent import run_info_agent
    from llm_client import clear_llm_cache


EXPECTED_LLM = (
    "보청기 지원 받을 수 있어?",
    "시각장애인 이동 지원 알려줘",
    "장애인 보조기기 신청 방법 알려줘",
    "폭염 때 장애인은 어떻게 대비해야 해?",
)
EXPECTED_SOUND = (
    "최근 알림 알려줘",
    "세탁기 상태 알려줘",
    "보호자한테 연락해줘",
    "도와줘",
    "안녕",
    "SOS 요청해줘",
    "위험 알림 보내줘",
)
SAMPLE_LLM_RESPONSE = {
    "answer": "검색 문서를 바탕으로 안내합니다. 정확한 신청 가능 여부는 공식 기관에서 확인해야 합니다.",
    "shortVoiceAnswer": "정확한 내용은 공식 기관에서 확인해 주세요.",
    "cardTitle": "지원 안내",
    "keyPoints": ["공식 기관 확인"],
    "disclaimer": "정확한 신청 가능 여부는 공식 기관에서 확인해야 합니다.",
}


def _record(question: str, calls: list[str], response: dict[str, Any]) -> dict[str, Any]:
    meta = response.get("meta", {})
    debug = meta.get("debug", {})
    return {
        "question": question,
        "llmCallCount": len(calls),
        "llmUsed": meta.get("llmUsed"),
        "llmFallback": meta.get("llmFallback"),
        "llmFallbackReason": meta.get("llmFallbackReason"),
        "llmCacheHit": meta.get("llmCacheHit"),
        "predictedCategory": meta.get("predictedCategory"),
        "predictedPriority": meta.get("predictedPriority"),
        "topDocCount": meta.get("topDocCount"),
        "topDocScore": meta.get("topDocScore"),
        "searchFallbackUsed": debug.get("fallbackUsed"),
        "extractedFieldNames": sorted(meta.get("extractedFields", {})),
    }


def main() -> int:
    os.environ["INFO_AGENT_LLM_ENABLED"] = "true"
    os.environ["OPENAI_API_KEY"] = "quality-validation-key"
    output: dict[str, Any] = {
        "expectedLlm": [],
        "expectedSound": [],
        "cacheVerification": {},
    }

    for question in EXPECTED_LLM:
        clear_llm_cache()
        calls: list[str] = []

        def fake_call(prompt: str, _config: dict[str, Any]) -> tuple[dict[str, Any], None]:
            calls.append(prompt)
            return SAMPLE_LLM_RESPONSE, None

        response_builder.call_llm = fake_call
        output["expectedLlm"].append(_record(question, calls, run_info_agent(question)))

    for question in EXPECTED_SOUND:
        output["expectedSound"].append(
            {"question": question, "actualAgent": route_question(question)}
        )

    cache_question = EXPECTED_LLM[0]
    clear_llm_cache()
    cache_calls: list[str] = []

    def cache_call(prompt: str, _config: dict[str, Any]) -> tuple[dict[str, Any], None]:
        cache_calls.append(prompt)
        return SAMPLE_LLM_RESPONSE, None

    response_builder.call_llm = cache_call
    first = run_info_agent(cache_question)
    second = run_info_agent(cache_question)
    output["cacheVerification"] = {
        "question": cache_question,
        "apiCallCount": len(cache_calls),
        "first": {
            "llmUsed": first["meta"].get("llmUsed"),
            "llmCacheHit": first["meta"].get("llmCacheHit"),
        },
        "second": {
            "llmUsed": second["meta"].get("llmUsed"),
            "llmCacheHit": second["meta"].get("llmCacheHit"),
        },
    }

    print(json.dumps(output, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
