from copy import deepcopy

import pytest

try:
    from . import response_builder as response_builder_module
    from .eval_info_agent_quality import route_question
    from .info_agent import run_info_agent
    from .llm_client import clear_llm_cache
except ImportError:
    import response_builder as response_builder_module
    from eval_info_agent_quality import route_question
    from info_agent import run_info_agent
    from llm_client import clear_llm_cache


LLM_QUESTIONS = {
    "보청기 지원 받을 수 있어?": "보조기기",
    "시각장애인 이동 지원 알려줘": "이동/교통",
    "장애인 보조기기 신청 방법 알려줘": "보조기기",
    "폭염 때 장애인은 어떻게 대비해야 해?": "재난/안전",
}
SOUND_QUESTIONS = (
    "최근 알림 알려줘",
    "세탁기 상태 알려줘",
    "보호자한테 연락해줘",
    "도와줘",
    "안녕",
    "SOS 요청해줘",
    "위험 알림 보내줘",
)
LLM_RESPONSE = {
    "answer": (
        "등록 장애인은 지원 대상이 될 수 있습니다. 주민센터에서 신청 방법을 확인하세요. "
        "정확한 신청 가능 여부는 공식 기관에서 확인해야 합니다."
    ),
    "shortVoiceAnswer": "지원 대상과 신청 방법은 공식 기관에서 확인해 주세요.",
    "cardTitle": "장애인 지원 안내",
    "keyPoints": ["지원 대상 확인", "신청 방법 확인", "문의처 확인"],
    "disclaimer": "정확한 신청 가능 여부는 공식 기관에서 확인해야 합니다.",
}


def rag_result(query: str, category: str) -> dict:
    return {
        "query": query,
        "classification": {
            "category": category,
            "accessibilityTarget": "ALL",
            "priority": "MEDIUM",
        },
        "rawPrediction": {
            "category": category,
            "accessibilityTarget": "ALL",
            "priority": "MEDIUM",
        },
        "ruleApplied": False,
        "results": [
            {
                "rank": 1,
                "docId": f"quality-{category}",
                "title": f"{category} 지원 안내",
                "summary": "장애인을 위한 지원 정보입니다.",
                "source": "공식 복지 기관",
                "url": "https://example.com/support",
                "category": category,
                "accessibilityTarget": "ALL",
                "priority": "MEDIUM",
                "finalScore": 0.91,
                "importantFields": {
                    "supportTarget": "등록 장애인",
                    "supportContent": "필요한 서비스 또는 기기를 지원합니다.",
                    "applyMethod": "주민센터에서 신청 방법을 확인합니다.",
                    "contact": "관할 주민센터",
                    "sourceAgency": "공식 복지 기관",
                },
            }
        ],
        "resultCount": 1,
        "fallbackUsed": False,
        "fallbackLevel": "category_target",
    }


@pytest.fixture(autouse=True)
def configured_llm(monkeypatch):
    clear_llm_cache()
    monkeypatch.setenv("INFO_AGENT_LLM_ENABLED", "true")
    monkeypatch.setenv("OPENAI_API_KEY", "quality-test-key")


@pytest.mark.parametrize("question,category", LLM_QUESTIONS.items())
def test_expected_questions_call_llm_and_keep_quality_meta(monkeypatch, question, category):
    calls = []
    monkeypatch.setattr(
        response_builder_module,
        "search_documents",
        lambda **_kwargs: deepcopy(rag_result(question, category)),
    )
    monkeypatch.setattr(
        response_builder_module,
        "call_llm",
        lambda prompt, config: (calls.append((prompt, config)) or (LLM_RESPONSE, None)),
    )

    response = run_info_agent(question)
    meta = response["meta"]

    assert len(calls) == 1
    assert response["success"] is True
    assert response["appCard"] is not None
    assert meta["llmUsed"] is True
    assert meta["llmFallback"] is False
    assert meta["llmFallbackReason"] == ""
    assert meta["llmCacheHit"] is False
    assert meta["predictedCategory"] == category
    assert meta["predictedPriority"]
    assert meta["topDocCount"] == 1
    assert meta["topDocScore"] == 0.91
    assert meta["extractedFields"]["supportTarget"] == "등록 장애인"
    assert "공식 기관" in response["answerText"]
    assert len(response["voiceMessage"]) <= 220


@pytest.mark.parametrize("question", SOUND_QUESTIONS)
def test_sound_and_safety_questions_do_not_route_to_info_agent(question):
    assert route_question(question) == "SOUND_CHATBOT"


def test_no_result_does_not_call_llm(monkeypatch):
    calls = []
    result = rag_result("존재하지 않는 지원 질문", "복지지원")
    result.update({"results": [], "resultCount": 0})
    monkeypatch.setattr(response_builder_module, "search_documents", lambda **_kwargs: result)
    monkeypatch.setattr(
        response_builder_module,
        "call_llm",
        lambda prompt, config: (calls.append((prompt, config)) or (LLM_RESPONSE, None)),
    )

    response = run_info_agent("존재하지 않는 복지 지원 질문")

    assert calls == []
    assert response["success"] is True
    assert response["meta"]["llmUsed"] is False
    assert response["meta"]["fallbackReason"] == "no_results"


def test_repeated_question_uses_cache(monkeypatch):
    question = "보청기 지원 받을 수 있어?"
    calls = []
    monkeypatch.setattr(
        response_builder_module,
        "search_documents",
        lambda **_kwargs: deepcopy(rag_result(question, "보조기기")),
    )
    monkeypatch.setattr(
        response_builder_module,
        "call_llm",
        lambda prompt, config: (calls.append((prompt, config)) or (LLM_RESPONSE, None)),
    )

    first = run_info_agent(question)
    second = run_info_agent(question)

    assert len(calls) == 1
    assert first["meta"]["llmUsed"] is True
    assert first["meta"]["llmCacheHit"] is False
    assert second["meta"]["llmUsed"] is True
    assert second["meta"]["llmCacheHit"] is True


@pytest.mark.parametrize("reason", ("timeout", "invalid_response", "empty_response"))
def test_llm_failures_keep_safe_template_response(monkeypatch, reason):
    question = "장애인 보조기기 신청 방법 알려줘"
    monkeypatch.setattr(
        response_builder_module,
        "search_documents",
        lambda **_kwargs: deepcopy(rag_result(question, "보조기기")),
    )
    monkeypatch.setattr(
        response_builder_module,
        "call_llm",
        lambda _prompt, _config: (None, reason),
    )

    response = run_info_agent(question)

    assert response["success"] is True
    assert response["answerText"] == "주민센터에서 신청 방법을 확인합니다."
    assert response["meta"]["llmUsed"] is False
    assert response["meta"]["llmFallback"] is True
    assert response["meta"]["llmFallbackReason"] == reason
