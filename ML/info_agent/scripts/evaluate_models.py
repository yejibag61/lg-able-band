"""Evaluate category and priority classifiers with stratified cross-validation."""

from model_training_utils import evaluate_label


if __name__ == "__main__":
    evaluate_label("category")
    evaluate_label("priority")
