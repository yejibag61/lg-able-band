"""TF-IDF document retrieval using the info-agent classifier results."""

import json
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

try:
    from .predict_classifier import predict_info_agent
except ImportError:
    from predict_classifier import predict_info_agent


MODULE_DIR = Path(__file__).resolve().parent
BOKJIRO_DOCUMENT_PATH = MODULE_DIR / "data" / "bokjiro_documents.csv"
DOCUMENT_PATHS = (
    MODULE_DIR / "data" / "processed" / "documents_enriched.csv",
    MODULE_DIR / "documents.csv",
    MODULE_DIR / "data" / "raw" / "documents.csv",
)
RESULT_COLUMNS = (
    "docId",
    "title",
    "content",
    "source",
    "sourceType",
    "url",
    "category",
    "accessibilityTarget",
    "priority",
    "appRelevanceScore",
    "appUseCase",
    "targetKeywordGroup",
    "importantFields",
    "importantFieldQuality",
)
SEARCHABLE_IMPORTANT_FIELDS = (
    "supportTarget",
    "eligibility",
    "applicationTarget",
    "selectionCriteria",
    "ageCondition",
    "incomeCondition",
    "regionCondition",
    "supportContent",
    "applyMethod",
    "applicationMethod",
    "applicationPeriod",
    "contact",
    "requiredDocuments",
)
EXACT_KEYWORD_GROUPS = (
    ("수어통역", "수화통역", "문자통역", "의사소통 지원", "수어", "수화"),
    ("폭염", "화재", "대피", "재난"),
    ("차별", "신고", "인권위", "권리구제"),
    ("점자정보단말기", "보청기", "인공와우", "보조기기"),
    ("의료비",),
    ("취업",),
    ("교육",),
    ("이동지원", "이동 지원"),
)
APPLICATION_KEYWORDS = ("지원", "신청", "받을 수", "지원사업", "서비스")
DISASTER_KEYWORDS = ("폭염", "화재", "대피", "재난", "긴급", "위험", "응급")
SPECIFIC_DISABILITY_KEYWORDS = (
    "신장장애",
    "청각장애",
    "시각장애",
    "지체장애",
    "발달장애",
    "뇌병변",
    "정신장애",
    "자폐성장애",
    "지적장애",
    "간장애",
    "호흡기장애",
    "심장장애",
    "안면장애",
    "장루",
    "요루",
    "뇌전증",
)
GENERAL_MEDICAL_EXPENSE_KEYWORDS = ("장애인 의료비", "의료비 지원", "장애인의료비")
CENTRAL_WELFARE_SOURCE = "공공데이터포털 중앙부처복지서비스"


def _find_documents_path() -> Path:
    for path in DOCUMENT_PATHS:
        if path.is_file():
            return path
    raise FileNotFoundError(
        "documents.csv not found. Checked: "
        + ", ".join(str(path) for path in DOCUMENT_PATHS)
    )


def _parse_important_fields(value: Any) -> dict[str, str]:
    if isinstance(value, dict):
        return {str(key): str(item) for key, item in value.items() if item}
    if not isinstance(value, str) or not value.strip():
        return {}
    try:
        parsed = json.loads(value)
    except (TypeError, ValueError, json.JSONDecodeError):
        return {}
    if not isinstance(parsed, dict):
        return {}
    return {str(key): str(item) for key, item in parsed.items() if item}


def _load_documents() -> pd.DataFrame:
    documents = pd.read_csv(_find_documents_path(), encoding="utf-8-sig")
    if BOKJIRO_DOCUMENT_PATH.is_file() and BOKJIRO_DOCUMENT_PATH.stat().st_size:
        try:
            bokjiro = pd.read_csv(BOKJIRO_DOCUMENT_PATH, encoding="utf-8-sig").fillna("")
            if not bokjiro.empty:
                important_columns = (
                    "supportTarget", "selectionCriteria", "applicationMethod", "contact"
                )
                for column in important_columns:
                    if column not in bokjiro.columns:
                        bokjiro[column] = ""
                has_detail = bokjiro[list(important_columns)].apply(
                    lambda row: any(str(value).strip() for value in row),
                    axis=1,
                )
                bokjiro = bokjiro.loc[has_detail].copy()
                if "importantFields" not in bokjiro.columns:
                    bokjiro["importantFields"] = ""
                for index, row in bokjiro.iterrows():
                    fields = _parse_important_fields(row.get("importantFields", ""))
                    for field in important_columns:
                        value = str(row.get(field, "")).strip()
                        if value:
                            fields[field] = value
                    bokjiro.at[index, "importantFields"] = json.dumps(fields, ensure_ascii=False)
                documents = pd.concat([documents, bokjiro], ignore_index=True, sort=False)
        except (OSError, ValueError, pd.errors.ParserError, UnicodeError):
            pass
    for column in RESULT_COLUMNS:
        if column not in documents.columns:
            documents[column] = ""

    text_columns = [column for column in RESULT_COLUMNS if column != "appRelevanceScore"]
    documents[text_columns] = documents[text_columns].fillna("").astype(str)
    documents["appRelevanceScore"] = pd.to_numeric(
        documents["appRelevanceScore"], errors="coerce"
    ).fillna(0.0)
    documents["_importantFields"] = documents["importantFields"].apply(
        _parse_important_fields
    )
    documents["_importantText"] = documents["_importantFields"].apply(
        lambda fields: " ".join(
            str(fields.get(field, "")).strip()
            for field in SEARCHABLE_IMPORTANT_FIELDS
            if str(fields.get(field, "")).strip()
        )
    )
    return documents


