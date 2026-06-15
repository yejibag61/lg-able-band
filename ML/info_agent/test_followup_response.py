from unittest.mock import patch

from response_builder import build_info_response


RAG_RESULT = {
    "query": "장애인의료비지원 신청 방법 알려줘",
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
        }
    ],
    "resultCount": 1,
    "fallbackUsed": False,
    "fallbackLevel": "strict",
}
CONTEXT = {
    "isFollowup": True,
    "lastInfoAgent": {
        "title": "장애인의료비지원",
        "category": "의료/건강",
        "priority": "MEDIUM",
        "source": "공공데이터포털 중앙부처복지서비스",
        "summary": "저소득 장애인의 의료비 부담을 줄이는 지원입니다.",
    },
}


@patch("response_builder.search_documents", return_value=RAG_RESULT)
def test_initial_question_returns_info_card(_search):
    response = build_info_response("장애인 의료비 지원 알려줘")

    assert response["responseType"] == "INFO_CARD"
    assert response["intent"] == "INFO_AGENT_QUERY"
    assert response["appCard"]["title"] == "장애인의료비지원"
    assert response["infoCard"]["title"] == "장애인의료비지원"
    assert response["followupAnswer"] is None


@patch("response_builder.search_documents", return_value=RAG_RESULT)
def test_followup_returns_answer_without_card(_search):
    response = build_info_response(
        "장애인의료비지원 신청 방법 알려줘",
        context=CONTEXT,
    )

    assert response["responseType"] == "FOLLOWUP_ANSWER"
    assert response["intent"] == "INFO_AGENT_FOLLOWUP"
    assert response["action"] == "ANSWER_FOLLOWUP"
    assert response["appCard"] is None
    assert response["infoCard"] is None
    assert response["followupAnswer"]["type"] == "APPLY_METHOD"
    assert "신청 방법" in response["followupAnswer"]["answer"]


@patch("response_builder.search_documents", return_value=RAG_RESULT)
def test_contact_followup_does_not_invent_phone_number(_search):
    response = build_info_response(
        "장애인의료비지원 담당 기관 문의 방법은?",
        context=CONTEXT,
    )

    assert response["responseType"] == "FOLLOWUP_ANSWER"
    assert response["followupAnswer"]["type"] == "CONTACT"
    assert response["appCard"] is None
    assert "전화번호" not in response["followupAnswer"]["answer"]


@patch(
    "response_builder.search_documents",
    return_value={
        **RAG_RESULT,
        "results": [],
        "resultCount": 0,
    },
)
def test_no_result_has_no_card(_search):
    response = build_info_response("찾을 수 없는 지원 정보")

    assert response["responseType"] == "NO_RESULT"
    assert response["appCard"] is None
