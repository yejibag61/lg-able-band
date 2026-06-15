"""Tests for the offline Bokjiro collector and optional RAG document."""

import importlib
import os
import subprocess
import sys
from pathlib import Path

import pandas as pd
import requests


INFO_AGENT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(INFO_AGENT_DIR))

from collectors.bokjiro_collector import collect_bokjiro, extract_application_method, normalize_service


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload
        self.text = ""

    def json(self):
        return self.payload

    def raise_for_status(self):
        return None


def test_empty_fields_do_not_stop_normalization():
    document = normalize_service({"servId": "1", "servNm": "장애인 의료비 지원"}, {})
    assert document["title"] == "장애인 의료비 지원"
    assert document["applicationMethod"] == ""
    assert "제목: 장애인 의료비 지원" in document["content"]


def test_application_method_falls_back_to_detail_text():
    detail = {"servCn": "주소지 행정복지센터에 방문 신청합니다. 문의는 담당 부서로 해주세요."}
    method = extract_application_method(detail, detail["servCn"])
    assert "방문 신청" in method


def test_collector_uses_list_id_and_detail_response(tmp_path):
    calls = []

    def fake_get(url, params, timeout):
        calls.append((url, params, timeout))
        if url.endswith("NationalWelfarelistV001"):
            return FakeResponse({"items": [{"servId": "WLF-1", "servNm": "장애인 의료비 지원"}]})
        return FakeResponse({"item": {
            "servId": "WLF-1", "servNm": "장애인 의료비 지원",
            "sportTrgetCn": "등록장애인", "slctCritCn": "저소득 기준",
            "aplyMtdCn": "주소지 주민센터 방문 신청",
        }})

    output = tmp_path / "bokjiro_documents.csv"
    documents = collect_bokjiro(
        base_url="https://example.test/api",
        service_key="key",
        output_path=output,
        sleep_seconds=0,
        request_get=fake_get,
    )
    assert len(calls) == 2
    assert calls[1][1]["servId"] == "WLF-1"
    assert documents[0]["supportTarget"] == "등록장애인"
    assert documents[0]["selectionCriteria"] == "저소득 기준"
    assert documents[0]["applicationMethod"] == "주소지 주민센터 방문 신청"
    assert documents[0]["detailStatus"] == "DETAIL_OK"
    assert output.exists()


def test_detail_failure_is_visible_and_does_not_stop_collection(tmp_path):
    def fake_get(url, params, timeout):
        if url.endswith("NationalWelfarelistV001"):
            return FakeResponse({"items": [{"servId": "WLF-1", "servNm": "장애인 의료비 지원"}]})
        raise requests.HTTPError("429 API token quota exceeded")

    output = tmp_path / "bokjiro_documents.csv"
    documents = collect_bokjiro(
        base_url="https://example.test/api",
        service_key="key",
        output_path=output,
        sleep_seconds=0,
        request_get=fake_get,
    )
    assert documents == []
    assert not output.exists()


def test_collector_resumes_and_honors_daily_detail_limit(tmp_path):
    output = tmp_path / "bokjiro_documents.csv"
    pd.DataFrame([{
        "docId": "BOKJIRO-WLF-1", "title": "기존 상세", "supportTarget": "등록장애인",
        "detailStatus": "DETAIL_OK",
    }]).to_csv(output, index=False, encoding="utf-8-sig")
    calls = []

    def fake_get(url, params, timeout):
        calls.append((url, params))
        if url.endswith("NationalWelfarelistV001"):
            return FakeResponse({"items": [
                {"servId": "WLF-1", "servNm": "기존 상세"},
                {"servId": "WLF-2", "servNm": "장애인의료비지원"},
                {"servId": "WLF-3", "servNm": "일반 복지"},
            ]})
        return FakeResponse({"item": {
            "servId": params["servId"], "servNm": "장애인의료비지원",
            "sportTrgetCn": "등록장애인",
        }})

    documents = collect_bokjiro(
        base_url="https://example.test/api",
        service_key="key",
        output_path=output,
        max_detail_requests=1,
        sleep_seconds=0,
        request_get=fake_get,
    )
    detail_calls = [params for url, params in calls if url.endswith("NationalWelfaredetailedV001")]
    assert len(detail_calls) == 1
    assert detail_calls[0]["servId"] == "WLF-2"
    assert documents[0]["docId"] == "BOKJIRO-WLF-2"
    assert len(pd.read_csv(output, encoding="utf-8-sig")) == 2


def test_missing_key_script_exits_cleanly():
    env = os.environ.copy()
    for name in ("DATA_GO_KR_SERVICE_KEY", "BOKJIRO_SERVICE_KEY"):
        env[name] = " "
    result = subprocess.run(
        [sys.executable, str(INFO_AGENT_DIR / "scripts" / "collect_bokjiro.py")],
        cwd=INFO_AGENT_DIR,
        env=env,
        text=True,
        capture_output=True,
        check=False,
    )
    assert result.returncode == 0
    assert "SERVICE_KEY" in result.stdout


def test_optional_bokjiro_document_is_loaded(tmp_path, monkeypatch):
    import rag_retriever

    path = tmp_path / "bokjiro_documents.csv"
    pd.DataFrame([{
        "docId": "BOKJIRO-1", "title": "장애인 의료비 지원", "summary": "의료비 지원",
        "content": "신청방법: 주소지 주민센터 방문 신청", "source": "복지로",
        "url": "", "category": "의료/건강", "priority": "HIGH",
        "accessibilityTarget": "DISABLED_GENERAL", "supportTarget": "등록장애인",
        "selectionCriteria": "저소득 기준", "applicationMethod": "주소지 주민센터 방문 신청",
        "contact": "주민센터", "department": "", "updatedAt": "", "sourceType": "PUBLIC_API",
    }]).to_csv(path, index=False, encoding="utf-8-sig")
    monkeypatch.setattr(rag_retriever, "BOKJIRO_DOCUMENT_PATH", path)
    documents = rag_retriever._load_documents()
    row = documents.loc[documents["docId"].eq("BOKJIRO-1")].iloc[0]
    assert "주소지 주민센터 방문 신청" in row["_importantText"]
