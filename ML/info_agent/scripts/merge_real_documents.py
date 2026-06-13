"""Build app/RAG and training datasets from real collected documents."""

import re
from pathlib import Path

import pandas as pd

from collector_utils import ALLOWED_SOURCE_TYPES, COLUMNS, RAW_DATA_DIR, split_eligible_rows, write_excluded


INPUT_FILES = (
    "public_welfare.csv", "local_welfare.csv", "ablenews_rss.csv", "theindigo_news.csv",
    "welfarenews.csv", "socialfocus.csv", "policy_briefing.csv", "koddi_report_api.csv",
    "kpf_news_metadata.csv", "targeted_accessibility_news.csv",
)


def _normalized(text: str) -> str:
    return re.sub(r"[^0-9a-z가-힣]", "", str(text).lower())


def _read(path: Path) -> pd.DataFrame:
    try:
        frame = pd.read_csv(path, dtype=str, encoding="utf-8-sig").fillna("")
    except (OSError, UnicodeError, pd.errors.EmptyDataError):
        return pd.DataFrame(columns=COLUMNS)
    for column in COLUMNS:
        if column not in frame:
            frame[column] = ""
    return frame[COLUMNS]


def _deduplicate(frame: pd.DataFrame) -> pd.DataFrame:
    if frame.empty:
        return pd.DataFrame(columns=COLUMNS)
    result = frame.copy()
    result["_title"] = result["title"].map(_normalized)
    result["_content"] = result["content"].map(_normalized)
    result = result[(result["_title"] != "") & (result["_content"] != "")]
    result = result.drop_duplicates(subset=["_title"], keep="first")
    result = result.drop_duplicates(subset=["_content"], keep="first")
    result = result.drop_duplicates(subset=["_title", "_content", "url"], keep="first")
    return result.reset_index(drop=True)


def _write_dataset(frame: pd.DataFrame, file_name: str) -> None:
    result = frame.reset_index(drop=True).copy()
    result["docId"] = [f"REAL-{index:04d}" for index in range(1, len(result) + 1)]
    result[COLUMNS].to_csv(RAW_DATA_DIR / file_name, index=False, encoding="utf-8-sig")
    print(f"{file_name}: {len(result)}건")


def _fill_general_target_group(frame: pd.DataFrame, name: str) -> pd.DataFrame:
    result = frame.copy()
    blank = result["targetKeywordGroup"].fillna("").astype(str).str.strip().eq("")
    before_count = int(blank.sum())
    result.loc[blank, "targetKeywordGroup"] = "GENERAL"
    after_count = int(result["targetKeywordGroup"].fillna("").astype(str).str.strip().eq("").sum())
    print(f"\ntargetKeywordGroup 빈 값 정리 결과 ({name})")
    print(f"  수정 전 빈 값 개수: {before_count}")
    print(f"  수정 후 빈 값 개수: {after_count}")
    print(f"  GENERAL로 변환된 개수: {before_count}")
    print(f"  전체 문서 수 변화 여부: 없음 ({len(frame)} -> {len(result)})")
    print("  기존 targetKeywordGroup 값 보존 여부: 보존")
    return result


def main() -> None:
    frames = []
    print("수집기별 원천 건수")
    for file_name in INPUT_FILES:
        path = RAW_DATA_DIR / file_name
        frame = _read(path) if path.exists() else pd.DataFrame(columns=COLUMNS)
        frames.append(frame)
        print(f"  {file_name}: {len(frame)}")

    merged = pd.concat(frames, ignore_index=True).fillna("") if frames else pd.DataFrame(columns=COLUMNS)
    invalid_source = merged[~merged["sourceType"].isin(ALLOWED_SOURCE_TYPES)].copy()
    if not invalid_source.empty:
        invalid_source["exclusionReason"] = "INVALID_SOURCE_TYPE"
    merged = merged[merged["sourceType"].isin(ALLOWED_SOURCE_TYPES)].copy()

    eligible, excluded_year, excluded_relevance = split_eligible_rows(merged.to_dict("records"))
    training = _deduplicate(pd.DataFrame(eligible, columns=COLUMNS))
    training_scores = pd.to_numeric(training["appRelevanceScore"], errors="coerce")
    training = training[training_scores >= 40].copy()

    app_scores = pd.to_numeric(training["appRelevanceScore"], errors="coerce")
    app_documents = training[
        (app_scores >= 60) & (training["appUseCase"] != "NOT_RECOMMENDED")
    ].copy()

    app_documents = _fill_general_target_group(app_documents, "documents.csv")
    training = _fill_general_target_group(training, "documents_training.csv")

    write_excluded(excluded_year, "excluded_by_year", "merge.csv")
    write_excluded([*excluded_relevance, *invalid_source.to_dict("records")], "excluded_by_relevance", "merge.csv")
    _write_dataset(app_documents, "documents.csv")
    _write_dataset(training, "documents_training.csv")

    for name, frame in (("앱/RAG", app_documents), ("학습", training)):
        print(f"\n{name} 데이터 분포")
        for column in ("sourceType", "source", "year", "category", "priority", "accessibilityTarget", "appUseCase", "targetKeywordGroup"):
            print(f"  {column}: {frame[column].value_counts().to_dict()}")


if __name__ == "__main__":
    main()
