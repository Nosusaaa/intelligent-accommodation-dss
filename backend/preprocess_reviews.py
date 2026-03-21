#!/usr/bin/env python3
"""Precompute VADER sentiment labels from review text and overwrite reviews_tags.csv."""

from __future__ import annotations

from pathlib import Path

import pandas as pd
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "Data"
CSV_PATH = DATA_DIR / "reviews_tags.csv"

COMPOUND_THRESHOLD = 0.05


def label_from_compound(compound: float) -> str:
    if compound >= COMPOUND_THRESHOLD:
        return "Positive"
    if compound <= -COMPOUND_THRESHOLD:
        return "Negative"
    return "Neutral"


def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not CSV_PATH.is_file():
        raise FileNotFoundError(f"Reviews CSV not found: {CSV_PATH}")

    print(f"Reading {CSV_PATH} …")
    df = pd.read_csv(CSV_PATH)

    if "review_text_cleaned" not in df.columns:
        raise ValueError("CSV must contain column 'review_text_cleaned'")

    sia = SentimentIntensityAnalyzer()
    n = len(df)
    labels: list[str] = []

    for i, text in enumerate(df["review_text_cleaned"]):
        if (i + 1) % 5000 == 0 or i == 0:
            print(f"  VADER … {i + 1}/{n}")

        if pd.isna(text):
            labels.append("Neutral")
            continue
        s = str(text).strip()
        if not s:
            labels.append("Neutral")
            continue
        compound = float(sia.polarity_scores(s)["compound"])
        labels.append(label_from_compound(compound))

    df["sentiment_label"] = labels

    print(f"Writing {CSV_PATH} ({n} rows) …")
    df.to_csv(CSV_PATH, index=False)
    print("Done.")


if __name__ == "__main__":
    main()
