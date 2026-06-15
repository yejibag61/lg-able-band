import json
from pathlib import Path
from unittest.mock import Mock
from unittest.mock import patch

import pandas as pd

from enrich_documents import enrich_frame
from important_field_extractor import extract_important_fields
from url_content_collector import collect_url


def document(**overrides):
    return {
        "docId": "DOC-001",
        "title": "장애인의료비지원",
        "content": "저소득 장애인의 의료비를 지원합니다. 주민센터 방문 신청이 가능합니다.",
        "source": "공공데이터포털 중앙부처복지서비스",
        "url": "",
        "category": "의료/건강",
        **overrides,
    }


def test_document_without_url_uses_existing_content(tmp_path: Path):
    result = enrich_frame(pd.DataFrame([document()]), cache_path=tmp_path / "cache.jsonl", sleep_seconds=0)
    fields = json.loads(result.iloc[0]["importantFields"])

    assert result.iloc[0]["fetchStatus"] == "SKIPPED"
    assert fields["supportContent"]
    assert fields["applyMethod"]


def test_failed_url_collection_does_not_raise():
    session = Mock()
    session.get.side_effect = RuntimeError("blocked")

    result = collect_url("DOC-001", "https://example.com", session=session)

    assert result["fetchStatus"] == "FAILED"
    assert result["text"] == ""


@patch("enrich_documents.collect_documents")
def test_failed_url_does_not_stop_enrichment(collect_documents, tmp_path: Path):
    failed_document = document(url="https://example.com")
    collect_documents.return_value = {
        "DOC-001|https://example.com": {
            "fetchStatus": "FAILED",
            "fetchedAt": "2026-06-15T00:00:00+09:00",
            "text": "",
        }
    }

    result = enrich_frame(pd.DataFrame([failed_document]), cache_path=tmp_path / "cache.jsonl")

    assert len(result) == 1
    assert result.iloc[0]["fetchStatus"] == "FAILED"
    assert json.loads(result.iloc[0]["importantFields"])["applyMethod"]


def test_rule_based_medical_document_extracts_important_fields():
    fields = extract_important_fields(document())

    assert fields["supportContent"] or fields["applyMethod"]


def test_structured_card_fields_are_preferred_over_generic_content():
    fields = extract_important_fields(
        document(
            content="장애인을 위한 지원 사업입니다.",
            applicationTarget="등록 장애인 중 소득 기준 충족자",
            applicationMethod="복지로 또는 주민센터에서 신청",
            contactInfo="보건복지상담센터 129",
            supportContent="본인부담 의료비 일부 지원",
        )
    )

    assert fields["supportTarget"] == "등록 장애인 중 소득 기준 충족자"
    assert fields["applyMethod"] == "복지로 또는 주민센터에서 신청"
    assert fields["contact"] == "보건복지상담센터 129"
    assert fields["supportContent"] == "본인부담 의료비 일부 지원"
    assert fields["sourceAgency"] == "공공데이터포털 중앙부처복지서비스"


def test_labeled_document_fields_are_extracted_without_neighbor_sentences():
    fields = extract_important_fields(
        document(
            content=(
                "사업 소개 문장입니다.\n"
                "지원 대상: 등록 장애인\n"
                "지원 내용: 의료비 일부 지원\n"
                "신청 방법: 주소지 주민센터 방문\n"
                "문의처: 보건복지상담센터 129"
            )
        )
    )

    assert fields["supportTarget"] == "등록 장애인"
    assert fields["supportContent"] == "의료비 일부 지원"
    assert fields["applyMethod"] == "주소지 주민센터 방문"
    assert fields["contact"] == "보건복지상담센터 129"


def test_welfare_condition_hints_are_split_into_eligibility_fields():
    fields = extract_important_fields(
        document(
            title="어르신 틀니, 보청기 사업",
            content=(
                "어르신의 틀니와 보청기 구입을 지원합니다. "
                "만 65세 이상 어르신 중 기초연금 선정기준에 해당하는 수급자와 차상위계층을 우선 지원합니다. "
                "주소지 읍면동 주민센터에 방문 신청합니다."
            ),
        )
    )

    assert "만 65세 이상" in fields["ageCondition"]
    assert "기초연금 선정기준" in fields["incomeCondition"]
    assert "차상위계층" in fields["incomeCondition"]
    assert "어르신" in fields["eligibility"]
    assert "주민센터" in fields["applyMethod"]
    assert fields["applicationMethod"] == fields["applyMethod"]
