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
            "importantFields": {
                "supportTarget": "등록 장애인 중 의료비 지원 대상자",
                "supportContent": "본인부담 의료비 일부를 지원합니다.",
                "applyMethod": "주소지 주민센터에 방문 신청합니다.",
                "contact": "주소지 주민센터",
            },
            "importantFieldQuality": "HIGH",
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
        "importantFields": {
            "applyMethod": "주소지 주민센터에 방문 신청합니다.",
            "contact": "주소지 주민센터",
        },
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
    assert response["answerText"] == "장애인의료비지원 정보를 찾았어요."
    assert "안내입니다" not in response["appCard"]["summary"]
    assert "의료/건강 관련 정보입니다" not in response["appCard"]["summary"]
    assert response["appCard"]["summary"] != response["appCard"]["recommendedAction"]
    assert response["appCard"]["supportTarget"] == "등록 장애인 중 의료비 지원 대상자"
    assert response["appCard"]["applyMethod"] == "주소지 주민센터에 방문 신청합니다."
    assert response["bandMessage"] == ""
    assert response["recommendedChannels"] == []


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
    assert response["followupAnswer"]["answer"] == "주소지 주민센터에 방문 신청합니다."


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


@patch("response_builder.search_documents", return_value=RAG_RESULT)
def test_followup_uses_retrieved_fields_when_context_has_no_fields(_search):
    response = build_info_response(
        "장애인의료비지원 신청 방법 알려줘",
        context={
            "isFollowup": True,
            "lastInfoAgent": {
                "title": "장애인의료비지원",
                "source": "공공데이터포털 중앙부처복지서비스",
            },
        },
    )

    assert response["followupAnswer"]["answer"] == "주소지 주민센터에 방문 신청합니다."


@patch(
    "response_builder.search_documents",
    return_value={
        **RAG_RESULT,
        "results": [
            {
                **RAG_RESULT["results"][0],
                "importantFields": {},
            }
        ],
    },
)
def test_followup_clearly_reports_missing_document_field(_search):
    response = build_info_response(
        "장애인의료비지원 신청 방법 알려줘",
        context={
            "isFollowup": True,
            "lastInfoAgent": {"title": "장애인의료비지원"},
        },
    )

    answer = response["followupAnswer"]["answer"]
    assert "신청방법이 명확히 제공되지 않았습니다" in answer
    assert "관할 주민센터 또는 복지 담당 부서" in answer


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


@patch("response_builder.search_documents", return_value=RAG_RESULT)
def test_broad_welfare_question_returns_overview(_search):
    response = build_info_response("복지 알려줘")

    assert response["responseType"] == "INFO_OVERVIEW"
    assert response["appCard"]["title"] == "복지 지원 정보"
    assert response["appCard"]["title"] != RAG_RESULT["results"][0]["title"]
    assert response["bandMessage"] == ""


@patch(
    "response_builder.search_documents",
    return_value={
        **RAG_RESULT,
        "classification": {
            "category": "재난/안전",
            "accessibilityTarget": "ALL",
            "priority": "HIGH",
        },
        "results": [
            {
                **RAG_RESULT["results"][0],
                "title": "장애인 폭염 안전 안내",
                "summary": "폭염 상황에서는 외출을 줄이고 시원한 곳에서 충분히 수분을 섭취해야 합니다.",
                "category": "재난/안전",
                "importantFields": {},
            }
        ],
    },
)
def test_heat_wave_response_is_short_and_action_focused(_search):
    response = build_info_response("폭염 때 어떻게 해야 해?")

    assert response["responseType"] == "URGENT_INFO_CARD"
    assert response["appCard"]["title"] == "폭염 대처 안내"
    assert "시원한 곳으로 이동" in response["answerText"]
    assert "물을 자주 마시세요" in response["appCard"]["recommendedAction"]
    assert response["recommendedChannels"]


