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
import time
from typing import Annotated, Any, List, Optional

import bcrypt
from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import or_, select, text

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
)
from overpass_client import fetch_pois_bbox, load_offline_pois


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


@asynccontextmanager
async def lifespan(_app: FastAPI):
    Base.metadata.create_all(bind=engine)
    _ensure_user_profile_columns()
    yield


app = FastAPI(title="Airbnb DSS API", version="0.1.0", lifespan=lifespan)

# Upper bound for `min_price` / `max_price` query filters (keep in sync with search UI).
LISTING_PRICE_FILTER_MAX = 1000
OVERPASS_CACHE_TTL_SEC = 120.0
_overpass_cache: dict[tuple[str, float, float, float, float], tuple[float, list[dict[str, Any]]]] = {}
OVERPASS_FAILURE_WINDOW_SEC = 25.0
_overpass_breaker_until = 0.0
logger = logging.getLogger("map-api")

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


class ProfileResponse(BaseModel):
    user_id: int
    full_name: Optional[str] = None
    email: str
    avatar_url: Optional[str] = None
    created_at: Optional[str] = None


class ProfileUpdateBody(BaseModel):
    user_id: int
    full_name: str = Field(default="", max_length=120)
    email: str = Field(..., min_length=3, max_length=320)
    avatar_url: str = Field(default="")


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
        select(Listing)
        .join(UserStay, UserStay.listing_id == Listing.id)
        .where(UserStay.user_id == user_id)
        .options(selectinload(Listing.listing_tags))
        .order_by(UserStay.id.desc())
    )
    rows = db.scalars(stmt).all()
    return {"listings": [_listing_full(x) for x in rows], "total": len(rows)}


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
    flags: dict[str, dict[str, bool]] = {}
    for lid in ids:
        flags[str(lid)] = {
            "favorited": lid in fav_set,
            "stayed": lid in stay_set,
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

    # Find the top tag
    top_tag = max(body.tag_scores.items(), key=lambda x: x[1], default=(None, 0))
    return {"message": "Preferences saved", "top_vibe_tag": top_tag[0] if top_tag[1] > 0 else None}


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
    return datetime.utcnow().isoformat() + "Z"


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


# --- Scenic Spots CRUD ---

class ScenicSpotCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)
    description: Optional[str] = None
    radius_km: float = Field(default=8.0, ge=1.0, le=50.0)
    thumbnail_url: Optional[str] = None


class ScenicSpotUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=256)
    description: Optional[str] = None
    radius_km: Optional[float] = Field(None, ge=1.0, le=50.0)
    thumbnail_url: Optional[str] = None


@app.get("/api/admin/scenics")
def list_scenics(db: Annotated[Session, Depends(get_db)]) -> list[dict[str, Any]]:
    rows = db.scalars(select(ScenicSpot).order_by(ScenicSpot.id)).all()
    return [
        {
            "id": r.id,
            "name": r.name,
            "description": r.description,
            "radius_km": r.radius_km,
            "thumbnail_url": r.thumbnail_url,
            "created_at": r.created_at,
        }
        for r in rows
    ]


@app.post("/api/admin/scenics")
def create_scenic(
    body: ScenicSpotCreate,
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, Any]:
    scenic = ScenicSpot(
        name=body.name,
        description=body.description,
        radius_km=body.radius_km,
        thumbnail_url=body.thumbnail_url,
        created_at=_now_iso(),
    )
    db.add(scenic)
    db.commit()
    db.refresh(scenic)
    return {
        "id": scenic.id,
        "name": scenic.name,
        "description": scenic.description,
        "radius_km": scenic.radius_km,
        "thumbnail_url": scenic.thumbnail_url,
        "created_at": scenic.created_at,
    }


@app.put("/api/admin/scenics/{scenic_id}")
def update_scenic(
    scenic_id: int,
    body: ScenicSpotUpdate,
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, Any]:
    scenic = db.get(ScenicSpot, scenic_id)
    if scenic is None:
        raise HTTPException(status_code=404, detail="Scenic spot not found")
    if body.name is not None:
        scenic.name = body.name
    if body.description is not None:
        scenic.description = body.description
    if body.radius_km is not None:
        scenic.radius_km = body.radius_km
    if body.thumbnail_url is not None:
        scenic.thumbnail_url = body.thumbnail_url
    db.commit()
    db.refresh(scenic)
    return {
        "id": scenic.id,
        "name": scenic.name,
        "description": scenic.description,
        "radius_km": scenic.radius_km,
        "thumbnail_url": scenic.thumbnail_url,
        "created_at": scenic.created_at,
    }


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


@app.get("/api/admin/strategy")
def get_strategy(db: Annotated[Session, Depends(get_db)]) -> dict[str, Any]:
    config = db.scalars(
        select(StrategyConfig).where(StrategyConfig.config_key == "default")
    ).first()
    if config is None:
        return {
            "config_key": "default",
            "scenic_weight": 28,
            "cost_weight": 24,
            "sentiment_weight": 26,
            "preference_weight": 22,
            "updated_at": None,
        }
    return {
        "config_key": config.config_key,
        "scenic_weight": config.scenic_weight,
        "cost_weight": config.cost_weight,
        "sentiment_weight": config.sentiment_weight,
        "preference_weight": config.preference_weight,
        "updated_at": config.updated_at,
    }


@app.put("/api/admin/strategy")
def update_strategy(
    body: StrategyConfigUpdate,
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, Any]:
    config = db.scalars(
        select(StrategyConfig).where(StrategyConfig.config_key == "default")
    ).first()
    if config is None:
        config = StrategyConfig(
            config_key="default",
            scenic_weight=body.scenic_weight,
            cost_weight=body.cost_weight,
            sentiment_weight=body.sentiment_weight,
            preference_weight=body.preference_weight,
            updated_at=_now_iso(),
        )
        db.add(config)
    else:
        config.scenic_weight = body.scenic_weight
        config.cost_weight = body.cost_weight
        config.sentiment_weight = body.sentiment_weight
        config.preference_weight = body.preference_weight
        config.updated_at = _now_iso()
    db.commit()
    db.refresh(config)
    return {
        "config_key": config.config_key,
        "scenic_weight": config.scenic_weight,
        "cost_weight": config.cost_weight,
        "sentiment_weight": config.sentiment_weight,
        "preference_weight": config.preference_weight,
        "updated_at": config.updated_at,
    }


# --- Sync Logs ---

class SyncLogCreate(BaseModel):
    file_type: str = Field(default="CSV", max_length=32)
    status: str = Field(default="success", max_length=16)
    records_updated: int = Field(default=0, ge=0)


@app.get("/api/admin/sync-logs")
def list_sync_logs(db: Annotated[Session, Depends(get_db)]) -> list[dict[str, Any]]:
    rows = db.scalars(
        select(SyncLog).order_by(SyncLog.id.desc())
    ).all()
    return [
        {
            "id": r.id,
            "date": r.sync_date,
            "file_type": r.file_type,
            "status": r.status,
            "records_updated": r.records_updated,
        }
        for r in rows
    ]


@app.post("/api/admin/sync-logs")
def create_sync_log(
    body: SyncLogCreate,
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, Any]:
    log = SyncLog(
        file_type=body.file_type,
        status=body.status,
        records_updated=body.records_updated,
        sync_date=_now_iso(),
        created_at=_now_iso(),
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return {
        "id": log.id,
        "date": log.sync_date,
        "file_type": log.file_type,
        "status": log.status,
        "records_updated": log.records_updated,
    }
