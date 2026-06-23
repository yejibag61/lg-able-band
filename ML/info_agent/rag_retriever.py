"""TF-IDF document retrieval using the info-agent classifier results."""

import json
import sys
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    __package__ = "info_agent"

from .predict_classifier import predict_info_agent


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
    "serviceArea",
    "region",
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
    (
        "교통비", "교통 지원", "이동지원", "이동 지원", "교통약자",
        "장애인 콜택시", "콜택시", "바우처택시", "바우처 택시",
        "특별교통수단", "이동권", "대중교통", "택시비", "버스비", "지하철",
    ),
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
NATIONWIDE_SOURCE_HINTS = (
    "중앙부처",
    "보건복지부",
    "고용노동부",
    "행정안전부",
    "행안부",
    "소방청",
    "정책브리핑",
    "복지로",
    "공공데이터포털 중앙부처",
    "한국장애인개발원",
    "연구보고서",
)
LOCAL_SOURCE_HINTS = ("지자체", "시청", "구청", "군청", "도청", "주민센터")
REGION_ALIASES = {
    "서울": ("서울", "서울시", "서울특별시"),
    "부산": ("부산", "부산시", "부산광역시"),
    "대구": ("대구", "대구시", "대구광역시"),
    "인천": ("인천", "인천시", "인천광역시"),
    "광주": ("광주", "광주시", "광주광역시"),
    "대전": ("대전", "대전시", "대전광역시"),
    "울산": ("울산", "울산시", "울산광역시"),
    "세종": ("세종", "세종시", "세종특별자치시"),
    "경기": ("경기", "경기도"),
    "강원": ("강원", "강원도", "강원특별자치도"),
    "충북": ("충북", "충청북도"),
    "충남": ("충남", "충청남도"),
    "전북": ("전북", "전라북도", "전북특별자치도"),
    "전남": ("전남", "전라남도"),
    "경북": ("경북", "경상북도"),
    "경남": ("경남", "경상남도"),
    "제주": ("제주", "제주도", "제주특별자치도"),
    "수원": ("수원", "수원시"),
    "성남": ("성남", "성남시"),
    "고양": ("고양", "고양시"),
    "용인": ("용인", "용인시"),
    "평택": ("평택", "평택시"),
    "창원": ("창원", "창원시"),
}
REGION_PARENTS = {
    "수원": "경기",
    "성남": "경기",
    "고양": "경기",
    "용인": "경기",
    "평택": "경기",
    "창원": "경남",
}
INTENT_PROFILES = {
    "braille_device": ("점자정보단말기", "점자", "시각장애", "보조기기"),
    "discrimination": ("차별", "신고", "진정", "인권위", "권리구제", "인권"),
    "sign_language": ("수어통역", "수어", "통역", "청각장애", "의사소통"),
    "hearing_aid": ("보청기", "인공와우", "청각장애", "보조기기"),
    "assistive_device": ("보조기기", "보조공학", "장애인보조기기", "정보통신보조기기"),
    "medical_expense": ("장애인 의료비", "의료비 지원", "장애인의료비"),
    "transport": ("교통비", "교통 지원", "이동 지원", "이동지원", "교통약자", "장애인 콜택시", "콜택시", "특별교통수단", "이동권", "대중교통", "택시비", "버스비", "지하철"),
    "disaster": ("폭염", "화재", "재난", "안전", "긴급", "대피"),
}
SUPPORT_INTENT_KEYWORDS = ("신청 방법", "신청", "어떻게 신청", "문의처", "대상", "자격", "필요 서류", "어디에 문의", "알려줘")
TRANSPORT_QUERY_KEYWORDS = ("교통비", "교통 지원", "이동지원", "이동 지원", "교통약자", "장애인 콜택시", "콜택시", "바우처택시", "바우처 택시", "특별교통수단", "이동권", "대중교통", "택시비", "버스비", "지하철")
TRANSPORT_CONTEXT_KEYWORDS = ("교통", "이동", "택시", "콜택시", "대중교통", "교통약자", "특별교통수단", "이동권", "버스", "지하철", "바우처")
MEDICAL_CONTEXT_KEYWORDS = ("의료기관", "의료비", "본인부담금", "건강보험", "의료급여", "진료", "병원")
HEARING_AID_QUERY_KEYWORDS = ("보청기", "인공와우", "청각장애", "청각 보조기기")
HEARING_CONTEXT_KEYWORDS = ("장애인", "청각장애", "보조기기", "정보통신보조기기", "보청기", "인공와우", "난청")
ELDERLY_CENTERED_KEYWORDS = ("어르신", "노인", "고령자", "75세", "70세")
RIGHTS_REPORT_QUERY_KEYWORDS = ("차별", "신고", "진정", "어디에 신고", "권리구제", "인권위", "도움 요청")
RIGHTS_PROCEDURE_KEYWORDS = ("신고", "진정", "국가인권위원회", "인권위", "권리구제", "상담", "구제절차", "시정 권고")
RIGHTS_NEWS_ONLY_KEYWORDS = ("소송", "집회", "사과하라", "논평", "칼럼", "기자회견")
RIGHTS_ACTION_QUERY_KEYWORDS = ("어디에 신고", "신고", "진정", "권리구제", "상담", "피해")
RIGHTS_ACTION_DOCUMENT_KEYWORDS = (
    "신고접수",
    "신고 접수",
    "진정",
    "상담",
    "상담기관",
    "국가인권위원회",
    "인권위",
    "권리구제",
    "구제절차",
    "차별구제",
)
RIGHTS_STRONG_ACTION_DOCUMENT_KEYWORDS = (
    "신고접수",
    "신고 접수",
    "진정",
    "상담기관",
    "권리구제",
    "구제절차",
    "차별구제",
)
RIGHTS_ARTICLE_ONLY_KEYWORDS = (
    "시정 권고",
    "권고 수용",
    "투숙 거부",
    "응시자",
    "기자회견",
    "소송",
    "집회",
    "반발",
    "논평",
)
DISASTER_QUERY_KEYWORDS = ("폭염", "화재", "대피", "재난", "안전", "응급", "지진", "홍수")
DISASTER_PUBLIC_SOURCE_KEYWORDS = ("행정안전부", "행안부", "소방청", "보건복지부", "정책브리핑", "중앙부처", "공공기관", "한국장애인개발원")
SIGN_LANGUAGE_QUERY_KEYWORDS = ("수어통역", "수어 통역", "통역 지원", "청각장애 의사소통", "문자통역", "의사소통 지원")
SIGN_LANGUAGE_DIRECT_KEYWORDS = ("수어통역", "수어 통역", "통역서비스", "의사소통 지원", "청각장애")
SIGN_LANGUAGE_FALLBACK_KEYWORDS = ("문자통역", "문자 통역")
SIGN_LANGUAGE_WEAK_KEYWORDS = ("수어교실", "수어 교실", "교육", "행사", "규탄", "책임론", "전횡")
APPLICATION_ACTION_QUERY_KEYWORDS = ("신청 방법", "신청", "이용 방법", "지원 받을 수", "대상", "자격")
APPLICATION_ACTION_DOCUMENT_KEYWORDS = ("신청", "신청방법", "신청 방법", "접수", "이용 방법", "이용방법", "신청 절차", "전화", "인터넷", "모바일", "방문")
CONTACT_ACTION_QUERY_KEYWORDS = ("문의처", "문의", "상담")
CONTACT_ACTION_DOCUMENT_KEYWORDS = ("문의처", "연락처", "담당기관", "담당 부서", "상담", "전화")
NEWS_SOURCE_NAMES = ("더인디고", "에이블뉴스", "웰페어뉴스", "소셜포커스")


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


