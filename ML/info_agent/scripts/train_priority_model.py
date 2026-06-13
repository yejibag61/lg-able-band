"""Train the priority classifier."""

from model_training_utils import train_and_save


if __name__ == "__main__":
    train_and_save("priority", "priority_classifier.joblib")
