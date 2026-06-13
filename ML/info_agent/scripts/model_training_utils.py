"""Shared classifier training and evaluation helpers."""

from pathlib import Path

import joblib
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report
from sklearn.model_selection import StratifiedKFold, cross_val_predict, train_test_split
from sklearn.pipeline import Pipeline

from collector_utils import INFO_AGENT_DIR


TRAINING_PATH = INFO_AGENT_DIR / "data" / "raw" / "documents_training.csv"
FALLBACK_PATH = INFO_AGENT_DIR / "data" / "raw" / "documents.csv"
MODELS_DIR = INFO_AGENT_DIR / "models"


def load_training_data(label_column: str) -> tuple[pd.Series, pd.Series, Path]:
    path = TRAINING_PATH if TRAINING_PATH.exists() else FALLBACK_PATH
    frame = pd.read_csv(path, encoding="utf-8-sig").fillna("")
    if label_column not in frame or frame[label_column].nunique() < 2:
        raise ValueError(f"{label_column} 학습에 필요한 라벨이 부족합니다.")
    labels = frame[label_column].astype(str)
    if labels.value_counts().min() < 2:
        raise ValueError(f"{label_column} stratify를 위해 라벨별 최소 2건이 필요합니다.")
    text = (frame["title"].astype(str) + " " + frame["content"].astype(str)).str.strip()
    return text, labels, path


def build_pipeline() -> Pipeline:
    return Pipeline([
        ("tfidf", TfidfVectorizer(ngram_range=(1, 2), min_df=1, max_df=0.98, sublinear_tf=True)),
        ("classifier", LogisticRegression(max_iter=2000, class_weight="balanced", random_state=42)),
    ])


def train_and_save(label_column: str, model_name: str) -> None:
    text, labels, path = load_training_data(label_column)
    x_train, x_test, y_train, y_test = train_test_split(
        text, labels, test_size=0.2, random_state=42, stratify=labels,
    )
    model = build_pipeline()
    model.fit(x_train, y_train)
    print(classification_report(y_test, model.predict(x_test), zero_division=0))
    model.fit(text, labels)
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    output = MODELS_DIR / model_name
    joblib.dump(model, output)
    print(f"{label_column} 모델 저장: {output} (학습 데이터: {path.name}, {len(labels)}건)")


def evaluate_label(label_column: str) -> None:
    text, labels, path = load_training_data(label_column)
    splits = min(5, int(labels.value_counts().min()))
    cv = StratifiedKFold(n_splits=splits, shuffle=True, random_state=42)
    predictions = cross_val_predict(build_pipeline(), text, labels, cv=cv)
    print(f"\n=== {label_column} ({path.name}, {splits}-fold) ===")
    print(classification_report(labels, predictions, zero_division=0))