@patch("response_builder.search_documents", return_value=RAG_RESULT)
def test_safety_followup_returns_previous_action(_search):
    response = build_info_response(
        "지금 어떻게 해야 해?",
        context={
            "isFollowup": True,
            "lastInfoAgent": {
                "title": "폭염 대처 안내",
                "recommendedAction": "시원한 곳으로 이동하고 물을 자주 마시세요.",
            },
        },
    )

    assert response["responseType"] == "FOLLOWUP_ANSWER"
    assert response["followupAnswer"]["type"] == "SAFETY_ACTION"
    assert response["answerText"] == "시원한 곳으로 이동하고 물을 자주 마시세요."


@patch("response_builder.search_documents", return_value=RAG_RESULT)
def test_short_followups_use_last_information_card_fields(_search):
    last_card = {
        "title": "장애인의료비지원",
        "source": "복지로",
        "supportTarget": "저소득 등록 장애인",
        "applyMethod": "주소지 주민센터에서 신청",
        "contact": "보건복지상담센터 129",
    }

    cases = (
        ("신청은?", "주소지 주민센터에서 신청"),
        ("문의처는?", "보건복지상담센터 129"),
    )
    for query, expected in cases:
        response = build_info_response(
            query,
            context={"isFollowup": True, "lastInfoAgent": last_card},
        )
        assert response["responseType"] == "FOLLOWUP_ANSWER"
        assert response["answerText"] == expected

    eligibility_response = build_info_response(
        "대상은?",
        context={"isFollowup": True, "lastInfoAgent": last_card},
    )
    assert "지원 대상은 저소득 등록 장애인입니다" in eligibility_response["answerText"]
    assert "저소득 등록 장애인" in eligibility_response["answerText"]
    assert "공식 출처" in eligibility_response["answerText"]


@patch("response_builder.search_documents", return_value=RAG_RESULT)
def test_followup_can_use_last_information_card_from_history(_search):
    response = build_info_response(
        "신청은?",
        context={
            "isFollowup": True,
            "history": [
                {"role": "user", "content": "의료비 지원 알려줘"},
                {
                    "role": "assistant",
                    "infoCard": {
                        "title": "장애인의료비지원",
                        "applyMethod": "주소지 주민센터에서 신청",
                    },
                },
            ],
        },
    )

    assert response["answerText"] == "주소지 주민센터에서 신청"


@patch(
    "response_builder.search_documents",
    return_value={
        **RAG_RESULT,
        "results": [
            {
                **RAG_RESULT["results"][0],
                "importantFields": {
                    "supportContent": "본인부담 의료비 일부를 지원합니다.",
                },
            }
        ],
    },
)
def test_card_marks_missing_fields_and_does_not_guess(_search):
    response = build_info_response("장애인 의료비 지원 알려줘")

    assert response["appCard"]["supportContent"] == "본인부담 의료비 일부를 지원합니다."
    assert "지원 대상과 신청 방법을 출처에서 확인" in response["appCard"]["recommendedAction"]
    assert response["appCard"]["verificationNotice"] == "정확한 내용은 공식 기관 확인이 필요합니다."
    assert "신청 대상" in response["note"]
    assert "신청 방법" in response["note"]


@patch(
    "response_builder.search_documents",
    return_value={
        **RAG_RESULT,
        "results": [
            {
                **RAG_RESULT["results"][0],
                "importantFields": {
                    "supportContent": "본인부담 의료비 일부를 지원합니다.",
                },
            }
        ],
    },
)
def test_specific_initial_question_reports_missing_field_without_guessing(_search):
    response = build_info_response("장애인의료비지원 신청 방법 알려줘")

    assert "신청방법이 명확히 제공되지 않았습니다" in response["answerText"]
    assert "관할 주민센터 또는 복지 담당 부서" in response["answerText"]


@patch(
    "response_builder.search_documents",
    return_value={
        **RAG_RESULT,
        "results": [
            {
                **RAG_RESULT["results"][0],
                "importantFields": {},
            }
        ],
    },
)
def test_missing_contact_followup_keeps_known_card_context(_search):
    response = build_info_response(
        "문의처는?",
        context={
            "isFollowup": True,
            "lastInfoCard": {
                "title": "장애인의료비지원",
                "summary": "저소득 장애인의 의료비 부담을 줄이기 위한 지원 정보입니다.",
                "source": "복지로",
                "category": "의료/건강",
            },
        },
    )

    answer = response["answerText"]
    assert "담당 기관의 전화번호나 문의처가 제공되지 않았습니다" in answer
    assert "관할 주민센터에 '장애인의료비지원 문의'" in answer
    assert "확인된 내용:" not in answer


