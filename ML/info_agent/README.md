# LG Able Band Info Agent

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
