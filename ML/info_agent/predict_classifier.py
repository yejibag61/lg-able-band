"""Run the three pre-trained info-agent classifiers with rule corrections."""

import sys
from pathlib import Path
from typing import Any

import joblib


MODULE_DIR = Path(__file__).resolve().parent
if str(MODULE_DIR) not in sys.path:
    sys.path.insert(0, str(MODULE_DIR))

from transformer_joblib_model import JoblibTransformerClassifier  # noqa: E402,F401


MODEL_DIR = MODULE_DIR / "models"
MODEL_PATHS = {
    "category": MODEL_DIR / "category_classifier.joblib",
    "accessibilityTarget": MODEL_DIR / "accessibility_target_classifier.joblib",
    "priority": MODEL_DIR / "priority_classifier.joblib",
}


def _load_models() -> dict[str, Any]:
    missing = [str(path) for path in MODEL_PATHS.values() if not path.is_file()]
    if missing:
        raise FileNotFoundError(
            "Required classifier model file(s) not found: " + ", ".join(missing)
        )
    return {name: joblib.load(path) for name, path in MODEL_PATHS.items()}


MODELS = _load_models()

VISUAL_HEARING_KEYWORDS = (
    "시청각장애",
    "시청각 장애",
    "농맹",
    "deafblind",
    "헬렌켈러",
    "헬렌 켈러",
    "촉수어",
    "점화",
    "촉각 수어",
)
VISUAL_HEARING_SUPPORT_KEYWORDS = (
    "지원",
    "제도",
    "서비스",
    "의사소통",
    "통역",
    "안내",
)
HEARING_KEYWORDS = (
    "청각장애",
    "청각 장애",
    "농인",
    "수어",
    "수화",
    "수어통역",
    "수화통역",
    "문자통역",
    "자막",
    "초인종",
    "보청기",
    "인공와우",
    "소리 알림",
    "진동 알림",
)
VISUAL_KEYWORDS = (
    "시각장애",
    "시각 장애",
    "점자",
    "점자정보단말기",
    "화면해설",
    "스크린리더",
    "음성안내",
    "음성 안내",
    "안내견",
    "점자블록",
    "음성유도기",
)
PHYSICAL_KEYWORDS = (
    "지체장애",
    "지체 장애",
    "휠체어",
    "전동휠체어",
    "전동스쿠터",
    "이동지원",
    "활동지원",
)
COMMUNICATION_SUPPORT_KEYWORDS = (
    "수어통역",
    "수화통역",
    "문자통역",
    "의사소통 지원",
    "통역 지원",
    "의사소통 서비스",
)
ASSISTIVE_DEVICE_KEYWORDS = (
    "보조기기",
    "보조 기기",
    "보조공학",
    "보조 공학",
    "정보통신 보조기기",
    "보청기",
    "인공와우",
    "점자정보단말기",
    "화면해설",
    "스크린리더",
    "AI 보조기기",
    "스마트 보조기기",
)
ASSISTIVE_DEVICE_SUPPORT_KEYWORDS = (
    "지원",
    "신청",
    "지원사업",
    "지원 사업",
    "받을 수",
    "지원 받을",
)
RIGHTS_KEYWORDS = (
    "차별",
    "권리",
    "인권",
    "이동권",
    "접근권",
    "편의제공",
    "정당한 편의",
    "권리구제",
    "인권위",
    "진정",
    "신고",
)
RIGHTS_HIGH_KEYWORDS = (
    "차별",
    "신고",
    "진정",
    "인권위",
    "권리구제",
    "정당한 편의",
)
MEDICAL_KEYWORDS = (
    "의료",
    "건강",
    "병원",
    "진료",
    "재활",
    "의료비",
    "치료비",
)
DISASTER_KEYWORDS = (
    "재난",
    "안전",
    "화재",
    "폭염",
    "위험",
    "태풍",
    "재난문자",
    "긴급",
    "위기",
    "응급",
    "대피",
)
DISASTER_URGENT_KEYWORDS = (
    "화재",
    "폭염",
    "재난",
    "위험",
    "태풍",
    "긴급",
    "위기",
    "응급",
    "사고",
    "대피",
)


def _contains(text: str, keywords: tuple[str, ...]) -> bool:
    return any(keyword.lower() in text for keyword in keywords)


def _apply_rules(text: str, prediction: dict[str, str]) -> tuple[dict[str, str], bool]:
    final = prediction.copy()
    rule_applied = False

    if _contains(text, HEARING_KEYWORDS):
        final["accessibilityTarget"] = "HEARING_IMPAIRED"
        rule_applied = True

    if _contains(text, VISUAL_KEYWORDS):
        final["accessibilityTarget"] = "VISUAL_IMPAIRED"
        rule_applied = True

    if _contains(text, PHYSICAL_KEYWORDS):
        final["accessibilityTarget"] = "PHYSICAL_IMPAIRED"
        rule_applied = True

    if _contains(text, COMMUNICATION_SUPPORT_KEYWORDS):
        final["category"] = "복지지원"
        final["priority"] = "HIGH"
        rule_applied = True

    if _contains(text, ASSISTIVE_DEVICE_KEYWORDS):
        final["category"] = "보조기기"
        rule_applied = True
        if _contains(text, ASSISTIVE_DEVICE_SUPPORT_KEYWORDS):
            final["priority"] = "HIGH"

    if _contains(text, RIGHTS_KEYWORDS):
        final["category"] = "권리/차별"
        rule_applied = True
        if _contains(text, RIGHTS_HIGH_KEYWORDS):
            final["priority"] = "HIGH"

    if _contains(text, MEDICAL_KEYWORDS):
        final["category"] = "의료/건강"
        if final.get("priority") == "LOW":
            final["priority"] = "MEDIUM"
        rule_applied = True

    if _contains(text, DISASTER_KEYWORDS):
        final["category"] = "재난/안전"
        rule_applied = True
        if _contains(text, DISASTER_URGENT_KEYWORDS):
            final["priority"] = "URGENT"

    # Keep the legacy combined target path even though the new model predicts
    # only ALL, HEARING_IMPAIRED, PHYSICAL_IMPAIRED, and VISUAL_IMPAIRED.
    if _contains(text, VISUAL_HEARING_KEYWORDS):
        final["accessibilityTarget"] = "VISUAL_HEARING_IMPAIRED"
        rule_applied = True
        if _contains(text, VISUAL_HEARING_SUPPORT_KEYWORDS):
            final["category"] = "복지지원"
            final["priority"] = "HIGH"

    return final, rule_applied


def predict_info_agent(text: str, use_rule: bool = True) -> dict:
    """Predict category, accessibility target, and priority for a user query."""
    if not isinstance(text, str) or not text.strip():
        raise ValueError("text must be a non-empty string")

    query = text.strip()
    raw_prediction = {
        name: str(model.predict([query])[0])
        for name, model in MODELS.items()
    }
    final_prediction, _ = (
        _apply_rules(query.lower(), raw_prediction)
        if use_rule
        else (raw_prediction.copy(), False)
    )
    rule_applied = raw_prediction != final_prediction

    return {
        "query": query,
        "rawPrediction": raw_prediction,
        "finalPrediction": final_prediction,
        "ruleApplied": rule_applied,
    }
