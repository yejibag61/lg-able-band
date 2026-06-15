from copy import deepcopy

try:
    from . import info_agent as info_agent_module
    from . import response_builder as response_builder_module
except ImportError:
    import info_agent as info_agent_module
    import response_builder as response_builder_module


run_info_agent = info_agent_module.run_info_agent


RAG_RESULT = {
    "query": "장애인 의료비 지원 알려줘",
    "classification": {
        "category": "의료/건강",
        "accessibilityTarget": "ALL",
        "priority": "MEDIUM",
    },
    "rawPrediction": {
        "category": "일반뉴스",
        "accessibilityTarget": "ALL",
        "priority": "LOW",
    },
    "ruleApplied": True,
    "results": [
        {
            "rank": 1,
            "docId": "medical-1",
            "title": "장애인의료비지원",
            "summary": "저소득 장애인의 의료비 지원 정보입니다.",
            "source": "복지로",
            "category": "의료/건강",
            "accessibilityTarget": "ALL",
            "priority": "MEDIUM",
            "finalScore": 0.91,
            "importantFields": {
                "supportTarget": "저소득 등록 장애인",
                "applyMethod": "주민센터에서 확인",
            },
        }
    ],
    "resultCount": 1,
    "fallbackUsed": False,
    "fallbackLevel": "category_target",
}


def test_quality_debug_is_added_to_meta(monkeypatch):
    monkeypatch.setattr(
        response_builder_module,
        "search_documents",
        lambda **_kwargs: deepcopy(RAG_RESULT),
    )
    response = run_info_agent("장애인 의료비 지원 알려줘")
    debug = response["meta"]["debug"]

    assert debug["routingResult"] == "INFO_AGENT"
    assert debug["predictedCategory"] == "의료/건강"
    assert debug["predictedPriority"] == "MEDIUM"
    assert debug["topDocumentScore"] == 0.91
    assert debug["retrievedDocumentCount"] == 1
    assert debug["extractedFields"]["supportTarget"] == "저소득 등록 장애인"
    assert debug["fallbackUsed"] is False
    assert "_qualityDebug" not in response


def test_quality_debug_is_added_to_safe_error_response():
    response = run_info_agent("")

    assert response["success"] is False
    assert response["meta"]["debug"]["fallbackUsed"] is True
    assert response["meta"]["debug"]["fallbackLevel"] == "error"
