"""
FastAPI application serving listing data for the React frontend.

Run the API (from the `backend/` directory so imports resolve):

    uvicorn main:app --reload

If `uvicorn` is not on PATH (common on macOS), use:

    python3 -m uvicorn main:app --reload

Optional: bind host/port, e.g. `uvicorn main:app --reload --host 0.0.0.0 --port 8000`
"""

from __future__ import annotations

from collections.abc import Generator
from datetime import date, datetime
from typing import Annotated, Any

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.orm import Session

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
    }


def _monthly_metric_row(m: MonthlyMetric) -> dict[str, Any]:
    return {
        "id": m.id,
        "listing_id": m.listing_id,
        "year_month": m.year_month,
        "avg_adjusted_price": _json_value(m.avg_adjusted_price),
        "occupancy_rate": _json_value(m.occupancy_rate),
    }


def _review_row(r: Review) -> dict[str, Any]:
    return {
        "id": r.id,
        "listing_id": r.listing_id,
        "reviewer_name": r.reviewer_name,
        "review_date": _json_value(r.review_date),
        "review_text_cleaned": r.review_text_cleaned,
        "vibe_tags_detail": r.vibe_tags_detail,
    }


@app.get("/api/listings")
def list_listings(db: Annotated[Session, Depends(get_db)]) -> list[dict[str, Any]]:
    stmt = select(Listing).order_by(Listing.id)
    rows = db.scalars(stmt).all()
    return [_listing_full(x) for x in rows]


@app.get("/api/listings/{listing_id}")
def get_listing(
    listing_id: int,
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, Any]:
    listing = db.get(Listing, listing_id)
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
