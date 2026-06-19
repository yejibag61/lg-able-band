"""Priority prediction with an optional joblib model and rule fallback."""

import sys
from pathlib import Path
from typing import Any, Optional, Tuple


MODULE_DIR = Path(__file__).resolve().parents[1]
if str(MODULE_DIR) not in sys.path:
    sys.path.insert(0, str(MODULE_DIR))

from transformer_joblib_model import JoblibTransformerClassifier  # noqa: E402,F401


MODEL_PATH = MODULE_DIR / "models" / "priority_classifier.joblib"

PRIORITY_RULES = [
    ("URGENT", ("폭염", "화재", "재난", "대피", "긴급", "위험")),
    ("HIGH", ("지원사업", "신청", "모집", "마감", "보조기기")),
    ("MEDIUM", ("복지서비스", "활동지원", "취업", "교육", "직업", "훈련")),
    ("LOW", ("일반 기사", "칼럼", "소식", "뉴스")),
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


def predict_priority(text: str) -> Tuple[str, float]:
    model = _load_model()
    if model is not None:
        try:
            return str(model.predict([text])[0]).upper(), round(_model_confidence(model, text), 3)
        except Exception:
            pass

    normalized = text.lower()
    priority, matches = max(
        ((priority, sum(keyword in normalized for keyword in keywords)) for priority, keywords in PRIORITY_RULES),
        key=lambda result: result[1],
    )
    if matches:
        return priority, min(0.97, 0.65 + matches * 0.07)
    return "LOW", 0.5
