#!/usr/bin/env python3
"""Precompute sentiment labels for reviews_tags.csv using a 3-class RoBERTa model.

Writes ``sentiment_label`` as Positive | Neutral | Negative (same strings as before).
Vibe columns are not modified.

Requires: ``pip install -r requirements.txt`` (torch + transformers). First run downloads
the model weights (~500MB) from Hugging Face.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd
import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "Data"
CSV_PATH = DATA_DIR / "reviews_tags.csv"

# 3-way English sentiment; stronger than lexicon methods on nuanced / long reviews.
MODEL_NAME = "cardiffnlp/twitter-roberta-base-sentiment-latest"
DEFAULT_BATCH_SIZE = 16
MAX_LENGTH = 512


def _canonical_sentiment(hf_label: str) -> str:
    key = (hf_label or "").lower().strip()
    if key in ("positive", "pos", "label_2"):
        return "Positive"
    if key in ("negative", "neg", "label_0"):
        return "Negative"
    if key in ("neutral", "neu", "label_1"):
        return "Neutral"
    return "Neutral"


def _load_model(device: torch.device):
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
    model = AutoModelForSequenceClassification.from_pretrained(MODEL_NAME)
    model.to(device)
    model.eval()
    raw = model.config.id2label
    if not raw:
        raise RuntimeError(f"Model {MODEL_NAME} has no id2label in config")
    id2label = {int(k): str(v) for k, v in raw.items()}
    return tokenizer, model, id2label


def _predict_batches(
    texts: list[str],
    tokenizer,
    model,
    id2label: dict[int, str],
    device: torch.device,
    batch_size: int,
) -> list[str]:
    out: list[str] = []
    n = len(texts)
    with torch.inference_mode():
        for start in range(0, n, batch_size):
            batch = texts[start : start + batch_size]
            encoded = tokenizer(
                batch,
                padding=True,
                truncation=True,
                max_length=MAX_LENGTH,
                return_tensors="pt",
            )
            encoded = {k: v.to(device) for k, v in encoded.items()}
            logits = model(**encoded).logits
            pred_ids = logits.argmax(dim=-1).tolist()
            for pid in pred_ids:
                raw = id2label.get(int(pid), "neutral")
                out.append(_canonical_sentiment(raw))
            done = min(start + batch_size, n)
            if done == n or (start // batch_size) % 50 == 0:
                print(f"  RoBERTa … {done}/{n}")
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description="Precompute sentiment_label in reviews_tags.csv")
    parser.add_argument(
        "--batch-size",
        type=int,
        default=DEFAULT_BATCH_SIZE,
        help=f"Inference batch size (default {DEFAULT_BATCH_SIZE})",
    )
    parser.add_argument(
        "--device",
        choices=("auto", "cpu", "cuda"),
        default="auto",
        help="Torch device",
    )
    args = parser.parse_args()

    if args.device == "auto":
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    else:
        device = torch.device(args.device)

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not CSV_PATH.is_file():
        raise FileNotFoundError(f"Reviews CSV not found: {CSV_PATH}")

    print(f"Reading {CSV_PATH} …")
    df = pd.read_csv(CSV_PATH)

    if "review_text_cleaned" not in df.columns:
        raise ValueError("CSV must contain column 'review_text_cleaned'")

    print(f"Loading {MODEL_NAME} on {device} …")
    tokenizer, model, id2label = _load_model(device)

    n = len(df)
    labels: list[str | None] = [None] * n
    to_score: list[str] = []
    to_score_row: list[int] = []

    for i, text in enumerate(df["review_text_cleaned"]):
        if pd.isna(text):
            labels[i] = "Neutral"
            continue
        s = str(text).strip()
        if not s:
            labels[i] = "Neutral"
            continue
        to_score_row.append(i)
        to_score.append(s)

    print(f"Scoring {len(to_score)} non-empty reviews (batch_size={args.batch_size}) …")
    predicted = _predict_batches(
        to_score, tokenizer, model, id2label, device, args.batch_size
    )
    for row_idx, lab in zip(to_score_row, predicted):
        labels[row_idx] = lab

    df["sentiment_label"] = labels

    print(f"Writing {CSV_PATH} ({n} rows) …")
    df.to_csv(CSV_PATH, index=False)
    print("Done.")


if __name__ == "__main__":
    main()
