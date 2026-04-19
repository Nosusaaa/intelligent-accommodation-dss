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
import logging
import os
import time
from typing import Annotated, Any, List, Optional

import bcrypt
from fastapi import Depends, FastAPI, File, HTTPException, Query, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select, text

from sqlalchemy.orm import Session, selectinload

from database import Base, engine
from models import (
    AdminUser,
    Listing,
    ListingTag,
    MonthlyMetric,
    Review,
    ScenicSpot,
    SessionLocal,
    StrategyConfig,
    SyncLog,
    User,
    UserFavorite,
    UserPreference,
    UserStay,
    UserStayReview,
)
from overpass_client import fetch_pois_bbox, load_offline_pois
from strategy_ranking import (
    load_merged_pois_from_cache,
    parse_default_preference_json,
    poi_proximity_score_0_100,
    price_bounds,
    rank_listings_payload,
    serialize_default_preference,
)


def _hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False



def _ensure_user_profile_columns() -> None:
    with engine.begin() as conn:
        columns = {
            row[1] for row in conn.exec_driver_sql("PRAGMA table_info(users)").fetchall()
        }
        if "full_name" not in columns:
            conn.execute(text("ALTER TABLE users ADD COLUMN full_name VARCHAR(120)"))
        if "avatar_url" not in columns:
            conn.execute(text("ALTER TABLE users ADD COLUMN avatar_url TEXT"))
        if "created_at" not in columns:
            conn.execute(text("ALTER TABLE users ADD COLUMN created_at VARCHAR(26)"))
        if "top_vibe_tag" not in columns:
            conn.execute(text("ALTER TABLE users ADD COLUMN top_vibe_tag VARCHAR(256)"))


def _ensure_sync_log_columns() -> None:
    """Align legacy sync_logs SQLite schemas with ``SyncLog`` ORM (upload/import logging)."""
    with engine.begin() as conn:
        try:
            rows = conn.exec_driver_sql("PRAGMA table_info(sync_logs)").fetchall()
        except Exception:
            return
        if not rows:
            return
        columns = {row[1] for row in rows}
        # Older DBs only had id, file_type, status, records_updated, sync_date, created_at.
        alters: list[tuple[str, str]] = [
            ("filename", "ALTER TABLE sync_logs ADD COLUMN filename VARCHAR(256)"),
            ("total_rows", "ALTER TABLE sync_logs ADD COLUMN total_rows INTEGER NOT NULL DEFAULT 0"),
            (
                "duplicates",
                "ALTER TABLE sync_logs ADD COLUMN duplicates INTEGER NOT NULL DEFAULT 0",
            ),
            ("invalid", "ALTER TABLE sync_logs ADD COLUMN invalid INTEGER NOT NULL DEFAULT 0"),
            ("error_summary", "ALTER TABLE sync_logs ADD COLUMN error_summary TEXT"),
            ("affected_ids", "ALTER TABLE sync_logs ADD COLUMN affected_ids TEXT"),
        ]
        for col, ddl in alters:
            if col not in columns:
                conn.execute(text(ddl))


def _ensure_strategy_config_columns() -> None:
    with engine.begin() as conn:
        try:
            rows = conn.exec_driver_sql("PRAGMA table_info(strategy_configs)").fetchall()
        except Exception:
            return
        if not rows:
            return
        columns = {row[1] for row in rows}
        if "default_preference_json" not in columns:
            conn.execute(text("ALTER TABLE strategy_configs ADD COLUMN default_preference_json TEXT"))


def _ensure_scenic_spot_columns() -> None:
    with engine.begin() as conn:
        try:
            rows = conn.exec_driver_sql("PRAGMA table_info(scenic_spots)").fetchall()
        except Exception:
            return
        if not rows:
            return
        columns = {row[1] for row in rows}
        if "latitude" not in columns:
            conn.execute(text("ALTER TABLE scenic_spots ADD COLUMN latitude FLOAT"))
        if "longitude" not in columns:
            conn.execute(text("ALTER TABLE scenic_spots ADD COLUMN longitude FLOAT"))
        if "category" not in columns:
            conn.execute(text("ALTER TABLE scenic_spots ADD COLUMN category VARCHAR(128)"))
        if "updated_at" not in columns:
            conn.execute(text("ALTER TABLE scenic_spots ADD COLUMN updated_at VARCHAR(26)"))


def _ensure_user_stay_review_table() -> None:
    with engine.begin() as conn:
        tables = {
            row[0] for row in conn.exec_driver_sql(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        }
        if "user_stay_reviews" not in tables:
            conn.execute(
                text(
                    """
                    CREATE TABLE user_stay_reviews (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER NOT NULL,
                        listing_id INTEGER NOT NULL,
                        stay_id INTEGER NOT NULL,
                        overall_rating INTEGER NOT NULL DEFAULT 5,
                        listing_accuracy_rating INTEGER NOT NULL DEFAULT 5,
                        airbnb_review_accuracy_rating INTEGER NOT NULL DEFAULT 5,
                        cleanliness_rating INTEGER NOT NULL DEFAULT 5,
                        host_communication_rating INTEGER NOT NULL DEFAULT 5,
                        check_in_rating INTEGER NOT NULL DEFAULT 5,
                        location_convenience_rating INTEGER NOT NULL DEFAULT 5,
                        value_for_money_rating INTEGER NOT NULL DEFAULT 5,
                        comment TEXT,
                        created_at VARCHAR(26),
                        updated_at VARCHAR(26),
                        UNIQUE(user_id, listing_id),
                        UNIQUE(stay_id),
                        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
                        FOREIGN KEY(listing_id) REFERENCES listings(id) ON DELETE CASCADE,
                        FOREIGN KEY(stay_id) REFERENCES user_stays(id) ON DELETE CASCADE
                    )
                    """
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX ix_user_stay_reviews_user_id ON user_stay_reviews(user_id)"
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX ix_user_stay_reviews_listing_id ON user_stay_reviews(listing_id)"
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX ix_user_stay_reviews_stay_id ON user_stay_reviews(stay_id)"
                )
            )


def _migrate_user_stay_review_sqlite_columns() -> None:
    """Rename legacy SQLite columns to match ``UserStayReview`` ORM attributes.

    Older schemas used ``airbnb_review_authenticity_rating`` and
    ``checkin_experience_rating``; without this, any query on ``user_stay_reviews``
    raises ``OperationalError`` and the stay-reviews API returns 500.
    """
    with engine.begin() as conn:
        try:
            rows = conn.exec_driver_sql("PRAGMA table_info(user_stay_reviews)").fetchall()
        except Exception:
            return
        if not rows:
            return
        columns = {row[1] for row in rows}
        pairs = []
        if (
            "airbnb_review_authenticity_rating" in columns
            and "airbnb_review_accuracy_rating" not in columns
        ):
            pairs.append(
                ("airbnb_review_authenticity_rating", "airbnb_review_accuracy_rating")
            )
        if "checkin_experience_rating" in columns and "check_in_rating" not in columns:
            pairs.append(("checkin_experience_rating", "check_in_rating"))
        for old, new in pairs:
            conn.execute(
                text(f'ALTER TABLE user_stay_reviews RENAME COLUMN "{old}" TO "{new}"')
            )


@asynccontextmanager
async def lifespan(_app: FastAPI):
    Base.metadata.create_all(bind=engine)
    _ensure_user_profile_columns()
    _ensure_user_stay_review_table()
    _migrate_user_stay_review_sqlite_columns()
    _ensure_sync_log_columns()
    _ensure_strategy_config_columns()
    _ensure_scenic_spot_columns()
    yield


app = FastAPI(title="Airbnb DSS API", version="0.1.0", lifespan=lifespan)

# Upper bound for `min_price` / `max_price` query filters (keep in sync with search UI).
LISTING_PRICE_FILTER_MAX = 1000
OVERPASS_CACHE_TTL_SEC = 120.0
_overpass_cache: dict[tuple[str, float, float, float, float], tuple[float, list[dict[str, Any]]]] = {}
OVERPASS_FAILURE_WINDOW_SEC = 25.0
_overpass_breaker_until = 0.0
logger = logging.getLogger("map-api")

_DEFAULT_CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]