def _detect_query_regions(query: str) -> set[str]:
    normalized = str(query or "")
    regions: set[str] = set()
    for canonical, aliases in REGION_ALIASES.items():
        if any(alias in normalized for alias in aliases):
            regions.add(canonical)
            if canonical in REGION_PARENTS:
                regions.add(REGION_PARENTS[canonical])
    return regions


def _infer_document_scope_region(candidates: pd.DataFrame) -> tuple[pd.Series, pd.Series]:
    scopes = []
    regions = []
    for _, row in candidates.iterrows():
        text = " ".join(
            str(row.get(field, "") or "")
            for field in ("serviceArea", "region", "source", "title", "content")
        )
        explicit_region = str(row.get("region", "") or "").strip()
        matched_regions = [
            canonical
            for canonical, aliases in REGION_ALIASES.items()
            if any(alias in text for alias in aliases)
        ]
        region = explicit_region or (matched_regions[0] if matched_regions else "")
        scope_text = " ".join(
            str(row.get(field, "") or "")
            for field in ("serviceArea", "source", "sourceType", "title")
        )
        is_local = bool(region) or any(hint in scope_text for hint in LOCAL_SOURCE_HINTS)
        is_nationwide = (
            "전국" in text
            or "전국단위" in text
            or any(hint in scope_text for hint in NATIONWIDE_SOURCE_HINTS)
        )
        is_common_disaster_guide = (
            not is_local
            and any(keyword in text for keyword in DISASTER_QUERY_KEYWORDS)
            and any(keyword in text for keyword in ("장애", "재난안전", "대피", "대응", "가이드", "카드뉴스"))
        )
        if is_common_disaster_guide:
            is_nationwide = True
        if is_nationwide and not any(hint in scope_text for hint in LOCAL_SOURCE_HINTS):
            scope = "nationwide"
            region = region or "전국"
        elif is_local:
            scope = "local"
        else:
            scope = "unknown"
        scopes.append(scope)
        regions.append(region or ("전국" if scope == "nationwide" else ""))
    return pd.Series(scopes, index=candidates.index), pd.Series(regions, index=candidates.index)


