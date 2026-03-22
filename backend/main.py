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
from contextlib import asynccontextmanager
from datetime import date, datetime
from typing import Annotated, Any, List, Optional

import bcrypt
from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from database import Base, engine
from models import Listing, ListingTag, MonthlyMetric, Review, SessionLocal, User


def _hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


@asynccontextmanager
async def lifespan(_app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="Airbnb DSS API", version="0.1.0", lifespan=lifespan)

# Upper bound for `min_price` / `max_price` query filters (keep in sync with search UI).
LISTING_PRICE_FILTER_MAX = 1000

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
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
        "bathrooms_text": listing.bathrooms_text,
        "bathrooms": _json_value(listing.bathrooms_num),
        "neighbourhood_cleansed": listing.neighbourhood_cleansed,
        "neighborhood_overview": listing.neighborhood_overview,
        "review_scores_rating": _json_value(listing.review_scores_rating),
        "number_of_reviews": listing.number_of_reviews,
        "has_wifi": listing.has_wifi,
        "has_parking": listing.has_parking,
        "has_kitchen": listing.has_kitchen,
        "has_air_conditioning": listing.has_air_conditioning,
        "has_tv": listing.has_tv,
        "has_balcony": listing.has_balcony,
        "average_sentiment_score": _json_value(listing.average_sentiment_score),
        "intelligent_score": _json_value(listing.intelligent_score),
        "sentiment_positive_ratio": _json_value(listing.sentiment_positive_ratio),
        "sentiment_neutral_ratio": _json_value(listing.sentiment_neutral_ratio),
        "sentiment_negative_ratio": _json_value(listing.sentiment_negative_ratio),
        "sentiment_positive_count": listing.sentiment_positive_count,
        "sentiment_neutral_count": listing.sentiment_neutral_count,
        "sentiment_negative_count": listing.sentiment_negative_count,
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


def _review_row(r: Review) -> dict[str, Any]:
    """Review fields as stored (sentiment_label precomputed at ETL time)."""
    return {
        "id": r.id,
        "listing_id": r.listing_id,
        "reviewer_name": r.reviewer_name,
        "review_date": _json_value(r.review_date),
        "review_text_cleaned": r.review_text_cleaned,
        "vibe_tags_detail": r.vibe_tags_detail,
        "sentiment_label": r.sentiment_label,
    }


def _parse_room_type_values(room_type: Optional[str]) -> list[str]:
    """Accept comma-separated values and trim whitespace."""
    if not room_type or not str(room_type).strip():
        return []
    return [p.strip() for p in str(room_type).split(",") if p.strip()]


def _normalize_email(email: str) -> str:
    return email.strip().lower()


class AuthCredentials(BaseModel):
    email: str = Field(..., min_length=3, max_length=320)
    password: str = Field(..., min_length=1, max_length=256)


@app.post("/api/auth/signup")
def auth_signup(
    body: AuthCredentials,
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, Any]:
    email = _normalize_email(body.email)
    existing = db.scalars(select(User).where(User.email == email)).first()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )
    user = User(email=email, password=_hash_password(body.password))
    db.add(user)
    db.commit()
    return {"message": "Registration successful"}


@app.post("/api/auth/login")
def auth_login(
    body: AuthCredentials,
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, Any]:
    email = _normalize_email(body.email)
    user = db.scalars(select(User).where(User.email == email)).first()
    if user is None or not _verify_password(body.password, user.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )
    return {
        "message": "Login successful",
        "email": user.email,
    }


@app.get("/api/listings")
def list_listings(
    db: Annotated[Session, Depends(get_db)],
    min_price: Optional[int] = Query(None, ge=0, le=LISTING_PRICE_FILTER_MAX),
    max_price: Optional[int] = Query(None, ge=0, le=LISTING_PRICE_FILTER_MAX),
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
    vibe_tags: Optional[List[str]] = Query(
        None,
        description="Repeat query param for vibe tag filtering (case-insensitive partial match on pipe-separated tags)",
    ),
    skip: Optional[int] = Query(0, ge=0, description="Number of records to skip for pagination"),
    limit: Optional[int] = Query(20, ge=1, le=100, description="Max records to return per page"),
) -> dict[str, Any]:
    # Only load listing_tags relationship when filtering by vibe_tags
    if vibe_tags:
        stmt = select(Listing).options(selectinload(Listing.listing_tags))
    else:
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

    # Filter by vibe_tags (case-insensitive partial match on pipe-separated tags)
    if vibe_tags:
        tag_filters = []
        for tag in vibe_tags:
            tag_lower = tag.lower().strip()
            if tag_lower:
                tag_filters.append(
                    ListingTag.vibe_tags.ilike(f"%{tag_lower}%")
                )
        if tag_filters:
            stmt = stmt.join(ListingTag, Listing.id == ListingTag.listing_id)
            from sqlalchemy import or_
            stmt = stmt.where(or_(*tag_filters)).distinct()

    # Count total before pagination
    from sqlalchemy import func
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total_count = db.scalar(count_stmt) or 0

    stmt = stmt.order_by(Listing.id)
    stmt = stmt.offset(skip).limit(limit)
    rows = db.scalars(stmt).all()
    return {
        "listings": [_listing_full(x) for x in rows],
        "total": total_count,
        "skip": skip,
        "limit": limit,
    }


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
