"""Validate both app/RAG and classifier-training datasets."""

import sys

import pandas as pd

from collector_utils import ALLOWED_SOURCE_TYPES, COLUMNS, RAW_DATA_DIR


DATASETS = (("documents.csv", 60, 200), ("documents_training.csv", 40, 300))
PUBLIC_SOURCE = "공공데이터포털 중앙부처복지서비스"
LOCAL_SOURCE = "공공데이터포털 지자체복지서비스"
TARGET_GROUPS = (
    "ASSISTIVE_DEVICE", "HEARING_IMPAIRED", "VISUAL_IMPAIRED",
    "VISUAL_HEARING_IMPAIRED", "SAFETY_ACTION", "RIGHTS_SUPPORT",
)


def _print_distribution(frame: pd.DataFrame, column: str) -> None:
    print(f"  {column}: {frame[column].value_counts().to_dict()}")


def _target_group_counts(frame: pd.DataFrame) -> dict[str, int]:
    counts = {group: 0 for group in TARGET_GROUPS}
    for value in frame["targetKeywordGroup"].astype(str):
        for group in value.split("|"):
            if group in counts:
                counts[group] += 1
    return counts


def _print_public_api_target_stats(frame: pd.DataFrame) -> None:
    print("\n중앙부처/지자체 핵심 공공데이터 통계")
    for source in (PUBLIC_SOURCE, LOCAL_SOURCE):
        selected = frame[frame["source"] == source]
        print(f"  {source} 수집 건수: {len(selected)}")
        print(f"    category: {selected['category'].value_counts().to_dict()}")
        print(f"    accessibilityTarget: {selected['accessibilityTarget'].value_counts().to_dict()}")
        print(f"    targetKeywordGroup: {_target_group_counts(selected)}")


def _validate(file_name: str, minimum_score: int, warning_size: int) -> list[str]:
    path = RAW_DATA_DIR / file_name
    if not path.exists():
        return [f"{file_name} 없음"]
    frame = pd.read_csv(path, dtype=str, encoding="utf-8-sig").fillna("")
    errors: list[str] = []
    missing = [column for column in COLUMNS if column not in frame]
    print(f"\n=== {file_name} ===")
    print(f"총 문서 수: {len(frame)}")
    print(f"필수 컬럼: {'통과' if not missing else '누락 ' + ', '.join(missing)}")
    if missing:
        return [f"{file_name} 필수 컬럼 누락"]

    years = pd.to_numeric(frame["year"], errors="coerce")
    scores = pd.to_numeric(frame["appRelevanceScore"], errors="coerce")
    checks = {
        "seed 포함": frame["sourceType"].eq("SEED") | frame["source"].str.contains("seed", case=False),
        "year 누락": years.isna(),
        "2020년 이전": years < 2020,
        "빈 title/content": frame["title"].str.strip().eq("") | frame["content"].str.strip().eq(""),
        "허용 외 sourceType": ~frame["sourceType"].isin(ALLOWED_SOURCE_TYPES),
        f"점수 {minimum_score} 미만": scores.isna() | (scores < minimum_score),
    }
    checks["targetKeywordGroup 빈 값"] = (
        frame["targetKeywordGroup"].fillna("").astype(str).str.strip().eq("")
    )
    for label, mask in checks.items():
        count = int(mask.sum())
        print(f"{label}: {count}")
        if count:
            errors.append(f"{file_name} {label}")
    for column in ("docId", "title", "content"):
        count = int(frame[column].duplicated().sum())
        print(f"중복 {column}: {count}")
        if count:
            errors.append(f"{file_name} 중복 {column}")

    for column in ("source", "sourceType", "year", "category", "priority", "accessibilityTarget", "appUseCase", "targetKeywordGroup"):
        _print_distribution(frame, column)
    print(f"  targetKeywordGroup 펼침 집계: {_target_group_counts(frame)}")
    print("  appRelevanceScore 구간:", {
        "90~100": int(scores.between(90, 100).sum()), "80~89": int(scores.between(80, 89).sum()),
        "70~79": int(scores.between(70, 79).sum()), "60~69": int(scores.between(60, 69).sum()),
        "40~59": int(scores.between(40, 59).sum()), "0~39": int(scores.between(0, 39).sum()),
    })
    if len(frame) < warning_size:
        print(f"[경고] {file_name} 권장 {warning_size}건 미만")
    for column in ("category", "accessibilityTarget"):
        scarce = [label for label, count in frame[column].value_counts().items() if count < 10]
        if scarce:
            print(f"[경고] {file_name} {column} 10건 미만: {', '.join(scarce)}")
    return errors


def _excluded_counts(folder_name: str) -> None:
    counts: dict[str, int] = {}
    for path in (RAW_DATA_DIR / folder_name).glob("*.csv"):
        try:
            frame = pd.read_csv(path, encoding="utf-8-sig").fillna("")
        except Exception:
            continue
        for reason, count in frame.get("exclusionReason", pd.Series(dtype=str)).value_counts().items():
            counts[str(reason)] = counts.get(str(reason), 0) + int(count)
    print(f"\n{folder_name}: {counts}")


def main() -> int:
    errors = []
    for spec in DATASETS:
        errors.extend(_validate(*spec))
    training_path = RAW_DATA_DIR / "documents_training.csv"
    if training_path.exists():
        training = pd.read_csv(training_path, dtype=str, encoding="utf-8-sig").fillna("")
        _print_public_api_target_stats(training)
        category_counts = training["category"].value_counts()
        target_counts = training["accessibilityTarget"].value_counts()
        goals = (
            ("보조기기 category 25건", int(category_counts.get("보조기기", 0)), 25),
            ("HEARING_IMPAIRED 25건", int(target_counts.get("HEARING_IMPAIRED", 0)), 25),
            ("VISUAL_IMPAIRED 25건", int(target_counts.get("VISUAL_IMPAIRED", 0)), 25),
            ("VISUAL_HEARING_IMPAIRED 8건", int(target_counts.get("VISUAL_HEARING_IMPAIRED", 0)), 8),
            ("재난/안전 30건", int(category_counts.get("재난/안전", 0)), 30),
            ("권리/차별 25건", int(category_counts.get("권리/차별", 0)), 25),
        )
        print("\n부족 라벨 목표 확인")
        for label, actual, target in goals:
            status = "충족" if actual >= target else "미충족 - 실제 수집 데이터 부족"
            print(f"  {label}: {status} ({actual}/{target})")
    _excluded_counts("excluded_by_year")
    _excluded_counts("excluded_by_relevance")
    for error in errors:
        print(f"[오류] {error}")
    if errors:
        return 1
    print("\n[성공] 앱/RAG용 및 학습용 데이터셋 검증을 통과했습니다.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
