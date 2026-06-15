from copy import deepcopy

import pytest

try:
    from . import info_agent as info_agent_module
    from . import response_builder as response_builder_module
    from .llm_client import build_llm_prompt, clear_llm_cache
except ImportError:
    import info_agent as info_agent_module
    import response_builder as response_builder_module
    from llm_client import build_llm_prompt, clear_llm_cache


run_info_agent = info_agent_module.run_info_agent
RAG_RESULT = {
    "query": "장애인 의료비 지원 신청 방법 알려줘",
    "classification": {
        "category": "의료/건강",
        "accessibilityTarget": "ALL",
        "priority": "MEDIUM",
    },
    "results": [
        {
            "rank": 1,
            "docId": "medical-1",
            "title": "장애인의료비지원",
            "summary": "저소득 장애인의 의료비 부담을 줄이는 지원입니다.",
            "source": "공공데이터포털 중앙부처복지서비스",
            "url": "https://example.com",
            "category": "의료/건강",
            "accessibilityTarget": "ALL",
            "priority": "MEDIUM",
            "finalScore": 0.9,
            "importantFields": {
                "supportTarget": "등록 장애인 중 의료비 지원 대상자",
                "applyMethod": "주소지 주민센터에 방문 신청합니다.",
                "contact": "주소지 주민센터",
            },
        }
    ],
    "resultCount": 1,
    "fallbackUsed": False,
    "fallbackLevel": "strict",
}
LLM_RESPONSE = {
    "answer": "장애인 의료비 지원은 등록 장애인 중 지원 대상자를 위한 정보입니다.",
    "shortVoiceAnswer": "장애인 의료비 지원 대상과 신청 방법을 확인해 주세요.",
    "cardTitle": "장애인 의료비 지원 안내",
    "keyPoints": ["지원 대상 확인", "주민센터 방문 신청"],
    "disclaimer": "정확한 신청 가능 여부는 공식 기관에서 확인해야 합니다.",
}


@pytest.fixture(autouse=True)
def reset_llm(monkeypatch):
    clear_llm_cache()
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("INFO_AGENT_LLM_ENABLED", raising=False)
    monkeypatch.delenv("INFO_AGENT_LLM_MIN_SCORE", raising=False)


def install_rag_result(monkeypatch, result=RAG_RESULT):
    monkeypatch.setattr(
        response_builder_module,
        "search_documents",
        lambda **_kwargs: deepcopy(result),
    )


def install_llm_result(monkeypatch, result):
    calls = []

    def fake_call_llm(prompt, config):
        calls.append((prompt, config))
        return result

    monkeypatch.setattr(response_builder_module, "call_llm", fake_call_llm)
    return calls


def test_disabled_llm_returns_existing_template(monkeypatch):
    install_rag_result(monkeypatch)
    calls = install_llm_result(monkeypatch, (LLM_RESPONSE, None))
    monkeypatch.setenv("INFO_AGENT_LLM_ENABLED", "false")

    response = run_info_agent(RAG_RESULT["query"])

    assert calls == []
    assert response["answerText"] == "주소지 주민센터에 방문 신청합니다."
    assert response["meta"]["llmUsed"] is False
    assert response["meta"]["llmFallback"] is False
    assert response["meta"]["fallbackReason"] == "disabled"


def test_missing_api_key_uses_template_fallback(monkeypatch):
    install_rag_result(monkeypatch)
    calls = install_llm_result(monkeypatch, (LLM_RESPONSE, None))
    monkeypatch.setenv("INFO_AGENT_LLM_ENABLED", "true")

    response = run_info_agent(RAG_RESULT["query"])

    assert calls == []
    assert response["success"] is True
    assert response["meta"]["llmUsed"] is False
    assert response["meta"]["llmFallback"] is True
    assert response["meta"]["fallbackReason"] == "missing_api_key"


def test_llm_failure_keeps_successful_template_response(monkeypatch):
    install_rag_result(monkeypatch)
    install_llm_result(monkeypatch, (None, "rate_limit"))
    monkeypatch.setenv("INFO_AGENT_LLM_ENABLED", "true")
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")

    response = run_info_agent(RAG_RESULT["query"])

    assert response["success"] is True
    assert response["answerText"] == "주소지 주민센터에 방문 신청합니다."
    assert response["meta"]["llmFallback"] is True
    assert response["meta"]["fallbackReason"] == "rate_limit"


def test_no_results_never_calls_llm(monkeypatch):
    install_rag_result(
        monkeypatch,
        {**RAG_RESULT, "results": [], "resultCount": 0},
    )
    calls = install_llm_result(monkeypatch, (LLM_RESPONSE, None))
    monkeypatch.setenv("INFO_AGENT_LLM_ENABLED", "true")
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")

    response = run_info_agent("찾을 수 없는 장애인 지원 정보")

    assert calls == []
    assert response["responseType"] == "NO_RESULT"
    assert response["meta"]["fallbackReason"] == "no_results"


def test_low_confidence_results_never_call_llm(monkeypatch):
    low_confidence = deepcopy(RAG_RESULT)
    low_confidence["results"][0]["finalScore"] = 0.1
    install_rag_result(monkeypatch, low_confidence)
    calls = install_llm_result(monkeypatch, (LLM_RESPONSE, None))
    monkeypatch.setenv("INFO_AGENT_LLM_ENABLED", "true")
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")

    response = run_info_agent(RAG_RESULT["query"])

    assert calls == []
    assert response["meta"]["fallbackReason"] == "low_confidence"