def _scope_adjustment(query: str, candidates: pd.DataFrame) -> tuple[pd.Series, pd.Series, pd.Series]:
    query_regions = _detect_query_regions(query)
    scopes, regions = _infer_document_scope_region(candidates)
    adjustment = pd.Series(0.0, index=candidates.index)
    if query_regions:
        region_match = regions.apply(
            lambda value: bool(str(value).strip())
            and any(region in str(value) or str(value) in region for region in query_regions)
        )
        adjustment += (scopes.eq("local") & region_match).astype(float) * 0.35
        adjustment -= (scopes.eq("local") & ~region_match).astype(float) * 0.30
        adjustment += scopes.eq("nationwide").astype(float) * 0.08
    else:
        adjustment += scopes.eq("nationwide").astype(float) * 0.30
        adjustment += scopes.eq("unknown").astype(float) * 0.10
        adjustment -= scopes.eq("local").astype(float) * 0.45
    return adjustment, scopes, regions


def _intent_adjustment(query: str, candidates: pd.DataFrame) -> pd.Series:
    searchable = (
        candidates["title"]
        + " "
        + candidates["content"]
        + " "
        + candidates["targetKeywordGroup"]
        + " "
        + candidates["_importantText"]
    )
    adjustment = pd.Series(0.0, index=candidates.index)
    for keywords in INTENT_PROFILES.values():
        if not any(keyword in query for keyword in keywords):
            continue
        match_count = sum(
            searchable.str.contains(keyword, regex=False).astype(float)
            for keyword in keywords
        )
        title_match = sum(
            candidates["title"].str.contains(keyword, regex=False).astype(float)
            for keyword in keywords
        )
        adjustment += match_count.clip(upper=3) * 0.12
        adjustment += title_match.clip(upper=2) * 0.18
    if "점자정보단말기" in query or "점자" in query:
        adjustment += searchable.str.contains("정보통신보조기기", regex=False).astype(float) * 0.55
        adjustment += searchable.str.contains("시각장애", regex=False).astype(float) * 0.25
        adjustment -= candidates["title"].str.contains("수리", regex=False).astype(float) * 0.45
    if "수리" not in query:
        adjustment -= candidates["title"].str.contains("수리", regex=False).astype(float) * 0.10
    return adjustment


