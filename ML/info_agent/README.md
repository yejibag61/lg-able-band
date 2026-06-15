# LG Able Band Info Agent

## 복지로 상세 문서 수집

복지로/공공데이터 API는 사용자 질의 중 실시간 호출하지 않고, 별도 수집 단계에서
상세 서비스 문서를 `data/bokjiro_documents.csv`로 저장합니다. 이 파일이 없거나
비어 있으면 RAG는 기존 문서만 사용합니다.

`.env`에 `DATA_GO_KR_SERVICE_KEY` 또는 `BOKJIRO_SERVICE_KEY`와
`BOKJIRO_API_URL` 또는 `PUBLIC_WELFARE_API_URL`을 설정한 뒤 실행합니다.
일일 100회 한도에 맞춰 기본적으로 목록 1회와 상세조회 최대 99회를 사용합니다.
수집 결과는 누적 저장되며 이미 상세 수집한 서비스는 다음 실행에서 건너뜁니다.

```powershell
python ML/info_agent/scripts/collect_bokjiro.py
# 또는 ML/info_agent 폴더에서
python scripts/collect_bokjiro.py
```

Able Band 사용자가 행동하거나 알림으로 확인할 수 있는 실제 정보를 수집하고 검색·분류하는
ML 서버입니다. 수집은 실시간 요청 방식이 아닌 배치 방식입니다.

## 데이터 기준

- `.env`는 공공데이터 API 키와 API URL만 관리합니다.
- 뉴스/RSS URL은 수집기 코드 내부 기본값으로 관리합니다.
- seed 데이터는 최종 데이터셋과 기본 파이프라인에 포함하지 않습니다.
- 최종 데이터는 게시일이 확인되는 2020년 이후 실제 API/RSS/목록/파일데이터만 사용합니다.
- 기사 전문 전체가 아닌 제목, 요약, 링크, 게시일 중심으로 저장합니다.

`data/raw/documents.csv`는 `appRelevanceScore >= 60`이며 `NOT_RECOMMENDED`가 아닌
앱/RAG용 고품질 데이터입니다.

`data/raw/documents_training.csv`는 `appRelevanceScore >= 40`인 분류모델 학습용 확장
데이터입니다. 앱 알림으로 바로 사용하기 어려운 장애 정책·연구·뉴스 참고 자료도 포함할
수 있습니다.

한국장애인개발원 연구보고서는 `data/source_files/koddi_reports_20250930.csv`를 기본
파일데이터로 읽으며, `KODDI_REPORT_API_URL`이 설정되면 API를 우선 사용합니다.

중앙부처 복지서비스 API와 지자체 복지서비스 API는 공식 공공데이터 기반 복지·지원사업
정보의 핵심 출처입니다. 목록과 상세조회에서 활동지원, 보조기기, 이동지원, 재난안전,
권리구제 등 부족 라벨 타깃을 우선 확인합니다. 뉴스/RSS 데이터는 장애 이슈와 정책 흐름
보강용으로 사용합니다. 최종 데이터셋은 공공 API와 뉴스/RSS를 함께 사용하되 앱/RAG용
`documents.csv`와 학습용 `documents_training.csv`로 분리합니다.

`targeted_accessibility_news.csv`는 기존 공식 뉴스/RSS/한국장애인개발원 자료에서 부족
라벨 키워드가 확인된 실제 수집 문서를 별도로 표시한 파일입니다. 병합 시 제목·내용
중복을 제거하므로 문서를 복제하지 않습니다.

## 실행

```powershell
cd ML/info_agent
pip install -r requirements.txt
python scripts/run_data_pipeline.py
python scripts/validate_documents.py
python scripts/train_category_model.py
python scripts/train_priority_model.py
python scripts/evaluate_models.py
python test_requests.py
```

생성 모델:

- `models/category_classifier.joblib`
- `models/priority_classifier.joblib`

## 선택적 LLM 답변 생성

Info Agent는 기본적으로 기존 템플릿 응답만 사용합니다. 검색 신뢰도가 높은 비긴급
복지·지원 질문의 답변 문장만 LLM으로 자연스럽게 만들려면
`ML/info_agent/.env` 또는 실행 환경에 다음 값을 설정합니다.

```properties
OPENAI_API_KEY=...
INFO_AGENT_LLM_ENABLED=true
INFO_AGENT_LLM_MODEL=gpt-4o-mini
INFO_AGENT_LLM_TIMEOUT_SEC=8
INFO_AGENT_LLM_MAX_INPUT_DOCS=3
INFO_AGENT_LLM_MAX_TOKENS=500
INFO_AGENT_LLM_CACHE_TTL_SEC=600
INFO_AGENT_LLM_MIN_SCORE=0.45
```

`INFO_AGENT_LLM_ENABLED=true`와 API 키가 모두 있어야 호출됩니다. 검색 결과 없음,
낮은 검색 점수, 긴급·위험·보호자 연락 질문, 넓은 범위 질문, 후속 확인 질문에서는
기존 템플릿을 사용합니다. 호출 오류나 timeout, rate limit, JSON 형식 오류가 발생해도
기존 응답으로 자동 fallback하며 결과의 `meta`에 LLM 사용 여부가 기록됩니다.

## 챗봇 품질 진단 및 평가

Info Agent 응답의 `meta.debug`에는 최종 분류 결과, priority, 최상위 검색 문서와
점수, 검색 문서 수, 추출 필드, 검색 fallback 여부가 기록됩니다.

평가 질문 데이터는 `data/chatbot_eval_questions.csv`에 있으며 다음 명령으로
기존 BE 라우팅 규칙과 Info Agent category 결과를 함께 평가할 수 있습니다.

```powershell
cd ML/info_agent
python eval_info_agent_quality.py
python eval_info_agent_quality.py --show-passes
python eval_info_agent_quality.py --limit 10
```

평가 실패가 있으면 스크립트는 종료 코드 `1`을 반환하고 실패 질문과 주요 debug
정보를 출력합니다.
