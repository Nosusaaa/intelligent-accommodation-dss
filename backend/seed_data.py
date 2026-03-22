"""Load CSV data into SQLite using Pandas. CSV inputs live under ``../Data/`` (see `database.py` for DB path)."""

from __future__ import annotations

import shutil
from pathlib import Path

import pandas as pd
from sqlalchemy import text

from database import Base, engine

# Register ORM models so metadata includes all tables
import models  # noqa: F401

BACKEND_DIR = Path(__file__).resolve().parent
REPO_ROOT = BACKEND_DIR.parent
DATA_DIR = REPO_ROOT / "Data"

# All CSV inputs live under ``Data/`` (seed may move them from ``backend/`` or repo root for migration).
REQUIRED_CSVS = (
    "cleaned_listings.csv",
    "listings_intelligent_profile.csv",
    "calendar_cleaned.csv",
    "monthly_forecast_metrics.csv",
    "reviews_tags.csv",
    "room_tags.csv",
)


def _ensure_csv(name: str) -> Path:
    """Return ``Data/<name>``, moving the file from ``backend/`` or repo root if needed."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    dest = DATA_DIR / name
    if dest.is_file():
        return dest

    stem = Path(name).stem
    search_dirs = [BACKEND_DIR, REPO_ROOT, DATA_DIR]

    for d in search_dirs:
        if not d.is_dir():
            continue
        exact = d / name
        if exact.is_file() and exact.resolve() != dest.resolve():
            shutil.move(str(exact), str(dest))
            print(f"Moved into Data/: {name} (from {d})")
            return dest

    for d in search_dirs:
        if not d.is_dir():
            continue
        for f in sorted(d.glob(f"{stem}*.csv")):
            if f.is_file() and f.resolve() != dest.resolve():
                shutil.move(str(f), str(dest))
                print(f"Moved into Data/: {name} (from {f.name})")
                return dest

    raise FileNotFoundError(
        f"Missing required CSV: {dest}\n"
        f"Place {name} in the Data/ folder at the repository root, "
        f"or in backend/ / repo root as {name} or {stem}*.csv"
    )


def _ensure_all_required_csvs() -> None:
    for csv_name in REQUIRED_CSVS:
        _ensure_csv(csv_name)


def _fill_na_for_sql(df: pd.DataFrame, date_cols: frozenset[str]) -> pd.DataFrame:
    """Fill NaN for SQLite: text -> '', numerics -> 0, bools -> False; dates handled separately."""
    out = df.copy()
    for col in out.columns:
        if col in date_cols:
            continue
        s = out[col]
        if pd.api.types.is_bool_dtype(s):
            out[col] = s.fillna(False).astype(bool)
        elif pd.api.types.is_integer_dtype(s) or str(s.dtype).startswith("Int"):
            out[col] = s.fillna(0).astype("int64")
        elif pd.api.types.is_float_dtype(s):
            out[col] = s.fillna(0.0).astype("float64")
        else:
            out[col] = s.fillna("").astype(str)
    for col in date_cols & set(out.columns):
        ts = pd.to_datetime(out[col], errors="coerce")
        out[col] = ts.dt.strftime("%Y-%m-%d").where(ts.notna(), "")
    return out


def _add_surrogate_ids(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    out.insert(0, "id", range(1, len(out) + 1))
    return out


def _parse_calendar_available(series: pd.Series) -> pd.Series:
    def cell(v: object) -> bool:
        if pd.isna(v):
            return False
        if isinstance(v, bool):
            return v
        s = str(v).strip().lower()
        if s in {"t", "true", "1", "yes", "y"}:
            return True
        if s in {"f", "false", "0", "no", "n"}:
            return False
        return bool(v)

    return series.map(cell)


def main() -> None:
    print("Checking CSV data files...")
    _ensure_all_required_csvs()

    print("Initializing database schema...")
    Base.metadata.create_all(bind=engine)

    conn = engine.connect()
    try:
        print("Seeding Listings Data...")
        listings = pd.read_csv(DATA_DIR / "cleaned_listings.csv")
        profile = pd.read_csv(DATA_DIR / "listings_intelligent_profile.csv")
        merged = listings.merge(profile, left_on="id", right_on="listing_id", how="left")
        merged = merged.drop(columns=["listing_id"], errors="ignore")

        listing_cols = [
            "id",
            "name",
            "description",
            "picture_url",
            "property_type",
            "room_type",
            "accommodates",
            "price_clean",
            "bedrooms",
            "beds",
            "bathrooms_num",
            "has_wifi",
            "has_parking",
            "has_kitchen",
            "has_air_conditioning",
            "has_tv",
            "has_balcony",
            "average_sentiment_score",
            "intelligent_score",
            "sentiment_positive_ratio",
            "sentiment_neutral_ratio",
            "sentiment_negative_ratio",
            "sentiment_positive_count",
            "sentiment_neutral_count",
            "sentiment_negative_count",
        ]
        df_listings = merged[listing_cols].copy()
        for c in ("bedrooms", "beds"):
            df_listings[c] = (
                pd.to_numeric(df_listings[c], errors="coerce").fillna(0).round().astype("int64")
            )
        for c in (
            "sentiment_positive_count",
            "sentiment_neutral_count",
            "sentiment_negative_count",
        ):
            df_listings[c] = (
                pd.to_numeric(df_listings[c], errors="coerce").fillna(0).round().astype("int64")
            )
        df_listings = _fill_na_for_sql(df_listings, date_cols=frozenset())

        df_listings.to_sql("listings", conn, if_exists="replace", index=False)

        print("Seeding Calendar Data...")
        cal = pd.read_csv(DATA_DIR / "calendar_cleaned.csv")
        cal = cal[["listing_id", "date", "available", "price", "adjusted_price"]].copy()
        cal["available"] = _parse_calendar_available(cal["available"])
        ts = pd.to_datetime(cal["date"], errors="coerce")
        cal["date"] = ts.dt.strftime("%Y-%m-%d").where(ts.notna(), "")
        cal = _fill_na_for_sql(cal, date_cols=frozenset())
        cal = _add_surrogate_ids(cal)
        cal.to_sql("calendar", conn, if_exists="replace", index=False)

        print("Seeding Monthly Metrics Data...")
        mm = pd.read_csv(DATA_DIR / "monthly_forecast_metrics.csv")
        mm = mm[["listing_id", "year_month", "avg_adjusted_price", "occupancy_rate"]].copy()
        mm = _fill_na_for_sql(mm, date_cols=frozenset())
        mm = _add_surrogate_ids(mm)
        mm.to_sql("monthly_metrics", conn, if_exists="replace", index=False)

        print("Seeding Reviews Data...")
        rev = pd.read_csv(DATA_DIR / "reviews_tags.csv")
        rev = rev.rename(columns={"review_id": "id"})
        rev = rev[
            [
                "id",
                "listing_id",
                "reviewer_name",
                "review_date",
                "review_text_cleaned",
                "vibe_tags_detail",
                "sentiment_label",
            ]
        ].copy()
        rev = _fill_na_for_sql(rev, date_cols=frozenset({"review_date"}))
        rev.to_sql("reviews", conn, if_exists="replace", index=False)

        print("Seeding Listing Tags Data...")
        # `room_tags.csv` often has large `listing_id` mangled as scientific notation when read as
        # float, producing orphan rows that never join `listings`. `listings_intelligent_profile.csv`
        # has the same row order and matching `total_reviews`; use its `listing_id` as source of truth.
        tags = pd.read_csv(DATA_DIR / "room_tags.csv")[["total_reviews", "vibe_tags"]].copy()
        profile = pd.read_csv(
            DATA_DIR / "listings_intelligent_profile.csv",
            usecols=["listing_id", "total_reviews"],
        )
        if len(tags) != len(profile) or not (
            tags["total_reviews"].to_numpy() == profile["total_reviews"].to_numpy()
        ).all():
            raise ValueError(
                "room_tags.csv and listings_intelligent_profile.csv must have the same length "
                "and identical total_reviews column (row-aligned) so listing_id can be repaired."
            )
        tags["listing_id"] = profile["listing_id"].astype("int64")
        tags = tags[["listing_id", "vibe_tags"]]
        tags = _fill_na_for_sql(tags, date_cols=frozenset())
        tags = _add_surrogate_ids(tags)
        tags.to_sql("listing_tags", conn, if_exists="replace", index=False)

        conn.commit()

        for table in ("listings", "calendar", "monthly_metrics", "reviews", "listing_tags"):
            n = conn.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar_one()
            print(f"Done: {table} has {n} rows.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
