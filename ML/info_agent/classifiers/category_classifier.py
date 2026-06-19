"""Category prediction with an optional joblib model and rule fallback."""

import sys
from pathlib import Path
from typing import Any, Optional, Tuple


MODULE_DIR = Path(__file__).resolve().parents[1]
if str(MODULE_DIR) not in sys.path:
    sys.path.insert(0, str(MODULE_DIR))

from transformer_joblib_model import JoblibTransformerClassifier  # noqa: E402,F401


MODEL_PATH = MODULE_DIR / "models" / "category_classifier.joblib"

CATEGORY_RULES = [
    ("재난/안전", ("폭염", "화재", "재난", "대피", "긴급", "지진")),
    ("보조기기", ("보조기기", "보청기", "점자", "화면낭독", "의사소통기기", "의사소통")),
    ("취업/교육", ("취업", "채용", "직업", "교육", "훈련")),
    ("의료/건강", ("의료", "건강", "병원", "진료", "재활", "예방")),
    ("이동/교통", ("이동", "보행", "교통", "버스", "지하철", "횡단보도")),
    ("권리/차별", ("권리", "차별", "인권", "학대")),
    ("지원사업/모집", ("지원사업", "신청", "모집", "마감", "접수")),
    ("복지지원", ("복지", "활동지원", "돌봄", "서비스", "급여")),
    ("일반뉴스", ("뉴스", "기사", "칼럼", "소식")),
]

_model: Optional[Any] = None
_load_attempted = False


def _load_model() -> Optional[Any]:
    global _model, _load_attempted
    if _load_attempted:
        return _model
    _load_attempted = True
    if not MODEL_PATH.exists():
        return None
    try:
        import joblib

        _model = joblib.load(MODEL_PATH)
    except Exception:
        _model = None
    return _model


def _model_confidence(model: Any, text: str) -> float:
    if hasattr(model, "predict_proba"):
        return float(max(model.predict_proba([text])[0]))
    return 0.85


def predict_category(text: str) -> Tuple[str, float]:
    model = _load_model()
    if model is not None:
        try:
            return str(model.predict([text])[0]), round(_model_confidence(model, text), 3)
        except Exception:
            pass

    normalized = text.lower()
    category, matches = max(
        ((category, sum(keyword in normalized for keyword in keywords)) for category, keywords in CATEGORY_RULES),
        key=lambda result: result[1],
    )
    if matches:
        return category, min(0.95, 0.62 + matches * 0.08)
    return "일반뉴스", 0.5
