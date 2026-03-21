"""
FastAPI application serving listing data for the React frontend.

Run the API (from the `backend/` directory so imports resolve):

    uvicorn main:app --reload

If `uvicorn` is not on PATH (common on macOS), use:

    python3 -m uvicorn main:app --reload

Optional: bind host/port, e.g. `uvicorn main:app --reload --host 0.0.0.0 --port 8000`
"""

from __future__ import annotations

import re
from collections.abc import Generator
from datetime import date, datetime
from typing import Annotated, Any, List, Optional

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from models import Listing, MonthlyMetric, Review, SessionLocal

app = FastAPI(title="Airbnb DSS API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_db() -> Generator[Session, None, None]:
    """Yield a SQLAlchemy session for request-scoped database access."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _json_value(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return value


def _listing_full(listing: Listing) -> dict[str, Any]:
    """All scalar columns on `Listing` (no relationships)."""
    return {
        "id": listing.id,
        "name": listing.name,
        "description": listing.description,
        "picture_url": listing.picture_url,
        "property_type": listing.property_type,
        "room_type": listing.room_type,
        "accommodates": listing.accommodates,
        "price_clean": _json_value(listing.price_clean),
        "bedrooms": listing.bedrooms,
        "beds": listing.beds,
        "bathrooms_num": _json_value(listing.bathrooms_num),
        "has_wifi": listing.has_wifi,
        "has_parking": listing.has_parking,
        "has_kitchen": listing.has_kitchen,
        "has_air_conditioning": listing.has_air_conditioning,
        "has_tv": listing.has_tv,
        "has_balcony": listing.has_balcony,
        "average_sentiment_score": _json_value(listing.average_sentiment_score),
        "intelligent_score": _json_value(listing.intelligent_score),
        "vibe_tags": (
            listing.listing_tags[0].vibe_tags
            if getattr(listing, "listing_tags", None)
            else None
        ),
    }


def _monthly_metric_row(m: MonthlyMetric) -> dict[str, Any]:
    return {
        "id": m.id,
        "listing_id": m.listing_id,
        "year_month": m.year_month,
        "avg_adjusted_price": _json_value(m.avg_adjusted_price),
        "occupancy_rate": _json_value(m.occupancy_rate),
    }


# Lightweight keyword cues (DB has no per-review sentiment column).
_NEGATIVE_HINTS = (
    "terrible",
    "horrible",
    "awful",
    "worst",
    "dirty",
    "noisy",
    "rude",
    "disappointing",
    "disappointed",
    "avoid",
    "never again",
    "not recommend",
    "wouldn't recommend",
    "poor",
    "bad experience",
    "uncomfortable",
    "unsafe",
)
_POSITIVE_HINTS = (
    "great",
    "wonderful",
    "lovely",
    "perfect",
    "amazing",
    "excellent",
    "beautiful",
    "comfortable",
    "clean",
    "recommend",
    "highly recommend",
    "love",
    "loved",
    "best",
    "fantastic",
    "exceptional",
    "hospitable",
    "warm",
    "charming",
)


def _sentiment_label_from_text(text: Optional[str]) -> str:
    """Return Positive / Negative / Neutral from cleaned review text (heuristic)."""
    if not text or not str(text).strip():
        return "Neutral"
    lower = str(text).lower()
    neg = sum(1 for h in _NEGATIVE_HINTS if h in lower)
    pos = sum(1 for h in _POSITIVE_HINTS if h in lower)
    # Word-level boost for short obvious negatives
    tokens = re.findall(r"[a-zA-Z']+", lower)
    for t in tokens:
        if t in {"bad", "hate", "never"}:
            neg += 1
        if t in {"good", "nice", "great", "love"}:
            pos += 1
    if neg > pos:
        return "Negative"
    if pos > neg:
        return "Positive"
    return "Neutral"


def _review_row(r: Review) -> dict[str, Any]:
    text = r.review_text_cleaned
    return {
        "id": r.id,
        "listing_id": r.listing_id,
        "reviewer_name": r.reviewer_name,
        "review_date": _json_value(r.review_date),
        "review_text_cleaned": text,
        "comments": text,
        "vibe_tags_detail": r.vibe_tags_detail,
        "sentiment_label": _sentiment_label_from_text(text),
    }


def _parse_room_type_values(room_type: Optional[str]) -> list[str]:
    """Accept comma-separated values and trim whitespace."""
    if not room_type or not str(room_type).strip():
        return []
    return [p.strip() for p in str(room_type).split(",") if p.strip()]


@app.get("/api/listings")
def list_listings(
    db: Annotated[Session, Depends(get_db)],
    min_price: Optional[int] = Query(None, ge=0),
    max_price: Optional[int] = Query(None, ge=0),
    guests: Optional[int] = Query(None, ge=1, description="Minimum accommodates"),
    bedrooms: Optional[int] = Query(None, ge=0),
    beds: Optional[int] = Query(None, ge=0),
    bathrooms: Optional[int] = Query(None, ge=0),
    room_type: Optional[str] = Query(
        None,
        description="Comma-separated room_type values (exact match)",
    ),
    room_types: Optional[List[str]] = Query(
        None,
        description="Repeat query param for multiple room types (exact match)",
    ),
    has_wifi: Optional[bool] = Query(None),
    has_kitchen: Optional[bool] = Query(None),
    has_air_conditioning: Optional[bool] = Query(None),
    has_parking: Optional[bool] = Query(None),
    has_tv: Optional[bool] = Query(None),
    has_balcony: Optional[bool] = Query(None),
) -> list[dict[str, Any]]:
    stmt = select(Listing).options(selectinload(Listing.listing_tags))

    if min_price is not None:
        stmt = stmt.where(Listing.price_clean >= float(min_price))
    if max_price is not None:
        stmt = stmt.where(Listing.price_clean <= float(max_price))
    if guests is not None:
        stmt = stmt.where(Listing.accommodates >= guests)
    if bedrooms is not None:
        stmt = stmt.where(Listing.bedrooms >= bedrooms)
    if beds is not None:
        stmt = stmt.where(Listing.beds >= beds)
    if bathrooms is not None:
        stmt = stmt.where(Listing.bathrooms_num >= float(bathrooms))

    room_vals = list(dict.fromkeys(_parse_room_type_values(room_type) + (room_types or [])))
    if room_vals:
        stmt = stmt.where(Listing.room_type.in_(room_vals))

    if has_wifi is True:
        stmt = stmt.where(Listing.has_wifi.is_(True))
    if has_kitchen is True:
        stmt = stmt.where(Listing.has_kitchen.is_(True))
    if has_air_conditioning is True:
        stmt = stmt.where(Listing.has_air_conditioning.is_(True))
    if has_parking is True:
        stmt = stmt.where(Listing.has_parking.is_(True))
    if has_tv is True:
        stmt = stmt.where(Listing.has_tv.is_(True))
    if has_balcony is True:
        stmt = stmt.where(Listing.has_balcony.is_(True))

    stmt = stmt.order_by(Listing.id)
    rows = db.scalars(stmt).all()
    return [_listing_full(x) for x in rows]


@app.get("/api/listings/{listing_id}")
def get_listing(
    listing_id: int,
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, Any]:
    listing = db.scalars(
        select(Listing)
        .where(Listing.id == listing_id)
        .options(selectinload(Listing.listing_tags))
    ).first()
    if listing is None:
        raise HTTPException(status_code=404, detail="Listing not found")
    return _listing_full(listing)


@app.get("/api/listings/{listing_id}/forecast")
def get_listing_forecast(
    listing_id: int,
    db: Annotated[Session, Depends(get_db)],
) -> list[dict[str, Any]]:
    if db.get(Listing, listing_id) is None:
        raise HTTPException(status_code=404, detail="Listing not found")

    stmt = (
        select(MonthlyMetric)
        .where(MonthlyMetric.listing_id == listing_id)
        .order_by(MonthlyMetric.year_month)
    )
    rows = db.scalars(stmt).all()
    return [_monthly_metric_row(m) for m in rows]


@app.get("/api/listings/{listing_id}/reviews")
def get_listing_reviews(
    listing_id: int,
    db: Annotated[Session, Depends(get_db)],
) -> list[dict[str, Any]]:
    if db.get(Listing, listing_id) is None:
        raise HTTPException(status_code=404, detail="Listing not found")

    stmt = (
        select(Review)
        .where(Review.listing_id == listing_id)
        .order_by(Review.review_date.desc().nulls_last(), Review.id.desc())
    )
    rows = db.scalars(stmt).all()
    return [_review_row(r) for r in rows]