def _contains_keyword(series: pd.Series, keywords: tuple[str, ...]) -> pd.Series:
    if not keywords:
        return pd.Series(False, index=series.index)
    return sum(
        series.str.contains(keyword, regex=False).astype(int)
        for keyword in keywords
    ).astype(bool)


def _match_count(series: pd.Series, keywords: tuple[str, ...]) -> pd.Series:
    if not keywords:
        return pd.Series(0.0, index=series.index)
    return sum(
        series.str.contains(keyword, regex=False).astype(float)
        for keyword in keywords
    )


def _query_intent_adjustment(
    query: str,
    candidates: pd.DataFrame,
    classification: dict[str, str],
) -> tuple[pd.Series, pd.Series, pd.Series, pd.Series, pd.Series]:
    title = candidates["title"]
    content = candidates["content"]
    source = candidates["source"]
    target_group = candidates["targetKeywordGroup"]
    important_text = candidates["_importantText"]
    searchable = title + " " + content + " " + source + " " + target_group + " " + important_text

    query_intent = pd.Series(0.0, index=candidates.index)
    core_topic = pd.Series(0.0, index=candidates.index)
    disability_context = pd.Series(0.0, index=candidates.index)
    source_reliability = pd.Series(0.0, index=candidates.index)
    document_penalty = pd.Series(0.0, index=candidates.index)

    is_nationwide = candidates.get("_serviceScope", pd.Series("", index=candidates.index)).eq("nationwide")
    is_local = candidates.get("_serviceScope", pd.Series("", index=candidates.index)).eq("local")
    query_regions = _detect_query_regions(query)
    has_region_query = bool(query_regions)
    candidate_regions = candidates.get("_region", pd.Series("", index=candidates.index))
    region_match = candidate_regions.apply(
        lambda value: bool(str(value).strip())
        and any(region in str(value) or str(value) in region for region in query_regions)
    )
    central_source = _contains_keyword(source, NATIONWIDE_SOURCE_HINTS)
    public_api = candidates["sourceType"].eq("PUBLIC_API")
    accessibility_match = candidates["accessibilityTarget"].isin(
        (classification.get("accessibilityTarget", ""), "ALL")
    )

    if any(keyword in query for keyword in TRANSPORT_QUERY_KEYWORDS):
        active_transport_keywords = tuple(
            keyword for keyword in TRANSPORT_QUERY_KEYWORDS if keyword in query
        ) or TRANSPORT_QUERY_KEYWORDS
        title_matches = _match_count(title, active_transport_keywords)
        exact_topic_matches = _match_count(title + " " + content, active_transport_keywords)
        content_matches = _match_count(searchable, TRANSPORT_CONTEXT_KEYWORDS)
        category_match = candidates["category"].eq("이동/교통")
        medical_doc = (
            candidates["category"].eq("의료/건강")
            | _contains_keyword(title + " " + content, MEDICAL_CONTEXT_KEYWORDS)
            | title.str.replace(" ", "", regex=False).str.contains("장애인의료비지원", regex=False)
        )
        core_missing = ~_contains_keyword(title + " " + content, TRANSPORT_CONTEXT_KEYWORDS)

        core_topic += title_matches.clip(upper=2) * 0.95
        core_topic += exact_topic_matches.clip(upper=3) * 0.35
        core_topic += content_matches.clip(upper=4) * 0.18
        core_topic += category_match.astype(float) * 0.50
        disability_context += accessibility_match.astype(float) * 0.10
        document_penalty -= (medical_doc).astype(float) * 1.25
        document_penalty -= (core_missing).astype(float) * 0.65
        if any(keyword in query for keyword in SUPPORT_INTENT_KEYWORDS):
            document_penalty -= (core_missing & ~category_match).astype(float) * 0.35

    if any(keyword in query for keyword in HEARING_AID_QUERY_KEYWORDS):
        title_matches = _match_count(title, HEARING_AID_QUERY_KEYWORDS)
        content_matches = _match_count(searchable, HEARING_CONTEXT_KEYWORDS)
        disability_matches = _match_count(searchable, HEARING_CONTEXT_KEYWORDS)
        elderly_centered = _contains_keyword(title + " " + content, ELDERLY_CENTERED_KEYWORDS)
        weak_disability_context = disability_matches < 2

        query_intent += title_matches.clip(upper=2) * 0.45
        query_intent += content_matches.clip(upper=4) * 0.18
        disability_context += disability_matches.clip(upper=4) * 0.12
        disability_context += accessibility_match.astype(float) * 0.20
        source_reliability += (central_source | is_nationwide | public_api).astype(float) * 0.35
        if not has_region_query:
            source_reliability += is_nationwide.astype(float) * 0.25
            document_penalty -= is_local.astype(float) * 0.45
            document_penalty -= (elderly_centered & weak_disability_context).astype(float) * 0.75
            document_penalty -= (elderly_centered & is_local).astype(float) * 0.35
        else:
            source_reliability += (is_local & region_match).astype(float) * 0.35
            document_penalty -= (is_local & ~region_match).astype(float) * 0.55
            document_penalty -= (elderly_centered & ~region_match).astype(float) * 0.35

    if any(keyword in query for keyword in RIGHTS_REPORT_QUERY_KEYWORDS):
        procedure_matches = _match_count(searchable, RIGHTS_PROCEDURE_KEYWORDS)
        title_procedure = _match_count(title, RIGHTS_PROCEDURE_KEYWORDS)
        news_only = _contains_keyword(title + " " + content, RIGHTS_NEWS_ONLY_KEYWORDS)
        has_contact_or_procedure = procedure_matches >= 2
        category_match = candidates["category"].eq("권리/차별")

        query_intent += title_procedure.clip(upper=2) * 0.45
        query_intent += procedure_matches.clip(upper=5) * 0.22
        disability_context += category_match.astype(float) * 0.25
        source_reliability += _contains_keyword(searchable, ("국가인권위원회", "인권위", "상담", "권리구제")).astype(float) * 0.35
        document_penalty -= (news_only & ~has_contact_or_procedure).astype(float) * 0.55
        document_penalty -= (source.isin(("더인디고", "에이블뉴스", "웰페어뉴스", "소셜포커스")) & ~has_contact_or_procedure).astype(float) * 0.25

    if any(keyword in query for keyword in DISASTER_QUERY_KEYWORDS):
        disaster_title_matches = _match_count(title, DISASTER_QUERY_KEYWORDS)
        disaster_matches = _match_count(searchable, DISASTER_QUERY_KEYWORDS)
        public_disaster_source = _contains_keyword(searchable, DISASTER_PUBLIC_SOURCE_KEYWORDS)
        category_match = candidates["category"].eq("재난/안전")
        urgent_match = candidates["priority"].eq("URGENT")

        query_intent += disaster_title_matches.clip(upper=2) * 0.35
        query_intent += disaster_matches.clip(upper=4) * 0.15
        disability_context += category_match.astype(float) * 0.25
        disability_context += urgent_match.astype(float) * 0.15
        source_reliability += (public_disaster_source | is_nationwide).astype(float) * 0.35
        if not has_region_query:
            source_reliability += is_nationwide.astype(float) * 0.20

    return query_intent, core_topic, disability_context, source_reliability, document_penalty


