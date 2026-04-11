"""Idempotently seed demo users, user_stays, and user_stay_reviews from Data/post_stay_reviews_seed.json.

Run from backend/ after listings exist (e.g. after ``python3 seed_data.py``):

    cd backend && python3 seed_post_stay_reviews.py

Uses the same SQLite file as the API: ../Data/airbnb_dss.db
"""

from __future__ import annotations

import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

import bcrypt
from sqlalchemy import select
from sqlalchemy.orm import Session

from database import Base, SessionLocal, engine

import models  # noqa: F401 — register ORM tables

from models import Listing, User, UserStay, UserStayReview

BACKEND_DIR = Path(__file__).resolve().parent
REPO_ROOT = BACKEND_DIR.parent
DATA_DIR = REPO_ROOT / "Data"
SEED_JSON = DATA_DIR / "post_stay_reviews_seed.json"

RATING_KEYS = (
    "listing_accuracy_rating",
    "airbnb_review_accuracy_rating",
    "cleanliness_rating",
    "host_communication_rating",
    "check_in_rating",
    "location_convenience_rating",
    "value_for_money_rating",
)


def _hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _now_iso() -> str:
    return datetime.utcnow().isoformat()


def _resolve_listing_id(db: Session, requested: int | None) -> int | None:
    if requested is not None:
        if db.get(Listing, requested) is not None:
            return requested
        print(f"  Warning: listing_id {requested} not found; trying first listing in DB.")
    first = db.scalars(select(Listing.id).order_by(Listing.id)).first()
    return int(first) if first is not None else None


def _ensure_user(db: Session, email: str, password: str, full_name: str | None) -> User:
    norm = _normalize_email(email)
    user = db.scalars(select(User).where(User.email == norm)).first()
    if user is not None:
        return user
    user = User(
        email=norm,
        password=_hash_password(password),
        full_name=(full_name.strip() if isinstance(full_name, str) and full_name.strip() else None),
        created_at=_now_iso(),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    print(f"  Created user {norm} (id={user.id})")
    return user


def _get_user_for_review(db: Session, row: dict[str, Any]) -> User | None:
    if row.get("user_id") is not None:
        uid = int(row["user_id"])
        user = db.get(User, uid)
        if user is None:
            print(f"  Skip: user_id {uid} not found")
        return user
    email = row.get("user_email")
    if not email:
        print("  Skip: need user_email or user_id")
        return None
    user = db.scalars(select(User).where(User.email == _normalize_email(str(email)))).first()
    if user is None:
        print(f"  Skip: no user for email {email}")
    return user


def main() -> None:
    if not SEED_JSON.is_file():
        print(f"Missing seed file: {SEED_JSON}", file=sys.stderr)
        sys.exit(1)

    raw = json.loads(SEED_JSON.read_text(encoding="utf-8"))
    ensure_users = raw.get("ensure_users") or []
    reviews = raw.get("reviews") or []

    print("Ensuring schema (users, user_stays, user_stay_reviews, ...) ...")
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        print("Ensuring users from JSON ...")
        for u in ensure_users:
            email = u.get("email")
            password = u.get("password")
            if not email or not password:
                print("  Skip ensure_users row: missing email or password")
                continue
            _ensure_user(db, str(email), str(password), u.get("full_name"))

        if not reviews:
            print("No reviews in JSON; done.")
            return

        if db.scalars(select(Listing.id).limit(1)).first() is None:
            print("No listings in database. Run seed_data.py first.", file=sys.stderr)
            sys.exit(1)

        inserted = 0
        skipped = 0
        for i, row in enumerate(reviews):
            user = _get_user_for_review(db, row)
            if user is None:
                skipped += 1
                continue

            lid = row.get("listing_id")
            listing_id = _resolve_listing_id(db, int(lid) if lid is not None else None)
            if listing_id is None:
                print(f"  Skip review #{i + 1}: no listing")
                skipped += 1
                continue

            existing_rev = db.scalars(
                select(UserStayReview).where(
                    UserStayReview.user_id == user.id,
                    UserStayReview.listing_id == listing_id,
                )
            ).first()
            if existing_rev is not None:
                print(f"  Skip: review already exists user={user.id} listing={listing_id}")
                skipped += 1
                continue

            stay = db.scalars(
                select(UserStay).where(
                    UserStay.user_id == user.id,
                    UserStay.listing_id == listing_id,
                )
            ).first()
            if stay is None:
                stay = UserStay(
                    user_id=user.id,
                    listing_id=listing_id,
                    created_at=_now_iso(),
                    stayed_at=_now_iso(),
                )
                db.add(stay)
                db.flush()

            overall = int(row["overall_rating"])
            now = _now_iso()
            rev = UserStayReview(
                user_id=user.id,
                listing_id=listing_id,
                stay_id=stay.id,
                overall_rating=overall,
                created_at=now,
                updated_at=now,
            )
            for key in RATING_KEYS:
                setattr(rev, key, int(row[key]))
            comment = row.get("comment")
            rev.comment = (str(comment).strip() or None) if comment is not None else None
            db.add(rev)
            db.commit()
            inserted += 1
            print(f"  Inserted review user={user.id} listing={listing_id}")

        print(f"Done. Inserted {inserted}, skipped {skipped}.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