DOCUMENTS = _load_documents()
DOCUMENT_TEXTS = (
    DOCUMENTS["title"].str.strip()
    + " "
    + DOCUMENTS["content"].str.strip()
    + " "
    + DOCUMENTS["_importantText"].str.strip()
).tolist()
DOCUMENT_TEXTS = [
    text if text.strip() else f"document {index}"
    for index, text in enumerate(DOCUMENT_TEXTS)
]
VECTORIZER = TfidfVectorizer(
    analyzer="char_wb",
    ngram_range=(2, 5),
    min_df=1,
    max_features=50000,
)
DOCUMENT_VECTORS = VECTORIZER.fit_transform(DOCUMENT_TEXTS)


def _select_candidates(
    classification: dict[str, str], top_k: int, keyword_matches: np.ndarray
) -> tuple[np.ndarray, bool, str]:
    category = classification["category"]
    target = classification["accessibilityTarget"]
    category_matches = DOCUMENTS["category"].eq(category)
    target_matches = DOCUMENTS["accessibilityTarget"].isin((target, "ALL"))

    keyword_match_series = pd.Series(keyword_matches, index=DOCUMENTS.index)
    category_target_indices = DOCUMENTS.index[
        (category_matches & target_matches) | keyword_match_series
    ].to_numpy()
    if len(category_target_indices) >= top_k:
        return category_target_indices, False, "category_target"

    category_indices = DOCUMENTS.index[category_matches | keyword_match_series].to_numpy()
    if len(category_indices) >= top_k:
        return category_indices, True, "category"

    return DOCUMENTS.index.to_numpy(), True, "all"


def _summary(content: str, limit: int = 160) -> str:
    normalized = " ".join(content.split())
    if len(normalized) <= limit:
        return normalized
    return normalized[: limit - 1].rstrip() + "…"


def _display_score(value: Any) -> int | float:
    score = float(value)
    return int(score) if score.is_integer() else round(score, 2)


def _query_keywords(query: str) -> list[str]:
    keywords = []
    for index, group in enumerate(EXACT_KEYWORD_GROUPS):
        matches = [keyword for keyword in group if keyword in query]
        if matches:
            keywords.extend(group if index == 0 else matches)
    return keywords


def _keyword_match_counts(query: str) -> np.ndarray:
    keywords = _query_keywords(query)
    if not keywords:
        return np.zeros(len(DOCUMENTS), dtype=float)
    searchable = (
        DOCUMENTS["title"]
        + " "
        + DOCUMENTS["content"]
        + " "
        + DOCUMENTS["targetKeywordGroup"]
        + " "
        + DOCUMENTS["_importantText"]
    ).str.lower()
    return sum(searchable.str.contains(keyword.lower(), regex=False).astype(float) for keyword in keywords).to_numpy()


def _is_general_medical_expense_query(query: str) -> bool:
    return any(keyword in query for keyword in GENERAL_MEDICAL_EXPENSE_KEYWORDS) and not any(
        keyword in query for keyword in SPECIFIC_DISABILITY_KEYWORDS
    )


def _general_medical_expense_adjustment(candidates: pd.DataFrame) -> pd.Series:
    normalized_titles = candidates["title"].str.replace(" ", "", regex=False)
    specific_title = candidates["title"].apply(
        lambda title: any(keyword in title for keyword in SPECIFIC_DISABILITY_KEYWORDS)
    )
    local_or_narrow_title = candidates["title"].str.contains(
        "아동|입양|수술비", regex=True
    )

    adjustment = pd.Series(0.0, index=candidates.index)
    adjustment += normalized_titles.eq("장애인의료비지원").astype(float) * 0.55
    adjustment += normalized_titles.str.contains(
        "장애인의료비지원", regex=False
    ).astype(float) * 0.25
    adjustment += candidates["sourceType"].eq("PUBLIC_API").astype(float) * 0.08
    adjustment += candidates["source"].eq(CENTRAL_WELFARE_SOURCE).astype(float) * 0.25
    adjustment += candidates["accessibilityTarget"].eq("ALL").astype(float) * 0.10
    adjustment -= specific_title.astype(float) * 0.20
    adjustment -= local_or_narrow_title.astype(float) * 0.10
    adjustment -= (
        candidates["sourceType"].eq("PUBLIC_API")
        & ~candidates["source"].eq(CENTRAL_WELFARE_SOURCE)
    ).astype(float) * 0.05
    return adjustment