def _cors_allow_origins() -> list[str]:
    """Merge localhost dev origins with optional ``CORS_ORIGINS`` (comma-separated)."""
    extra = [
        o.strip()
        for o in os.environ.get("CORS_ORIGINS", "").split(",")
        if o.strip()
    ]
    seen: set[str] = set()
    out: list[str] = []
    for o in _DEFAULT_CORS_ORIGINS + extra:
        if o not in seen:
            seen.add(o)
            out.append(o)
    return out


app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_allow_origins(),
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
        "listing_url": listing.listing_url,
        "gallery_urls": listing.gallery_urls,
        "property_type": listing.property_type,
        "room_type": listing.room_type,
        "accommodates": listing.accommodates,
        "price_clean": _json_value(listing.price_clean),
        "bedrooms": listing.bedrooms,
        "beds": listing.beds,
        "bathrooms_num": _json_value(listing.bathrooms_num),
        "bathrooms_text": listing.bathrooms_text,
        "bathrooms": _json_value(listing.bathrooms_num),
        "latitude": _json_value(listing.latitude),
        "longitude": _json_value(listing.longitude),
        "neighbourhood_cleansed": listing.neighbourhood_cleansed,
        "neighborhood_overview": listing.neighborhood_overview,
        "latitude": _json_value(listing.latitude),
        "longitude": _json_value(listing.longitude),
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


class SignupBody(BaseModel):
    email: str = Field(..., min_length=3, max_length=320)
    password: str = Field(..., min_length=8, max_length=256)
    password_confirm: str = Field(..., min_length=1, max_length=256)


class ProfileResponse(BaseModel):
    user_id: int
    full_name: Optional[str] = None
    email: str
    avatar_url: Optional[str] = None
    created_at: Optional[str] = None
    top_vibe_tag: Optional[str] = None


class ProfileUpdateBody(BaseModel):
    user_id: int
    full_name: str = Field(default="", max_length=120)
    email: str = Field(..., min_length=3, max_length=320)
    avatar_url: str = Field(default="")


REVIEW_DIMENSIONS = [
    {
        "key": "listing_accuracy_rating",
        "label": "Listing Accuracy",
        "description": "Did the space, amenities, photos, and description match the real stay?",
    },
    {
        "key": "airbnb_review_accuracy_rating",
        "label": "Existing Review Accuracy",
        "description": "Did the previous Airbnb reviews reflect the real strengths and weaknesses of this listing?",
    },
    {
        "key": "cleanliness_rating",
        "label": "Cleanliness",
        "description": "How clean were the room, linens, and shared areas on arrival?",
    },
    {
        "key": "host_communication_rating",
        "label": "Host Communication",
        "description": "How clear, fast, and helpful was the host communication?",
    },
    {
        "key": "check_in_rating",
        "label": "Check-in Experience",
        "description": "How smooth and convenient was the check-in process?",
    },
    {
        "key": "location_convenience_rating",
        "label": "Location Convenience",
        "description": "How convenient was the location for transport, food, and daily needs?",
    },
    {
        "key": "value_for_money_rating",
        "label": "Value for Money",
        "description": "Considering quality, location, and price, did it feel worth the cost?",
    },
]
REVIEW_DIMENSION_KEYS = tuple(dim["key"] for dim in REVIEW_DIMENSIONS)


class UserStayReviewPayload(BaseModel):
    overall_rating: int = Field(..., ge=1, le=5)
    listing_accuracy_rating: int = Field(..., ge=1, le=5)
    airbnb_review_accuracy_rating: int = Field(..., ge=1, le=5)
    cleanliness_rating: int = Field(..., ge=1, le=5)
    host_communication_rating: int = Field(..., ge=1, le=5)
    check_in_rating: int = Field(..., ge=1, le=5)
    location_convenience_rating: int = Field(..., ge=1, le=5)
    value_for_money_rating: int = Field(..., ge=1, le=5)
    comment: str = Field(default="", max_length=1200)


@app.post("/api/auth/signup")
def auth_signup(
    body: SignupBody,
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, Any]:
    if body.password != body.password_confirm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Passwords do not match",
        )
    email = _normalize_email(body.email)
    existing = db.scalars(select(User).where(User.email == email)).first()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )
    user = User(
        email=email,
        password=_hash_password(body.password),
        created_at=datetime.utcnow().isoformat(),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"message": "Registration successful", "user_id": user.id}


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
        "user_id": user.id,
    }


@app.get("/api/profile", response_model=ProfileResponse)
def get_profile(
    db: Annotated[Session, Depends(get_db)],
    user_id: int = Query(..., ge=1),
) -> ProfileResponse:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return ProfileResponse(
        user_id=user.id,
        full_name=user.full_name,
        email=user.email,
        avatar_url=user.avatar_url,
        created_at=user.created_at,
        top_vibe_tag=user.top_vibe_tag,
    )