def test_safety_question_never_calls_llm(monkeypatch):
    urgent_result = deepcopy(RAG_RESULT)
    urgent_result["classification"]["priority"] = "URGENT"
    install_rag_result(monkeypatch, urgent_result)
    calls = install_llm_result(monkeypatch, (LLM_RESPONSE, None))
    monkeypatch.setenv("INFO_AGENT_LLM_ENABLED", "true")
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")

    response = run_info_agent("긴급 상황에서 장애인 지원 방법 알려줘")

    assert calls == []
    assert response["meta"]["fallbackReason"] == "safety_rule"


def test_high_priority_support_question_can_use_llm(monkeypatch):
    high_priority_result = deepcopy(RAG_RESULT)
    high_priority_result["classification"]["priority"] = "HIGH"
    high_priority_result["results"][0]["priority"] = "HIGH"
    install_rag_result(monkeypatch, high_priority_result)
    calls = install_llm_result(monkeypatch, (LLM_RESPONSE, None))
    monkeypatch.setenv("INFO_AGENT_LLM_ENABLED", "true")
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")

    response = run_info_agent(RAG_RESULT["query"])

    assert len(calls) == 1
    assert response["meta"]["llmUsed"] is True


def test_support_program_category_can_use_llm(monkeypatch):
    support_program_result = deepcopy(RAG_RESULT)
    support_program_result["classification"]["category"] = "지원사업/모집"
    support_program_result["results"][0]["category"] = "지원사업/모집"
    install_rag_result(monkeypatch, support_program_result)
    calls = install_llm_result(monkeypatch, (LLM_RESPONSE, None))
    monkeypatch.setenv("INFO_AGENT_LLM_ENABLED", "true")
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")

    response = run_info_agent(RAG_RESULT["query"])

    assert len(calls) == 1
    assert response["meta"]["llmUsed"] is True


def test_missing_requested_field_never_calls_llm(monkeypatch):
    sparse_result = deepcopy(RAG_RESULT)
    sparse_result["results"][0]["importantFields"] = {
        "supportContent": "본인부담 의료비 일부를 지원합니다.",
    }
    install_rag_result(monkeypatch, sparse_result)
    calls = install_llm_result(monkeypatch, (LLM_RESPONSE, None))
    monkeypatch.setenv("INFO_AGENT_LLM_ENABLED", "true")
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")

    response = run_info_agent(RAG_RESULT["query"])

    assert calls == []
    assert response["meta"]["fallbackReason"] == "insufficient_fields"
    assert "공식 기관 확인이 필요합니다" in response["answerText"]


def test_eligible_info_question_uses_llm(monkeypatch):
    install_rag_result(monkeypatch)
    calls = install_llm_result(monkeypatch, (LLM_RESPONSE, None))
    monkeypatch.setenv("INFO_AGENT_LLM_ENABLED", "true")
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")

    response = run_info_agent(RAG_RESULT["query"])

    assert len(calls) == 1
    assert response["answerText"] == LLM_RESPONSE["answer"]
    assert response["voiceText"] == LLM_RESPONSE["shortVoiceAnswer"]
    assert response["appCard"]["title"] == "장애인의료비지원"
    assert response["meta"]["llmUsed"] is True
    assert response["meta"]["llmFallback"] is False


def test_repeated_question_uses_memory_cache(monkeypatch):
    install_rag_result(monkeypatch)
    calls = install_llm_result(monkeypatch, (LLM_RESPONSE, None))
    monkeypatch.setenv("INFO_AGENT_LLM_ENABLED", "true")
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")

    first = run_info_agent(RAG_RESULT["query"])
    second = run_info_agent(RAG_RESULT["query"])

    assert len(calls) == 1
    assert first["meta"]["llmCacheHit"] is False
    assert second["meta"]["llmCacheHit"] is True
    assert second["meta"]["llmUsed"] is True


def test_changed_document_fields_do_not_reuse_cache(monkeypatch):
    current_result = deepcopy(RAG_RESULT)

    def search_documents(**_kwargs):
        return deepcopy(current_result)

    monkeypatch.setattr(response_builder_module, "search_documents", search_documents)
    calls = install_llm_result(monkeypatch, (LLM_RESPONSE, None))
    monkeypatch.setenv("INFO_AGENT_LLM_ENABLED", "true")
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")

    first = run_info_agent(RAG_RESULT["query"])
    current_result["results"][0]["importantFields"]["applyMethod"] = "복지로에서 온라인 신청합니다."
    second = run_info_agent(RAG_RESULT["query"])

    assert len(calls) == 2
    assert first["meta"]["llmCacheHit"] is False
    assert second["meta"]["llmCacheHit"] is False


def test_prompt_limits_documents_and_excludes_full_content():
    documents = []
    for index in range(5):
        document = deepcopy(RAG_RESULT["results"][0])
        document["docId"] = f"medical-{index}"
        document["content"] = "긴 본문 " * 1000
        documents.append(document)

    prompt = build_llm_prompt(RAG_RESULT["query"], "ALL", documents, 3)

    assert prompt.count('"title"') == 3
    assert len(prompt) < 3000


def test_prompt_includes_eligibility_hints_without_full_content():
    document = deepcopy(RAG_RESULT["results"][0])
    document["importantFields"].update(
        {
            "eligibility": "어르신, 수급자",
            "selectionCriteria": "기초연금 선정기준",
            "ageCondition": "만 65세 이상",
            "incomeCondition": "수급자, 차상위계층",
            "regionCondition": "화성시 1년 이상 거주",
        }
    )

    prompt = build_llm_prompt("지원 대상은 누구야?", "ALL", [document], 1)

    assert "기초연금 선정기준" in prompt
    assert "만 65세 이상" in prompt
    assert "차상위계층" in prompt
    assert "화성시 1년 이상 거주" in prompt