def _action_intent_adjustment(
    query: str,
    candidates: pd.DataFrame,
    classification: dict[str, str],
) -> pd.Series:
    title = candidates["title"]
    content = candidates["content"]
    source = candidates["source"]
    important_text = candidates["_importantText"]
    searchable = title + " " + content + " " + source + " " + important_text
    score = pd.Series(0.0, index=candidates.index)

    asks_application = any(keyword in query for keyword in APPLICATION_ACTION_QUERY_KEYWORDS)
    asks_contact = any(keyword in query for keyword in CONTACT_ACTION_QUERY_KEYWORDS)
    asks_rights_report = (
        any(keyword in query for keyword in RIGHTS_ACTION_QUERY_KEYWORDS)
        and any(keyword in query for keyword in ("차별", "인권", "피해", "신고", "진정"))
    )
    asks_sign_language = any(keyword in query for keyword in SIGN_LANGUAGE_QUERY_KEYWORDS)
    asks_transport = any(keyword in query for keyword in TRANSPORT_QUERY_KEYWORDS)
    has_region_query = bool(_detect_query_regions(query))
    is_local = candidates.get("_serviceScope", pd.Series("", index=candidates.index)).eq("local")
    is_nationwide = candidates.get("_serviceScope", pd.Series("", index=candidates.index)).eq("nationwide")
    is_news_source = source.isin(NEWS_SOURCE_NAMES)

    if asks_application:
        has_application_info = _contains_keyword(searchable, APPLICATION_ACTION_DOCUMENT_KEYWORDS)
        active_transport_keywords = tuple(keyword for keyword in TRANSPORT_QUERY_KEYWORDS if keyword in query)
        title_topic_match = _contains_keyword(title, active_transport_keywords)
        score += has_application_info.astype(float) * 0.75
        score += (has_application_info & title_topic_match).astype(float) * 0.45
        score -= (is_news_source & ~has_application_info).astype(float) * 0.75

    if asks_contact:
        has_contact_info = _contains_keyword(searchable, CONTACT_ACTION_DOCUMENT_KEYWORDS)
        score += has_contact_info.astype(float) * 0.65
        score -= (is_news_source & ~has_contact_info).astype(float) * 0.45

    if asks_transport and not has_region_query:
        transport_topic = _contains_keyword(title + " " + content, TRANSPORT_CONTEXT_KEYWORDS)
        active_transport_keywords = tuple(keyword for keyword in TRANSPORT_QUERY_KEYWORDS if keyword in query)
        exact_title = _contains_keyword(title, active_transport_keywords)
        public_transport_guide = (
            (is_nationwide | _contains_keyword(source, NATIONWIDE_SOURCE_HINTS))
            & transport_topic
        )
        score += public_transport_guide.astype(float) * 0.65
        score += (is_local & exact_title).astype(float) * 0.25
        score -= (is_news_source & ~_contains_keyword(searchable, APPLICATION_ACTION_DOCUMENT_KEYWORDS)).astype(float) * 0.55

    if asks_sign_language:
        direct_matches = _match_count(searchable, SIGN_LANGUAGE_DIRECT_KEYWORDS)
        fallback_matches = _match_count(searchable, SIGN_LANGUAGE_FALLBACK_KEYWORDS)
        weak_matches = _contains_keyword(title + " " + content, SIGN_LANGUAGE_WEAK_KEYWORDS)
        support_context = (
            candidates["category"].isin(("복지지원", "보조기기"))
            | candidates["accessibilityTarget"].isin(("HEARING_IMPAIRED", "ALL"))
        )
        action_info = _contains_keyword(searchable, APPLICATION_ACTION_DOCUMENT_KEYWORDS + CONTACT_ACTION_DOCUMENT_KEYWORDS)
        score += direct_matches.clip(upper=3) * 0.40
        score += fallback_matches.clip(upper=2) * 0.22
        score += (support_context & action_info).astype(float) * 0.55
        score -= weak_matches.astype(float) * 0.85
        score -= (is_news_source & ~action_info).astype(float) * 0.45

    if "점자정보단말기" in query or "점자" in query:
        central_assistive_guide = (
            title.str.contains("정보통신보조기기 보급", regex=False)
            | (
                title.str.contains("정보통신보조기기", regex=False)
                & source.eq(CENTRAL_WELFARE_SOURCE)
            )
        )
        score += central_assistive_guide.astype(float) * 1.15
        score -= is_news_source.astype(float) * 0.85

    if asks_rights_report:
        action_matches = _match_count(searchable, RIGHTS_ACTION_DOCUMENT_KEYWORDS)
        strong_action_matches = _match_count(searchable, RIGHTS_STRONG_ACTION_DOCUMENT_KEYWORDS)
        article_only = _contains_keyword(title + " " + content, RIGHTS_ARTICLE_ONLY_KEYWORDS)
        has_action_fields = candidates["_importantFields"].apply(
            lambda fields: bool(
                str(fields.get("applyMethod") or fields.get("applicationMethod") or fields.get("contact") or "").strip()
            )
        )
        rights_context = (
            candidates["category"].eq("권리/차별")
            | _contains_keyword(title + " " + content, ("장애", "차별", "인권"))
        )
        score += action_matches.clip(upper=4) * 0.22
        score += strong_action_matches.clip(upper=3) * 0.95
        score += (rights_context & (has_action_fields | (strong_action_matches >= 1))).astype(float) * 0.85
        score -= (article_only & ~has_action_fields).astype(float) * 1.10
        score -= (is_news_source & ~has_action_fields & (strong_action_matches < 1)).astype(float) * 1.75

    return score


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
    classification = prediction["finalPrediction"].copy()
    if any(keyword in query for keyword in TRANSPORT_QUERY_KEYWORDS):
        classification["category"] = "이동/교통"
        if classification.get("priority") == "LOW":
            classification["priority"] = "HIGH"
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
    (
        candidates["_scopeAdjustment"],
        candidates["_serviceScope"],
        candidates["_region"],
    ) = _scope_adjustment(query, candidates)
    candidates["_intentAdjustment"] = _intent_adjustment(query, candidates)
    (
        candidates["_queryIntentScore"],
        candidates["_queryCoreTopicScore"],
        candidates["_disabilityContextScore"],
        candidates["_sourceReliabilityScore"],
        candidates["_documentTypePenalty"],
    ) = _query_intent_adjustment(query, candidates, classification)
    candidates["_actionIntentScore"] = _action_intent_adjustment(
        query,
        candidates,
        classification,
    )
    candidates["_finalScore"] = (
        candidates["_similarityScore"]
        + candidates["_keywordBoost"]
        + candidates["_sourceTypeBoost"]
        + candidates["_requestedFieldBoost"]
        + candidates["_deafblindBoost"]
        + candidates["_generalMedicalAdjustment"]
        + candidates["_scopeAdjustment"]
        + candidates["_intentAdjustment"]
        + candidates["_queryIntentScore"]
        + candidates["_queryCoreTopicScore"]
        + candidates["_disabilityContextScore"]
        + candidates["_sourceReliabilityScore"]
        + candidates["_documentTypePenalty"]
        + candidates["_actionIntentScore"]
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
                "serviceScope": document["_serviceScope"],
                "region": document["_region"],
                "selectionScores": {
                    "similarity": round(float(document["_similarityScore"]), 4),
                    "keywordBoost": round(float(document["_keywordBoost"]), 4),
                    "intentAdjustment": round(float(document["_intentAdjustment"]), 4),
                    "queryIntentScore": round(float(document["_queryIntentScore"]), 4),
                    "queryCoreTopicScore": round(float(document["_queryCoreTopicScore"]), 4),
                    "disabilityContextScore": round(float(document["_disabilityContextScore"]), 4),
                    "scopeAdjustment": round(float(document["_scopeAdjustment"]), 4),
                    "sourceReliabilityScore": round(float(document["_sourceReliabilityScore"]), 4),
                    "documentTypePenalty": round(float(document["_documentTypePenalty"]), 4),
                    "actionIntentScore": round(float(document["_actionIntentScore"]), 4),
                    "categoryBoost": 0.15 if document["category"] == classification["category"] else 0.0,
                    "priorityBoost": 0.05 if document["priority"] == classification["priority"] else 0.0,
                },
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