def search_documents(query: str, top_k: int = 5) -> dict:
    """Classify a query and return the highest-scoring relevant documents."""
    if not isinstance(query, str) or not query.strip():
        raise ValueError("query must be a non-empty string")
    if not isinstance(top_k, int) or top_k < 1:
        raise ValueError("top_k must be a positive integer")

    query = query.strip()
    prediction = predict_info_agent(query)
    classification = prediction["finalPrediction"]
    keyword_match_counts = _keyword_match_counts(query)
    candidate_keyword_matches = keyword_match_counts > 0
    if classification["accessibilityTarget"] == "VISUAL_HEARING_IMPAIRED":
        candidate_keyword_matches |= (
            DOCUMENTS["targetKeywordGroup"]
            .str.contains("DEAFBLIND_TARGET", regex=False)
            .to_numpy()
        )
    candidate_indices, fallback_used, fallback_level = _select_candidates(
        classification, top_k, candidate_keyword_matches
    )

    query_vector = VECTORIZER.transform([query])
    similarities = cosine_similarity(
        query_vector, DOCUMENT_VECTORS[candidate_indices]
    ).ravel()
    candidates = DOCUMENTS.loc[candidate_indices].copy()
    candidates["_similarityScore"] = similarities
    candidates["_keywordBoost"] = keyword_match_counts[candidate_indices] * 0.20
    asks_for_application = any(keyword in query for keyword in APPLICATION_KEYWORDS)
    allows_news = classification["category"] == "재난/안전" and any(
        keyword in query for keyword in DISASTER_KEYWORDS
    )
    candidates["_sourceTypeBoost"] = 0.0
    candidates["_requestedFieldBoost"] = 0.0
    if asks_for_application:
        candidates.loc[candidates["sourceType"].eq("PUBLIC_API"), "_sourceTypeBoost"] = 0.18
        has_application_method = candidates["_importantFields"].apply(
            lambda fields: bool(
                str(fields.get("applicationMethod") or fields.get("applyMethod") or "").strip()
            )
        )
        candidates.loc[has_application_method, "_requestedFieldBoost"] = 0.65
        candidates.loc[~has_application_method, "_requestedFieldBoost"] = -0.15
        if allows_news:
            candidates.loc[
                candidates["sourceType"].isin(("RSS", "NEWS_LIST")), "_sourceTypeBoost"
            ] = 0.10
    if classification["accessibilityTarget"] == "VISUAL_HEARING_IMPAIRED":
        candidates["_deafblindBoost"] = (
            candidates["targetKeywordGroup"]
            .str.contains("DEAFBLIND_TARGET", regex=False)
            .astype(float)
            * 0.45
        )
    else:
        candidates["_deafblindBoost"] = 0.0
    candidates["_generalMedicalAdjustment"] = (
        _general_medical_expense_adjustment(candidates)
        if _is_general_medical_expense_query(query)
        else 0.0
    )
    candidates["_finalScore"] = (
        candidates["_similarityScore"]
        + candidates["_keywordBoost"]
        + candidates["_sourceTypeBoost"]
        + candidates["_requestedFieldBoost"]
        + candidates["_deafblindBoost"]
        + candidates["_generalMedicalAdjustment"]
        + candidates["category"].eq(classification["category"]).astype(float) * 0.15
        + candidates["accessibilityTarget"]
        .isin((classification["accessibilityTarget"], "ALL"))
        .astype(float)
        * 0.10
        + candidates["priority"].eq(classification["priority"]).astype(float) * 0.05
        + candidates["appRelevanceScore"].clip(lower=0) / 1000.0
    )
    candidates = candidates.sort_values(
        ["_finalScore", "_similarityScore", "appRelevanceScore"],
        ascending=False,
        kind="stable",
    ).head(top_k)

    results = []
    for rank, (_, document) in enumerate(candidates.iterrows(), start=1):
        results.append(
            {
                "rank": rank,
                "docId": document["docId"],
                "title": document["title"],
                "summary": _summary(document["content"]),
                "source": document["source"],
                "sourceType": document["sourceType"],
                "url": document["url"],
                "category": document["category"],
                "accessibilityTarget": document["accessibilityTarget"],
                "priority": document["priority"],
                "appRelevanceScore": _display_score(document["appRelevanceScore"]),
                "appUseCase": document["appUseCase"],
                "targetKeywordGroup": document["targetKeywordGroup"],
                "importantFields": document["_importantFields"],
                "importantFieldQuality": document["importantFieldQuality"],
                "similarityScore": round(float(document["_similarityScore"]), 4),
                "finalScore": round(float(document["_finalScore"]), 4),
            }
        )

    return {
        "query": query,
        "classification": classification,
        "rawPrediction": prediction["rawPrediction"],
        "ruleApplied": prediction["ruleApplied"],
        "results": results,
        "resultCount": len(results),
        "fallbackUsed": fallback_used,
        "fallbackLevel": fallback_level,
    }