@patch(
    "response_builder.search_documents",
    return_value={
        **RAG_RESULT,
        "results": [{
            **RAG_RESULT["results"][0],
            "title": "탈시설 장애인 자립정착금 지원",
            "summary": "탈시설 장애인의 지역사회 정착 및 자립기반 조성 지원.",
            "importantFields": {
                "supportTarget": (
                    "탈시설 장애인의 지역사회 정착 및 자립기반 조성 지원 대구광역시 "
                    "장애인복지과 현금지급 방문 상단 지원대상 내용 참조 "
                    "신청방법: 퇴소장애인 -> 구군"
                ),
                "applicationMethod": (
                    "탈시설 장애인의 지역사회 정착 및 자립기반 조성 지원 대구광역시 "
                    "장애인복지과 현금지급 방문 상단 지원대상 내용 참조 "
                    "신청방법: 퇴소장애인 -> 구군"
                ),
            },
        }],
    },
)
def test_polluted_fields_are_cleaned_for_card_and_followups(_search):
    initial = build_info_response("탈시설 장애인 자립정착금 지원 알려줘")
    card = initial["appCard"]
    assert card["supportTarget"] == "탈시설 장애인"
    assert card["applicationMethod"] == "퇴소 장애인이 구·군에 신청합니다."

    context = {"isFollowup": True, "lastInfoAgent": card}
    target = build_info_response("지원 대상은 누구야?", context=context)
    method = build_info_response("신청 방법 알려줘", context=context)
    detail = build_info_response("자세히 알려줘", context=context)

    assert "지원 대상은 탈시설 장애인입니다" in target["answerText"]
    assert method["answerText"] == "퇴소 장애인이 구·군에 신청합니다."
    assert "탈시설 장애인 자립정착금 지원:" in detail["answerText"]
    assert "신청방법: 퇴소 장애인이 구·군에 신청합니다." in detail["answerText"]
    assert "확인된 내용:" not in detail["answerText"]


@patch("response_builder.search_documents", return_value=RAG_RESULT)
def test_eligibility_followup_uses_summary_hints_from_last_card(_search):
    response = build_info_response(
        "지원 대상은 누구야?",
        context={
            "isFollowup": True,
            "lastInfoAgent": {
                "title": "어르신 틀니, 보청기 사업",
                "source": "공식 복지 기관",
                "summary": (
                    "어르신의 틀니와 보청기를 지원합니다. "
                    "만 65세 이상이며 기초연금 선정기준에 해당하는 수급자와 차상위계층이 언급되어 있습니다."
                ),
                "importantFields": {},
            },
        },
    )

    assert response["responseType"] == "FOLLOWUP_ANSWER"
    assert "지원 대상은" in response["answerText"]
    assert "만 65세 이상" in response["answerText"]
    assert "기초연금 선정기준" in response["answerText"]
    assert "차상위계층" in response["answerText"]
    assert "최종 자격 여부는 공식 출처" in response["answerText"]
    assert response["_llmMeta"]["fallbackReason"] == "followup_template"


@patch("response_builder.call_llm")
@patch("response_builder.search_documents", return_value=RAG_RESULT)
def test_repeated_eligibility_followup_uses_last_card_without_llm(_search, call_llm):
    context = {
        "isFollowup": True,
        "lastInfoCard": {
            "title": "어르신 틀니, 보청기 사업",
            "summary": "만 65세 이상 어르신 중 기초연금 선정기준에 해당하는 수급자를 지원합니다.",
        },
    }

    first = build_info_response("누가 받을 수 있어?", context=context)
    second = build_info_response("신청 조건은?", context=context)

    assert "지원 대상은" in first["answerText"]
    assert "기초연금 선정기준" in second["answerText"]
    call_llm.assert_not_called()
