
import numpy as np
import torch

class JoblibTransformerClassifier:
    """
    기존 sklearn joblib 모델처럼 model.predict([text]) 형태로 사용하기 위한 wrapper.
    """

    def __init__(self, tokenizer, model, id2label, max_length=256):
        self.tokenizer = tokenizer
        self.model = model
        self.id2label = {int(k): v for k, v in id2label.items()}
        self.max_length = max_length
        self.model.eval()

    def predict(self, texts):
        if isinstance(texts, str):
            texts = [texts]

        texts = ["" if t is None else str(t) for t in texts]

        device = "cuda" if torch.cuda.is_available() else "cpu"
        self.model.to(device)
        self.model.eval()

        inputs = self.tokenizer(
            texts,
            padding=True,
            truncation=True,
            max_length=self.max_length,
            return_tensors="pt"
        )

        inputs = {k: v.to(device) for k, v in inputs.items()}

        with torch.no_grad():
            outputs = self.model(**inputs)
            pred_ids = torch.argmax(outputs.logits, dim=-1).detach().cpu().numpy()

        labels = [self.id2label[int(i)] for i in pred_ids]
        return np.array(labels)
