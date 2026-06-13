"""Train the category classifier."""

from model_training_utils import train_and_save


if __name__ == "__main__":
    train_and_save("category", "category_classifier.joblib")
