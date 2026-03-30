#!/usr/bin/env python3
"""Load scraped gallery URLs from JSON into SQLite `listings.gallery_urls` (comma-separated).

CRITICAL: This script ONLY assigns `Listing.gallery_urls`. It MUST NOT read or write
`picture_url` (CSV-sourced cover). The homepage / search cards rely on `picture_url`
remaining unchanged.
"""

from __future__ import annotations

import json
from pathlib import Path

from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import Session

BACKEND_DIR = Path(__file__).resolve().parent
REPO_ROOT = BACKEND_DIR.parent
DB_PATH = REPO_ROOT / "Data" / "airbnb_dss.db"

JSON_CANDIDATES = [
    REPO_ROOT / "Data" / "scraped_galleries.json",
    REPO_ROOT / "data" / "scraped_galleries.json",
]


def _find_json() -> Path:
    for p in JSON_CANDIDATES:
        if p.is_file():
            return p
    raise FileNotFoundError(
        "No scraped_galleries.json found. Tried:\n  "
        + "\n  ".join(str(p) for p in JSON_CANDIDATES)
    )


def _ensure_gallery_urls_column(engine) -> None:
    with engine.connect() as conn:
        rows = conn.execute(text("PRAGMA table_info(listings)")).fetchall()
        col_names = {row[1] for row in rows}
        if "gallery_urls" in col_names:
            return
        conn.execute(text("ALTER TABLE listings ADD COLUMN gallery_urls TEXT"))
        conn.commit()


def main() -> None:
    json_path = _find_json()
    raw = json.loads(json_path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise ValueError("JSON root must be an object mapping listing_id -> [urls]")

    engine = create_engine(
        f"sqlite:///{DB_PATH}",
        connect_args={"check_same_thread": False},
    )
    _ensure_gallery_urls_column(engine)

    from models import Listing  # noqa: PLC0415 — after optional create_all not needed

    updated = 0
    skipped = 0
    missing_row = 0

    with Session(engine) as session:
        for key, urls in raw.items():
            if not isinstance(urls, list):
                skipped += 1
                continue
            listing_id = int(key)
            row = session.scalars(select(Listing).where(Listing.id == listing_id)).first()
            if row is None:
                missing_row += 1
                continue
            clean = [str(u).strip() for u in urls if str(u).strip()]
            row.gallery_urls = ",".join(clean) if clean else None
            # Never touch row.picture_url — preserve CSV cover for list cards & RoomSlider.
            updated += 1

        session.commit()

    print(f"Source JSON: {json_path}")
    print(f"Updated listings: {updated}")
    print(f"Skipped (bad value): {skipped}")
    print(f"IDs not in DB: {missing_row}")
    print("Done.")


if __name__ == "__main__":
    main()