@app.put("/api/profile", response_model=ProfileResponse)
def update_profile(
    body: ProfileUpdateBody,
    db: Annotated[Session, Depends(get_db)],
) -> ProfileResponse:
    user = db.get(User, body.user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    next_email = _normalize_email(body.email)
    existing = db.scalars(select(User).where(User.email == next_email, User.id != body.user_id)).first()
    if existing is not None:
        raise HTTPException(status_code=400, detail="Email already registered")

    user.full_name = body.full_name.strip() or None
    user.email = next_email
    user.avatar_url = body.avatar_url.strip() or None
    if not user.created_at:
        user.created_at = datetime.utcnow().isoformat()

    db.add(user)
    db.commit()
    db.refresh(user)

    return ProfileResponse(
        user_id=user.id,
        full_name=user.full_name,
        email=user.email,
        avatar_url=user.avatar_url,
        created_at=user.created_at,
        top_vibe_tag=user.top_vibe_tag,
    )


def _user_or_404(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user


def _listing_or_404(db: Session, listing_id: int) -> Listing:
    listing = db.get(Listing, listing_id)
    if listing is None:
        raise HTTPException(status_code=404, detail="Listing not found")
    return listing


def _now_iso() -> str:
    return datetime.utcnow().isoformat()


def _serialize_user_stay_review(review: UserStayReview) -> dict[str, Any]:
    payload = {
        "id": review.id,
        "user_id": review.user_id,
        "listing_id": review.listing_id,
        "stay_id": review.stay_id,
        "overall_rating": review.overall_rating,
        "comment": review.comment,
        "created_at": review.created_at,
        "updated_at": review.updated_at,
    }
    for key in REVIEW_DIMENSION_KEYS:
        payload[key] = getattr(review, key)
    payload["dimension_average"] = round(
        sum(getattr(review, key) for key in REVIEW_DIMENSION_KEYS) / len(REVIEW_DIMENSION_KEYS),
        2,
    )
    return payload


def _attach_review_to_listing_payload(payload: dict[str, Any], review: UserStayReview | None) -> dict[str, Any]:
    next_payload = dict(payload)
    next_payload["user_stay_review"] = _serialize_user_stay_review(review) if review else None
    return next_payload


@app.get("/api/users/{user_id}/favorites")
def get_user_favorites(
    user_id: int,
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, Any]:
    _user_or_404(db, user_id)
    stmt = (
        select(Listing)
        .join(UserFavorite, UserFavorite.listing_id == Listing.id)
        .where(UserFavorite.user_id == user_id)
        .options(selectinload(Listing.listing_tags))
        .order_by(UserFavorite.id.desc())
    )
    rows = db.scalars(stmt).all()
    return {"listings": [_listing_full(x) for x in rows], "total": len(rows)}


@app.post("/api/users/{user_id}/favorites/{listing_id}")
def add_user_favorite(
    user_id: int,
    listing_id: int,
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, Any]:
    _user_or_404(db, user_id)
    _listing_or_404(db, listing_id)
    exists = db.scalars(
        select(UserFavorite).where(
            UserFavorite.user_id == user_id,
            UserFavorite.listing_id == listing_id,
        )
    ).first()
    if exists is not None:
        return {"ok": True, "message": "Already in favorites"}
    db.add(
        UserFavorite(
            user_id=user_id,
            listing_id=listing_id,
            created_at=_now_iso(),
        )
    )
    db.commit()
    return {"ok": True}


@app.delete("/api/users/{user_id}/favorites/{listing_id}")
def remove_user_favorite(
    user_id: int,
    listing_id: int,
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, Any]:
    _user_or_404(db, user_id)
    row = db.scalars(
        select(UserFavorite).where(
            UserFavorite.user_id == user_id,
            UserFavorite.listing_id == listing_id,
        )
    ).first()
    if row is None:
        return {"ok": True, "message": "Not in favorites"}
    db.delete(row)
    db.commit()
    return {"ok": True}


@app.get("/api/users/{user_id}/stays")
def get_user_stays(
    user_id: int,
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, Any]:
    _user_or_404(db, user_id)
    stmt = (
        select(Listing, UserStayReview)
        .join(UserStay, UserStay.listing_id == Listing.id)
        .outerjoin(
            UserStayReview,
            (UserStayReview.user_id == UserStay.user_id)
            & (UserStayReview.listing_id == UserStay.listing_id),
        )
        .where(UserStay.user_id == user_id)
        .options(selectinload(Listing.listing_tags))
        .order_by(UserStay.id.desc())
    )
    rows = db.execute(stmt).all()
    listings = [
        _attach_review_to_listing_payload(_listing_full(listing), review)
        for listing, review in rows
    ]
    return {"listings": listings, "total": len(listings)}


@app.post("/api/users/{user_id}/stays/{listing_id}")
def add_user_stay(
    user_id: int,
    listing_id: int,
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, Any]:
    _user_or_404(db, user_id)
    _listing_or_404(db, listing_id)
    exists = db.scalars(
        select(UserStay).where(
            UserStay.user_id == user_id,
            UserStay.listing_id == listing_id,
        )
    ).first()
    if exists is not None:
        return {"ok": True, "message": "Already marked as stayed"}
    now = _now_iso()
    db.add(
        UserStay(
            user_id=user_id,
            listing_id=listing_id,
            created_at=now,
            stayed_at=now,
        )
    )
    db.commit()
    return {"ok": True}


@app.delete("/api/users/{user_id}/stays/{listing_id}")
def remove_user_stay(
    user_id: int,
    listing_id: int,
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, Any]:
    _user_or_404(db, user_id)
    row = db.scalars(
        select(UserStay).where(
            UserStay.user_id == user_id,
            UserStay.listing_id == listing_id,
        )
    ).first()
    if row is None:
        return {"ok": True, "message": "Not in stayed list"}
    db.delete(row)
    db.commit()
    return {"ok": True}


@app.get("/api/users/{user_id}/stays/review-config")
def get_user_stay_review_config(
    user_id: int,
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, Any]:
    _user_or_404(db, user_id)
    return {"dimensions": REVIEW_DIMENSIONS}


@app.post("/api/users/{user_id}/stays/{listing_id}/review")
def save_user_stay_review(
    user_id: int,
    listing_id: int,
    body: UserStayReviewPayload,
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, Any]:
    _user_or_404(db, user_id)
    _listing_or_404(db, listing_id)
    stay = db.scalars(
        select(UserStay).where(
            UserStay.user_id == user_id,
            UserStay.listing_id == listing_id,
        )
    ).first()
    if stay is None:
        raise HTTPException(
            status_code=400,
            detail="Please mark this listing as stayed before leaving a review",
        )

    existing_review = db.scalars(
        select(UserStayReview).where(
            UserStayReview.user_id == user_id,
            UserStayReview.listing_id == listing_id,
        )
    ).first()
    if existing_review is not None:
        raise HTTPException(
            status_code=400,
            detail="You have already submitted a review for this listing",
        )

    now = _now_iso()
    review = UserStayReview(
        user_id=user_id,
        listing_id=listing_id,
        stay_id=stay.id,
        created_at=now,
        updated_at=now,
    )
    db.add(review)

    review.overall_rating = body.overall_rating
    review.comment = body.comment.strip() or None
    for key in REVIEW_DIMENSION_KEYS:
        setattr(review, key, getattr(body, key))

    db.commit()
    db.refresh(review)
    return _serialize_user_stay_review(review)


@app.get("/api/listings/{listing_id}/stay-reviews")
def get_listing_stay_reviews(
    listing_id: int,
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, Any]:
    _listing_or_404(db, listing_id)
    stmt = (
        select(UserStayReview, User)
        .join(User, User.id == UserStayReview.user_id)
        .where(UserStayReview.listing_id == listing_id)
        .order_by(UserStayReview.updated_at.desc(), UserStayReview.id.desc())
    )
    rows = db.execute(stmt).all()
    reviews = []
    for review, user in rows:
        payload = _serialize_user_stay_review(review)
        payload["reviewer_name"] = (
            user.full_name.strip()
            if isinstance(user.full_name, str) and user.full_name.strip()
            else user.email
        )
        reviews.append(payload)
    return {"reviews": reviews, "total": len(reviews)}


@app.get("/api/users/{user_id}/stays/{listing_id}/review")
def get_user_stay_review(
    user_id: int,
    listing_id: int,
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, Any]:
    _user_or_404(db, user_id)
    _listing_or_404(db, listing_id)
    review = db.scalars(
        select(UserStayReview).where(
            UserStayReview.user_id == user_id,
            UserStayReview.listing_id == listing_id,
        )
    ).first()
    if review is None:
        raise HTTPException(status_code=404, detail="Review not found")
    return _serialize_user_stay_review(review)


@app.delete("/api/users/{user_id}/stays/{listing_id}/review")
def delete_user_stay_review(
    user_id: int,
    listing_id: int,
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, Any]:
    _user_or_404(db, user_id)
    _listing_or_404(db, listing_id)
    review = db.scalars(
        select(UserStayReview).where(
            UserStayReview.user_id == user_id,
            UserStayReview.listing_id == listing_id,
        )
    ).first()
    if review is None:
        raise HTTPException(status_code=404, detail="Review not found")
    db.delete(review)
    db.commit()
    return {"ok": True}


@app.get("/api/users/{user_id}/listing-flags")
def get_user_listing_flags(
    user_id: int,
    db: Annotated[Session, Depends(get_db)],
    listing_ids: str = Query(..., description="Comma-separated listing ids"),
) -> dict[str, Any]:
    _user_or_404(db, user_id)
    raw_ids = [x.strip() for x in listing_ids.split(",") if x.strip()]
    ids: list[int] = []
    for x in raw_ids:
        try:
            ids.append(int(x))
        except ValueError:
            continue
    if not ids:
        return {"flags": {}}
    fav_rows = db.scalars(
        select(UserFavorite.listing_id).where(
            UserFavorite.user_id == user_id,
            UserFavorite.listing_id.in_(ids),
        )
    ).all()
    fav_set = set(fav_rows)
    stay_rows = db.scalars(
        select(UserStay.listing_id).where(
            UserStay.user_id == user_id,
            UserStay.listing_id.in_(ids),
        )
    ).all()
    stay_set = set(stay_rows)
    review_rows = db.scalars(
        select(UserStayReview.listing_id).where(
            UserStayReview.user_id == user_id,
            UserStayReview.listing_id.in_(ids),
        )
    ).all()
    review_set = set(review_rows)
    flags: dict[str, dict[str, bool]] = {}
    for lid in ids:
        flags[str(lid)] = {
            "favorited": lid in fav_set,
            "stayed": lid in stay_set,
            "reviewed": lid in review_set,
        }
    return {"flags": flags}


@app.get("/api/onboarding/rooms")
def get_onboarding_rooms(
    db: Annotated[Session, Depends(get_db)],
) -> list[dict[str, Any]]:
    """Return 8 random listings that each have at least one vibe tag, for onboarding swipe cards."""
    import random
    from sqlalchemy import func as sqlfunc

    # Pick listing IDs that have at least one ListingTag entry with non-empty vibe_tags
    tag_subq = (
        select(ListingTag.listing_id)
        .where(ListingTag.vibe_tags.isnot(None))
        .where(ListingTag.vibe_tags != "")
        .distinct()
        .subquery()
    )
    ids_result = db.scalars(select(tag_subq.c.listing_id)).all()
    if not ids_result:
        return []

    sample_ids = random.sample(list(ids_result), min(8, len(ids_result)))

    rows = db.scalars(
        select(Listing)
        .where(Listing.id.in_(sample_ids))
        .options(selectinload(Listing.listing_tags))
    ).all()

    result = []
    for listing in rows:
        result.append({
            "id": listing.id,
            "name": listing.name,
            "picture_url": listing.picture_url,
            "price_clean": _json_value(listing.price_clean),
            "room_type": listing.room_type,
            "neighbourhood_cleansed": listing.neighbourhood_cleansed,
            "vibe_tags": (
                listing.listing_tags[0].vibe_tags
                if listing.listing_tags
                else ""
            ),
        })
    return result


class PreferencesBody(BaseModel):
    user_id: int
    tag_scores: dict[str, int]  # {tag_name: score}


@app.post("/api/auth/preferences")
def save_preferences(
    body: PreferencesBody,
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, Any]:
    """Upsert vibe-tag preference scores for a user after onboarding."""
    user = db.get(User, body.user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    # Delete existing preferences and replace with new ones
    db.query(UserPreference).filter(UserPreference.user_id == body.user_id).delete()
    for tag_name, score in body.tag_scores.items():
        if tag_name.strip() and score > 0:
            pref = UserPreference(
                user_id=body.user_id,
                tag_name=tag_name.strip(),
                preference_score=score,
            )
            db.add(pref)
    db.commit()

    # Find the top tag and sync to User table
    top_tag = max(body.tag_scores.items(), key=lambda x: x[1], default=(None, 0))
    top_tag_value = top_tag[0] if top_tag[1] > 0 else None
    user.top_vibe_tag = top_tag_value
    db.commit()

    return {"message": "Preferences saved", "top_vibe_tag": top_tag_value}


@app.get("/api/auth/preferences/{user_id}")
def get_preferences(
    user_id: int,
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, Any]:
    """Return the user's vibe tag preference scores and top tag."""
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    prefs = db.scalars(
        select(UserPreference)
        .where(UserPreference.user_id == user_id)
        .order_by(UserPreference.preference_score.desc())
    ).all()

    tag_scores = {p.tag_name: p.preference_score for p in prefs}
    return {
        "user_id": user_id,
        "top_vibe_tag": user.top_vibe_tag,
        "tag_scores": tag_scores,
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
    vibe_tags_mode: str = Query(
        "or",
        description="How multiple vibe_tags combine: `or` = match any tag; `and` = listing must match every tag (substring on vibe_tags).",
    ),
    q: Optional[str] = Query(
        None,
        description="Free-text search: whitespace-separated tokens; each token must match listing name or neighbourhood (case-insensitive).",
    ),
    north: Optional[float] = Query(None, ge=-90, le=90),
    south: Optional[float] = Query(None, ge=-90, le=90),
    east: Optional[float] = Query(None, ge=-180, le=180),
    west: Optional[float] = Query(None, ge=-180, le=180),
    map_mode: Optional[bool] = Query(
        False,
        description="Optional map viewport mode; when true and bbox is provided, filter by latitude/longitude bounds.",
    ),
    skip: Optional[int] = Query(0, ge=0, description="Number of records to skip for pagination"),
    limit: Optional[int] = Query(20, ge=1, le=100, description="Max records to return per page"),
) -> dict[str, Any]:
    if map_mode:
        logger.info(
            "listings map_mode request",
            extra={
                "north": north,
                "south": south,
                "east": east,
                "west": west,
                "skip": skip,
                "limit": limit,
            },
        )
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

    q_stripped = (q or "").strip() if q is not None else ""
    if q_stripped:
        for token in q_stripped.split():
            if not token:
                continue
            pat = f"%{token}%"
            stmt = stmt.where(
                or_(
                    Listing.name.ilike(pat),
                    Listing.neighbourhood_cleansed.ilike(pat),
                )
            )

    # Optional viewport-bound filtering for full map search.
    if map_mode and None not in (north, south, east, west):
        if south > north:
            raise HTTPException(status_code=422, detail="Invalid bbox: south must be <= north")
        if west > east:
            raise HTTPException(status_code=422, detail="Invalid bbox: west must be <= east")
        stmt = stmt.where(Listing.latitude.isnot(None), Listing.longitude.isnot(None))
        stmt = stmt.where(Listing.latitude >= float(south), Listing.latitude <= float(north))
        stmt = stmt.where(Listing.longitude >= float(west), Listing.longitude <= float(east))

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
            mode = (vibe_tags_mode or "or").strip().lower()
            if mode not in ("and", "or"):
                raise HTTPException(
                    status_code=422,
                    detail="vibe_tags_mode must be 'and' or 'or'",
                )
            if mode == "and":
                for cond in tag_filters:
                    stmt = stmt.where(cond)
                stmt = stmt.distinct()
            else:
                stmt = stmt.where(or_(*tag_filters)).distinct()

    # Count total before pagination
    from sqlalchemy import func
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total_count = db.scalar(count_stmt) or 0

    stmt = stmt.order_by(Listing.id)
    stmt = stmt.offset(skip).limit(limit)
    rows = db.scalars(stmt).all()
    if map_mode:
        logger.info(
            "listings map_mode response",
            extra={"count": len(rows), "total": total_count},
        )
    return {
        "listings": [_listing_full(x) for x in rows],
        "total": total_count,
        "skip": skip,
        "limit": limit,
    }


@app.get("/api/map/pois")
def get_map_pois(
    north: float = Query(..., ge=-90, le=90),
    south: float = Query(..., ge=-90, le=90),
    east: float = Query(..., ge=-180, le=180),
    west: float = Query(..., ge=-180, le=180),
    category: str = Query(
        "transport",
        description="POI category: transport | park | restaurant | education | hospital",
    ),
) -> dict[str, Any]:
    global _overpass_breaker_until
    if south > north:
        raise HTTPException(status_code=422, detail="Invalid bbox: south must be <= north")
    if west > east:
        raise HTTPException(status_code=422, detail="Invalid bbox: west must be <= east")

    # Round cache keys slightly so micro-pan jitters do not thrash Overpass.
    key = (
        category,
        round(south, 4),
        round(west, 4),
        round(north, 4),
        round(east, 4),
    )
    now = time.monotonic()
    if now < _overpass_breaker_until:
        wait_sec = int(max(1, _overpass_breaker_until - now))
        raise HTTPException(
            status_code=503,
            detail=f"Map POI service cooling down after upstream failures. Retry in ~{wait_sec}s.",
        )
    offline_pois, generated_at, coverage = load_offline_pois(
        south=south,
        west=west,
        north=north,
        east=east,
        category=category,
    )
    if generated_at is not None:
        return {
            "pois": offline_pois,
            "cached": False,
            "upstream": None,
            "fallback_used": False,
            "source": "offline",
            "generated_at": generated_at,
            "coverage": coverage,
        }

    cached = _overpass_cache.get(key)
    if cached is not None and (now - cached[0]) < OVERPASS_CACHE_TTL_SEC:
        return {
            "pois": cached[1],
            "cached": True,
            "upstream": None,
            "fallback_used": False,
            "source": "cache",
            "generated_at": None,
            "coverage": 0.0,
        }

    try:
        pois, upstream, fallback_used = fetch_pois_bbox(
            south=south,
            west=west,
            north=north,
            east=east,
            category=category,
        )
    except Exception as e:
        _overpass_breaker_until = time.monotonic() + OVERPASS_FAILURE_WINDOW_SEC
        logger.warning("map pois upstream failure: %s", e)
        raise HTTPException(status_code=502, detail=f"Overpass upstream failed: {e}") from e

    _overpass_cache[key] = (now, pois)
    return {
        "pois": pois,
        "cached": False,
        "upstream": upstream,
        "fallback_used": fallback_used,
        "source": "online_fallback",
        "generated_at": None,
        "coverage": 0.0,
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


# =============================================================================
# Admin API Endpoints
# =============================================================================

def _now_iso() -> str:
    return datetime.now().strftime("%Y-%m-%dT%H:%M:%S")


# --- Admin Login ---

class AdminLoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=64)
    password: str = Field(..., min_length=1, max_length=256)


@app.post("/api/admin/login")
def admin_login(
    body: AdminLoginRequest,
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, Any]:
    admin = db.scalars(
        select(AdminUser).where(AdminUser.username == body.username)
    ).first()
    if admin is None or not _verify_password(body.password, admin.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )
    if not admin.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin account is disabled",
        )
    return {
        "message": "Login successful",
        "username": admin.username,
        "email": admin.email,
    }


def _admin_user_public_dict(user: User) -> dict[str, Any]:
    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "avatar_url": user.avatar_url,
        "created_at": user.created_at,
        "top_vibe_tag": user.top_vibe_tag,
    }


@app.get("/api/admin/users/stats")
def admin_users_stats(
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, Any]:
    total_users = int(db.scalar(select(func.count()).select_from(User)) or 0)
    total_stay_reviews = int(
        db.scalar(select(func.count()).select_from(UserStayReview)) or 0
    )
    users_with_stays_sub = select(UserStay.user_id).distinct().subquery()
    users_with_stays = int(
        db.scalar(select(func.count()).select_from(users_with_stays_sub)) or 0
    )
    users_with_favorites_sub = select(UserFavorite.user_id).distinct().subquery()
    users_with_favorites = int(
        db.scalar(select(func.count()).select_from(users_with_favorites_sub)) or 0
    )
    return {
        "total_users": total_users,
        "users_with_stays": users_with_stays,
        "users_with_favorites": users_with_favorites,
        "total_stay_reviews": total_stay_reviews,
    }


@app.get("/api/admin/users")
def admin_list_users(
    db: Annotated[Session, Depends(get_db)],
    q: Optional[str] = None,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> dict[str, Any]:
    filters = []
    if q is not None and str(q).strip():
        filters.append(User.email.ilike(f"%{str(q).strip()}%"))

    count_stmt = select(func.count()).select_from(User)
    if filters:
        count_stmt = count_stmt.where(*filters)
    total = int(db.scalar(count_stmt) or 0)

    stmt = select(User).where(*filters).order_by(User.id.desc()).limit(limit).offset(offset)
    rows = db.scalars(stmt).all()
    user_ids = [u.id for u in rows]

    fav_map: dict[int, int] = {}
    stay_map: dict[int, int] = {}
    rev_map: dict[int, int] = {}
    if user_ids:
        fav_map = {
            int(uid): int(c)
            for uid, c in db.execute(
                select(UserFavorite.user_id, func.count())
                .where(UserFavorite.user_id.in_(user_ids))
                .group_by(UserFavorite.user_id)
            ).all()
        }
        stay_map = {
            int(uid): int(c)
            for uid, c in db.execute(
                select(UserStay.user_id, func.count())
                .where(UserStay.user_id.in_(user_ids))
                .group_by(UserStay.user_id)
            ).all()
        }
        rev_map = {
            int(uid): int(c)
            for uid, c in db.execute(
                select(UserStayReview.user_id, func.count())
                .where(UserStayReview.user_id.in_(user_ids))
                .group_by(UserStayReview.user_id)
            ).all()
        }

    users_out = []
    for u in rows:
        uid = u.id
        item = _admin_user_public_dict(u)
        item["favorite_count"] = fav_map.get(uid, 0)
        item["stay_count"] = stay_map.get(uid, 0)
        item["stay_review_count"] = rev_map.get(uid, 0)
        users_out.append(item)

    return {"users": users_out, "total": total, "limit": limit, "offset": offset}


@app.get("/api/admin/users/{user_id}")
def admin_user_detail(
    user_id: int,
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, Any]:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    stays_out: list[dict[str, Any]] = []
    for stay, listing_name in db.execute(
        select(UserStay, Listing.name)
        .outerjoin(Listing, Listing.id == UserStay.listing_id)
        .where(UserStay.user_id == user_id)
        .order_by(UserStay.id.desc())
    ).all():
        stays_out.append(
            {
                "listing_id": stay.listing_id,
                "listing_name": listing_name
                if isinstance(listing_name, str) and listing_name.strip()
                else f"Listing {stay.listing_id}",
                "created_at": stay.created_at,
                "stayed_at": stay.stayed_at,
            }
        )

    favorites_limit = 200
    fav_rows = db.execute(
        select(UserFavorite, Listing.name)
        .outerjoin(Listing, Listing.id == UserFavorite.listing_id)
        .where(UserFavorite.user_id == user_id)
        .order_by(UserFavorite.id.desc())
        .limit(favorites_limit)
    ).all()
    favorites_out: list[dict[str, Any]] = []
    for fav, listing_name in fav_rows:
        favorites_out.append(
            {
                "listing_id": fav.listing_id,
                "listing_name": listing_name
                if isinstance(listing_name, str) and listing_name.strip()
                else f"Listing {fav.listing_id}",
                "created_at": fav.created_at,
            }
        )

    reviews_out: list[dict[str, Any]] = []
    for review, listing_name in db.execute(
        select(UserStayReview, Listing.name)
        .outerjoin(Listing, Listing.id == UserStayReview.listing_id)
        .where(UserStayReview.user_id == user_id)
        .order_by(
            UserStayReview.updated_at.desc().nulls_last(),
            UserStayReview.id.desc(),
        )
    ).all():
        payload = _serialize_user_stay_review(review)
        payload["listing_name"] = (
            listing_name
            if isinstance(listing_name, str) and listing_name.strip()
            else f"Listing {review.listing_id}"
        )
        reviews_out.append(payload)

    return {
        "user": _admin_user_public_dict(user),
        "stays": stays_out,
        "favorites": favorites_out,
        "favorites_truncated": len(fav_rows) >= favorites_limit,
        "favorites_limit": favorites_limit,
        "stay_reviews": reviews_out,
    }


# --- Scenic Spots CRUD ---

class ScenicSpotCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    category: str = Field(..., min_length=1, max_length=128)
    description: Optional[str] = None


class ScenicSpotUpdate(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    category: str = Field(..., min_length=1, max_length=128)
    description: Optional[str] = None


def _scenic_spot_dict(scenic: ScenicSpot) -> dict[str, Any]:
    return {
        "id": scenic.id,
        "name": scenic.name,
        "latitude": _json_value(scenic.latitude),
        "longitude": _json_value(scenic.longitude),
        "category": scenic.category,
        "description": scenic.description,
        "created_at": scenic.created_at,
        "updated_at": scenic.updated_at,
    }


@app.get("/api/admin/scenics")
def list_scenics(
    db: Annotated[Session, Depends(get_db)],
    q: Optional[str] = Query(None, description="Search scenic spots by name"),
) -> list[dict[str, Any]]:
    stmt = select(ScenicSpot)
    q_stripped = (q or "").strip()
    if q_stripped:
        stmt = stmt.where(ScenicSpot.name.ilike(f"%{q_stripped}%"))
    rows = db.scalars(stmt.order_by(ScenicSpot.id.desc())).all()
    return [_scenic_spot_dict(r) for r in rows]


@app.post("/api/admin/scenics")
def create_scenic(
    body: ScenicSpotCreate,
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, Any]:
    now = datetime.utcnow().isoformat()
    scenic = ScenicSpot(
        name=body.name.strip(),
        latitude=body.latitude,
        longitude=body.longitude,
        category=body.category.strip(),
        description=(body.description or "").strip() or None,
        created_at=now,
        updated_at=now,
    )
    db.add(scenic)
    db.commit()
    db.refresh(scenic)
    return _scenic_spot_dict(scenic)


@app.put("/api/admin/scenics/{scenic_id}")
def update_scenic(
    scenic_id: int,
    body: ScenicSpotUpdate,
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, Any]:
    scenic = db.get(ScenicSpot, scenic_id)
    if scenic is None:
        raise HTTPException(status_code=404, detail="Scenic spot not found")
    scenic.name = body.name.strip()
    scenic.latitude = body.latitude
    scenic.longitude = body.longitude
    scenic.category = body.category.strip()
    scenic.description = (body.description or "").strip() or None
    scenic.updated_at = datetime.utcnow().isoformat()
    db.commit()
    db.refresh(scenic)
    return _scenic_spot_dict(scenic)


@app.delete("/api/admin/scenics/{scenic_id}")
def delete_scenic(
    scenic_id: int,
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, str]:
    scenic = db.get(ScenicSpot, scenic_id)
    if scenic is None:
        raise HTTPException(status_code=404, detail="Scenic spot not found")
    db.delete(scenic)
    db.commit()
    return {"message": "Scenic spot deleted"}


# --- Strategy Config ---

class StrategyConfigUpdate(BaseModel):
    scenic_weight: int = Field(..., ge=0, le=100)
    cost_weight: int = Field(..., ge=0, le=100)
    sentiment_weight: int = Field(..., ge=0, le=100)
    preference_weight: int = Field(..., ge=0, le=100)
    default_preference_tags: Optional[dict[str, int]] = Field(
        default=None,
        description="Vibe tag → score for Admin preview and guest fallback. Omit to leave unchanged.",
    )


def _strategy_config_dict(config: StrategyConfig | None) -> dict[str, Any]:
    if config is None:
        tags = parse_default_preference_json(None)
        return {
            "config_key": "default",
            "scenic_weight": 28,
            "cost_weight": 24,
            "sentiment_weight": 26,
            "preference_weight": 22,
            "default_preference_tags": tags,
            "updated_at": None,
        }
    tags = parse_default_preference_json(config.default_preference_json)
    return {
        "config_key": config.config_key,
        "scenic_weight": config.scenic_weight,
        "cost_weight": config.cost_weight,
        "sentiment_weight": config.sentiment_weight,
        "preference_weight": config.preference_weight,
        "default_preference_tags": tags,
        "updated_at": config.updated_at,
    }


@app.get("/api/strategy")
def get_public_strategy(db: Annotated[Session, Depends(get_db)]) -> dict[str, Any]:
    """Public strategy weights + default vibe preferences (for client-side ranking)."""
    config = db.scalars(
        select(StrategyConfig).where(StrategyConfig.config_key == "default")
    ).first()
    d = _strategy_config_dict(config)
    return {k: v for k, v in d.items() if k in ("scenic_weight", "cost_weight", "sentiment_weight", "preference_weight", "default_preference_tags")}


@app.get("/api/admin/strategy")
def get_strategy(db: Annotated[Session, Depends(get_db)]) -> dict[str, Any]:
    config = db.scalars(
        select(StrategyConfig).where(StrategyConfig.config_key == "default")
    ).first()
    return _strategy_config_dict(config)


@app.put("/api/admin/strategy")
def update_strategy(
    body: StrategyConfigUpdate,
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, Any]:
    config = db.scalars(
        select(StrategyConfig).where(StrategyConfig.config_key == "default")
    ).first()
    if config is None:
        pref_json = serialize_default_preference(body.default_preference_tags)
        config = StrategyConfig(
            config_key="default",
            scenic_weight=body.scenic_weight,
            cost_weight=body.cost_weight,
            sentiment_weight=body.sentiment_weight,
            preference_weight=body.preference_weight,
            default_preference_json=pref_json,
            updated_at=_now_iso(),
        )
        db.add(config)
    else:
        config.scenic_weight = body.scenic_weight
        config.cost_weight = body.cost_weight
        config.sentiment_weight = body.sentiment_weight
        config.preference_weight = body.preference_weight
        if body.default_preference_tags is not None:
            config.default_preference_json = serialize_default_preference(body.default_preference_tags)
        config.updated_at = _now_iso()
    db.commit()
    db.refresh(config)
    return _strategy_config_dict(config)


@app.get("/api/admin/strategy/preview-ranking")
def admin_strategy_preview_ranking(
    db: Annotated[Session, Depends(get_db)],
    limit: int = Query(6, ge=1, le=60),
) -> dict[str, Any]:
    """Rank real listings using saved weights, Admin default vibe tags, and merged offline POIs."""
    config = db.scalars(
        select(StrategyConfig).where(StrategyConfig.config_key == "default")
    ).first()
    d = _strategy_config_dict(config)
    tag_weights = d["default_preference_tags"]
    if not isinstance(tag_weights, dict):
        tag_weights = parse_default_preference_json(None)

    pois = load_merged_pois_from_cache()
    # Fixed pool cap so cost normalization matches across preview limits (e.g. Admin 6 vs Rank 20).
    preview_pool_cap = 200
    pool_stmt = (
        select(Listing)
        .options(selectinload(Listing.listing_tags))
        .where(Listing.latitude.isnot(None), Listing.longitude.isnot(None))
        .order_by(Listing.id)
        .limit(preview_pool_cap)
    )
    pool_rows = db.scalars(pool_stmt).all()
    pool_price_dicts: list[dict[str, Any]] = []
    for r in pool_rows:
        p = r.price_clean
        if p is None:
            continue
        try:
            v = float(p)
        except (TypeError, ValueError):
            continue
        if v > 0:
            pool_price_dicts.append({"price_clean": v})
    pool_pmin, pool_pmax = price_bounds(pool_price_dicts)
    scored: list[tuple[float, int, Listing]] = []
    for row in pool_rows:
        try:
            la = float(row.latitude)
            lo = float(row.longitude)
        except (TypeError, ValueError):
            continue
        poi_only = poi_proximity_score_0_100(la, lo, pois)
        scored.append((-poi_only, row.id or 0, row))
    scored.sort(key=lambda t: (t[0], t[1]))
    rows = [t[2] for t in scored[:limit]]
    listings = [_listing_full(x) for x in rows]
    ranked = rank_listings_payload(
        listings,
        pois=pois,
        tag_weights=tag_weights,
        w_poi=int(d["scenic_weight"]),
        w_cost=int(d["cost_weight"]),
        w_sentiment=int(d["sentiment_weight"]),
        w_pref=int(d["preference_weight"]),
        include_breakdown=True,
        price_bounds_override=(pool_pmin, pool_pmax),
    )
    rankings: list[dict[str, Any]] = []
    for item in ranked:
        li = item["listing"]
        rankings.append(
            {
                "id": li.get("id"),
                "name": li.get("name"),
                "neighbourhood_cleansed": li.get("neighbourhood_cleansed"),
                "score": item["score"],
                "breakdown": item.get("breakdown"),
            }
        )
    return {
        "rankings": rankings,
        "preference_source": "admin_default",
        "poi_count": len(pois),
        "listing_count": len(listings),
    }


# --- Sync Logs ---

class SyncLogCreate(BaseModel):
    filename: Optional[str] = Field(default=None, max_length=256)
    file_type: str = Field(default="CSV", max_length=32)
    status: str = Field(default="success", max_length=16)
    total_rows: int = Field(default=0, ge=0)
    records_updated: int = Field(default=0, ge=0)
    duplicates: int = Field(default=0, ge=0)
    invalid: int = Field(default=0, ge=0)
    error_summary: Optional[str] = None


@app.get("/api/admin/sync-logs")
def list_sync_logs(db: Annotated[Session, Depends(get_db)]) -> list[dict[str, Any]]:
    rows = db.scalars(
        select(SyncLog).order_by(SyncLog.id.desc())
    ).all()
    return [
        {
            "id": r.id,
            "date": r.sync_date,
            "filename": r.filename,
            "file_type": r.file_type,
            "status": r.status,
            "total_rows": r.total_rows,
            "records_updated": r.records_updated,
            "inserted": r.records_updated,
            "duplicates": r.duplicates,
            "invalid": r.invalid,
        }
        for r in rows
    ]


@app.delete("/api/admin/sync-logs/{log_id}")
def delete_sync_log(
    log_id: int,
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, Any]:
    """Delete a sync log and its associated data from the database."""
    log = db.scalars(
        select(SyncLog).where(SyncLog.id == log_id)
    ).first()
    
    if not log:
        raise HTTPException(status_code=404, detail="Sync log not found")
    
    deleted_count = 0
    conn = db.connection()
    
    # Delete associated data based on file_type (case-insensitive)
    file_type_lower = log.file_type.lower() if log.file_type else ""
    if "listings" in file_type_lower:
        # Get listing IDs that were affected by this sync
        if log.affected_ids:
            import json
            try:
                listing_ids = json.loads(log.affected_ids)
                if listing_ids:
                    placeholders = ", ".join([f":{i}" for i in range(len(listing_ids))])
                    conn.exec_driver_sql(
                        f"DELETE FROM listings WHERE id IN ({placeholders})",
                        {str(i): lid for i, lid in enumerate(listing_ids)}
                    )
                    deleted_count = len(listing_ids)
            except:
                pass
    elif "calendar" in file_type_lower:
        conn.exec_driver_sql("DELETE FROM calendar")
        deleted_count = db.execute(text("SELECT COUNT(*) FROM calendar")).scalar() or 0
    elif "reviews" in file_type_lower:
        conn.exec_driver_sql("DELETE FROM reviews")
        deleted_count = db.execute(text("SELECT COUNT(*) FROM reviews")).scalar() or 0
    elif "tags" in file_type_lower:
        conn.exec_driver_sql("DELETE FROM listing_tags")
        deleted_count = db.execute(text("SELECT COUNT(*) FROM listing_tags")).scalar() or 0
    
    # Delete the sync log entry
    db.delete(log)
    db.commit()
    
    return {"message": "Sync log deleted successfully", "id": log_id, "deleted_count": deleted_count}


@app.post("/api/admin/sync-logs")
def create_sync_log(
    body: SyncLogCreate,
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, Any]:
    log = SyncLog(
        filename=body.filename,
        file_type=body.file_type,
        status=body.status,
        total_rows=body.total_rows,
        records_updated=body.records_updated,
        duplicates=body.duplicates,
        invalid=body.invalid,
        error_summary=body.error_summary,
        sync_date=_now_iso(),
        created_at=_now_iso(),
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return {
        "id": log.id,
        "date": log.sync_date,
        "filename": log.filename,
        "file_type": log.file_type,
        "status": log.status,
        "total_rows": log.total_rows,
        "records_updated": log.records_updated,
        "inserted": log.records_updated,
        "duplicates": log.duplicates,
        "invalid": log.invalid,
    }


# --- Sync Status ---

@app.get("/api/admin/sync/status")
def get_sync_status(db: Annotated[Session, Depends(get_db)]) -> dict[str, Any]:
    """Return current record counts for each sync-related table."""
    from sqlalchemy import text as sql_text
    conn = db.connection()
    
    tables = ["listings", "calendar", "monthly_metrics", "reviews", "listing_tags"]
    counts = {}
    for table in tables:
        try:
            result = conn.exec_driver_sql(f"SELECT COUNT(*) FROM {table}").scalar_one_or_none()
            counts[table] = result or 0
        except Exception:
            counts[table] = 0
    
    return {"tables": counts}


# --- Sync Upload (Real CSV/XLSX Upload) ---

@app.post("/api/admin/sync/upload-file")
async def sync_upload_file(
    db: Annotated[Session, Depends(get_db)],
    file: Annotated[UploadFile, File(description="CSV or XLSX file to upload")],
) -> dict[str, Any]:
    """
    Upload a single CSV or XLSX file for data synchronization.
    Supported file types: listings, calendar, reviews, listing_tags
    """
    import pandas as pd
    from io import BytesIO
    from sqlalchemy import text as sql_text
    
    if file is None:
        raise HTTPException(status_code=400, detail="No file provided")
    
    # Detect file type based on extension
    filename_lower = file.filename.lower() if file.filename else ""
    is_xlsx = filename_lower.endswith('.xlsx') or filename_lower.endswith('.xls')
    is_csv = filename_lower.endswith('.csv')
    
    if not is_csv and not is_xlsx:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file format. Please upload a .csv or .xlsx file."
        )
    
    # Validate file type based on filename keywords
    # Order matters: more specific names first (e.g. "listing" would match inside "listing_tags").
    allowed_types = {
        "listing_tags": ["listing_tags", "room_tags", "tags"],
        "listings": ["listings", "cleaned_listings"],
        "calendar": ["calendar", "calendars", "calendar_cleaned"],
        "reviews": ["reviews", "review"],
    }
    
    file_type = None
    for ft, keywords in allowed_types.items():
        if any(kw in filename_lower for kw in keywords):
            file_type = ft
            break
    
    if file_type is None:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type. Allowed keywords: {', '.join(allowed_types.keys())}"
        )
    
    # Read and parse file
    content = await file.read()
    
    try:
        if len(content) > 5 * 1024 * 1024:  # 5MB limit
            raise HTTPException(status_code=413, detail="File too large (max 5MB)")
        
        # Parse based on file format
        if is_xlsx:
            import openpyxl
            df = pd.read_excel(BytesIO(content), engine='openpyxl')
        else:
            try:
                csv_text = content.decode("utf-8")
            except UnicodeDecodeError:
                csv_text = content.decode("latin-1")
            df = pd.read_csv(BytesIO(csv_text.encode('utf-8')))
        
        if df.empty:
            raise HTTPException(status_code=400, detail="File is empty")
        
    except pd.errors.ParserError as e:
        raise HTTPException(status_code=400, detail=f"Invalid file format: {str(e)}")
    except ImportError as e:
        raise HTTPException(status_code=400, detail=f"Missing library for Excel files: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse file: {str(e)}")
    
    conn = db.connection()
    rows_processed = 0
    
    try:
        if file_type == "listings":
            # Validate required columns
            required_cols = ["id", "name", "price_clean", "latitude", "longitude"]
            missing = [c for c in required_cols if c not in df.columns]
            if missing:
                raise HTTPException(
                    status_code=400,
                    detail=f"Missing required columns: {', '.join(missing)}"
                )

            # Clean and prepare data
            df["id"] = pd.to_numeric(df["id"], errors="coerce").fillna(0).astype("int64")
            df = df.dropna(subset=["id"])
            df["id"] = df["id"].astype("int64")

            # Clean boolean columns
            bool_cols = ["has_wifi", "has_parking", "has_kitchen", "has_air_conditioning", "has_tv", "has_balcony"]
            for col in bool_cols:
                if col in df.columns:
                    df[col] = df[col].map(
                        lambda x: True if str(x).lower() in ["true", "t", "1", "yes", "y"]
                        else False if str(x).lower() in ["false", "f", "0", "no", "n"]
                        else x
                    ).fillna(False).astype(bool)

            # Numeric columns
            num_cols = ["accommodates", "bedrooms", "beds", "price_clean", "review_scores_rating",
                       "number_of_reviews", "average_sentiment_score", "intelligent_score"]
            for col in num_cols:
                if col in df.columns:
                    df[col] = pd.to_numeric(df[col], errors="coerce")

            columns = [c for c in df.columns if c in [
                "id", "name", "description", "picture_url", "listing_url", "gallery_urls",
                "property_type", "room_type", "accommodates", "price_clean", "bedrooms", "beds",
                "bathrooms_num", "bathrooms_text", "latitude", "longitude", "neighbourhood_cleansed",
                "neighborhood_overview", "review_scores_rating", "number_of_reviews",
                "has_wifi", "has_parking", "has_kitchen", "has_air_conditioning", "has_tv", "has_balcony",
                "average_sentiment_score", "intelligent_score", "sentiment_positive_ratio",
                "sentiment_neutral_ratio", "sentiment_negative_ratio", "sentiment_positive_count",
                "sentiment_neutral_count", "sentiment_negative_count"
            ]]

            if not columns:
                raise HTTPException(status_code=400, detail="No valid columns to import")

            cols_str = ", ".join(columns)
            placeholders = ", ".join([f":{c}" for c in columns])
            affected_ids = []

            for _, row in df[columns].iterrows():
                values = {c: (None if pd.isna(row[c]) else (bool(row[c]) if c in bool_cols and isinstance(row[c], bool) else row[c])) for c in columns}
                try:
                    if "id" in values and values["id"]:
                        affected_ids.append(int(values["id"]))
                    conn.exec_driver_sql(
                        f"INSERT OR REPLACE INTO listings ({cols_str}) VALUES ({placeholders})",
                        values
                    )
                    rows_processed += 1
                except Exception:
                    pass

            db.commit()

        elif file_type == "calendar":
            required_cols = ["listing_id", "date", "available", "price"]
            missing = [c for c in required_cols if c not in df.columns]
            if missing:
                raise HTTPException(
                    status_code=400,
                    detail=f"Missing required columns: {', '.join(missing)}"
                )

            # Parse available column
            if "available" in df.columns:
                df["available"] = df["available"].map(
                    lambda x: True if str(x).lower() in ["true", "t", "1", "yes", "y"]
                    else False
                ).fillna(False).astype(bool)

            columns = ["listing_id", "date", "available", "price", "adjusted_price"]
            cols_available = [c for c in columns if c in df.columns]

            if not cols_available:
                raise HTTPException(status_code=400, detail="No valid columns to import")

            for _, row in df[cols_available].iterrows():
                values = {c: (None if pd.isna(row[c]) else row[c]) for c in cols_available}
                try:
                    # Check if record exists
                    existing = conn.exec_driver_sql(
                        "SELECT id FROM calendar WHERE listing_id=:listing_id AND date=:date",
                        values
                    ).fetchone()

                    if existing:
                        # Update existing
                        set_clause = ", ".join([f"{c}=:update_{c}" for c in cols_available])
                        update_values = {f"update_{c}": values[c] for c in cols_available}
                        update_values["listing_id"] = values["listing_id"]
                        update_values["date"] = values["date"]
                        conn.exec_driver_sql(
                            f"UPDATE calendar SET {set_clause} WHERE listing_id=:listing_id AND date=:date",
                            update_values
                        )
                    else:
                        # Insert new
                        cols_str = ", ".join(cols_available)
                        placeholders = ", ".join([f":{c}" for c in cols_available])
                        conn.exec_driver_sql(
                            f"INSERT INTO calendar ({cols_str}) VALUES ({placeholders})",
                            values
                        )
                    rows_processed += 1
                except Exception:
                    pass

            db.commit()
            
        elif file_type == "reviews":
            required_cols = ["listing_id", "review_text_cleaned"]
            missing = [c for c in required_cols if c not in df.columns]
            if missing:
                raise HTTPException(
                    status_code=400,
                    detail=f"Missing required columns: {', '.join(missing)}"
                )

            columns = ["listing_id", "reviewer_name", "review_date", "review_text_cleaned",
                      "vibe_tags_detail", "sentiment_label"]
            cols_available = [c for c in columns if c in df.columns]

            if not cols_available:
                raise HTTPException(status_code=400, detail="No valid columns to import")

            for _, row in df[cols_available].iterrows():
                values = {c: (None if pd.isna(row[c]) else str(row[c])) for c in cols_available}
                try:
                    # Check if same listing_id+review_date exists
                    existing = conn.exec_driver_sql(
                        "SELECT id FROM reviews WHERE listing_id=:listing_id AND review_date=:review_date",
                        values
                    ).fetchone()

                    if existing:
                        set_clause = ", ".join([f"{c}=:update_{c}" for c in cols_available])
                        update_values = {f"update_{c}": values[c] for c in cols_available}
                        update_values["listing_id"] = values["listing_id"]
                        update_values["review_date"] = values.get("review_date")
                        conn.exec_driver_sql(
                            f"UPDATE reviews SET {set_clause} WHERE listing_id=:listing_id AND review_date=:review_date",
                            update_values
                        )
                    else:
                        cols_str = ", ".join(cols_available)
                        placeholders = ", ".join([f":{c}" for c in cols_available])
                        conn.exec_driver_sql(
                            f"INSERT INTO reviews ({cols_str}) VALUES ({placeholders})",
                            values
                        )
                    rows_processed += 1
                except Exception:
                    pass

            db.commit()

        elif file_type == "listing_tags":
            required_cols = ["listing_id", "vibe_tags"]
            missing = [c for c in required_cols if c not in df.columns]
            if missing:
                raise HTTPException(
                    status_code=400,
                    detail=f"Missing required columns: {', '.join(missing)}"
                )

            columns = ["listing_id", "vibe_tags"]

            for _, row in df[columns].iterrows():
                values = {c: (None if pd.isna(row[c]) else str(row[c])) for c in columns}
                try:
                    existing = conn.exec_driver_sql(
                        "SELECT id FROM listing_tags WHERE listing_id=:listing_id",
                        values
                    ).fetchone()

                    if existing:
                        conn.exec_driver_sql(
                            "UPDATE listing_tags SET vibe_tags=:vibe_tags WHERE listing_id=:listing_id",
                            values
                        )
                    else:
                        cols_str = ", ".join(columns)
                        placeholders = ", ".join([f":{c}" for c in columns])
                        conn.exec_driver_sql(
                            f"INSERT INTO listing_tags ({cols_str}) VALUES ({placeholders})",
                            values
                        )
                    rows_processed += 1
                except Exception:
                    pass

            db.commit()

            # Create sync log entry
        import json
        sync_log_kwargs = {
            "filename": file.filename,
            "file_type": file_type.upper() + (" (XLSX)" if is_xlsx else " (CSV)"),
            "status": "success",
            "total_rows": len(df),
            "records_updated": rows_processed,
            "duplicates": 0,
            "invalid": 0,
            "sync_date": _now_iso(),
            "created_at": _now_iso(),
        }
        # Store affected listing IDs for listings type
        if file_type == "listings" and affected_ids:
            sync_log_kwargs["affected_ids"] = json.dumps(affected_ids)

        log = SyncLog(**sync_log_kwargs)
        db.add(log)
        db.commit()
        db.refresh(log)

        return {
            "message": f"Successfully synced {file_type} data",
            "file_type": file_type.upper() + (" (XLSX)" if is_xlsx else " (CSV)"),
            "status": "success",
            "total_rows": len(df),
            "records_updated": rows_processed,
            "inserted": rows_processed,
            "duplicates": 0,
            "invalid": 0,
            "errors": [],
            "sync_log_id": log.id,
        }
        
    except HTTPException:
        raise
    except Exception as e:
        # Log error
        log = SyncLog(
            file_type=file_type.upper() if file_type else "UNKNOWN",
            status="error",
            records_updated=0,
            sync_date=_now_iso(),
            created_at=_now_iso(),
        )
        db.add(log)
        db.commit()
        raise HTTPException(status_code=500, detail=f"Sync failed: {str(e)}")
