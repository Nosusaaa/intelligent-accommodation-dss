#!/usr/bin/env python3
"""
PoC: fetch image gallery URLs for the first 10 Airbnb listings (real listing ids from SQLite).

Requires: pip install playwright && playwright install chromium
Run from repo root or backend/: python3 backend/run_scraper.py
"""

from __future__ import annotations

import json
import random
import sqlite3
import time
from pathlib import Path

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright

BACKEND_DIR = Path(__file__).resolve().parent
REPO_ROOT = BACKEND_DIR.parent

DB_PATH = REPO_ROOT / "Data" / "airbnb_dss.db"
OUTPUT_PATH = REPO_ROOT / "data" / "scraped_galleries.json"

LISTING_LIMIT = 10
MAX_IMAGES_PER_LISTING = 5
NAV_TIMEOUT_MS = 45_000
NETWORK_IDLE_MS = 15_000
DELAY_SEC = (4.0, 8.0)


def _load_state() -> dict[str, list[str]]:
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    if not OUTPUT_PATH.is_file():
        return {}
    try:
        raw = json.loads(OUTPUT_PATH.read_text(encoding="utf-8"))
        if isinstance(raw, dict):
            return {str(k): list(v) if isinstance(v, list) else [] for k, v in raw.items()}
    except (json.JSONDecodeError, OSError):
        pass
    return {}


def _save_state(data: dict[str, list[str]]) -> None:
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def _fetch_listing_ids(conn: sqlite3.Connection) -> list[int]:
    cur = conn.execute("SELECT id FROM listings LIMIT ?", (LISTING_LIMIT,))
    return [int(row[0]) for row in cur.fetchall()]


def _im_w_score(url: str) -> int:
    """Prefer larger Airbnb CDN thumbnails when im_w= is present."""
    if "im_w=" not in url:
        return 0
    try:
        part = url.split("im_w=", 1)[1].split("&", 1)[0]
        return int(part)
    except (ValueError, IndexError):
        return 0


def _is_likely_gallery_photo(url: str) -> bool:
    u = url.lower()
    if "muscache.com" not in u:
        return False
    skip = ("avatar", "profile", "user_pic", "map", "static", "favicon")
    return not any(s in u for s in skip)


def _collect_image_urls(page) -> list[str]:
    """Grab up to MAX_IMAGES_PER_LISTING muscache.com gallery-style URLs."""
    seen: set[str] = set()
    candidates: list[str] = []

    for img in page.query_selector_all('img[src*="muscache"]'):
        try:
            src = img.get_attribute("src")
            if not src or not _is_likely_gallery_photo(src):
                continue
            # Normalize http(s)
            src = src.strip()
            if src in seen:
                continue
            seen.add(src)
            candidates.append(src)
        except Exception:
            continue

    # Prefer higher resolution when im_w is present
    candidates.sort(key=_im_w_score, reverse=True)
    out: list[str] = []
    for u in candidates:
        if u not in out:
            out.append(u)
        if len(out) >= MAX_IMAGES_PER_LISTING:
            break
    return out


def _scrape_one_listing(page, listing_id: int) -> list[str]:
    url = f"https://www.airbnb.com/rooms/{listing_id}"
    page.goto(url, wait_until="domcontentloaded", timeout=NAV_TIMEOUT_MS)
    try:
        page.wait_for_load_state("networkidle", timeout=NETWORK_IDLE_MS)
    except PlaywrightTimeoutError:
        pass

    # Light scroll to trigger lazy-loaded gallery images
    try:
        page.evaluate("window.scrollTo(0, document.body.scrollHeight / 3)")
        time.sleep(1.2)
        page.evaluate("window.scrollTo(0, 0)")
        time.sleep(0.5)
    except Exception:
        pass

    return _collect_image_urls(page)


def main() -> None:
    if not DB_PATH.is_file():
        raise FileNotFoundError(f"Database not found: {DB_PATH}")

    conn = sqlite3.connect(str(DB_PATH))
    try:
        ids = _fetch_listing_ids(conn)
    finally:
        conn.close()

    if len(ids) < LISTING_LIMIT:
        print(f"Warning: only {len(ids)} listings in DB (expected up to {LISTING_LIMIT}).")

    state = _load_state()
    to_run = [lid for lid in ids if str(lid) not in state]

    if not to_run:
        print("Nothing to do — all fetched ids already present in", OUTPUT_PATH)
        return

    print(f"Will scrape {len(to_run)} listing(s): {to_run}")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context(
            locale="en-US",
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            ),
        )
        page = context.new_page()

        for i, listing_id in enumerate(to_run):
            if i > 0:
                delay = random.uniform(*DELAY_SEC)
                print(f"Sleeping {delay:.1f}s before next listing…")
                time.sleep(delay)

            try:
                urls = _scrape_one_listing(page, listing_id)
                state[str(listing_id)] = urls
                _save_state(state)
                print(f"OK {listing_id}: saved {len(urls)} image URL(s) → {OUTPUT_PATH}")
            except PlaywrightTimeoutError as e:
                print(f"Timeout {listing_id}: {e}")
                state[str(listing_id)] = []
                _save_state(state)
            except Exception as e:
                print(f"Error {listing_id}: {e}")
                state[str(listing_id)] = []
                _save_state(state)

        context.close()
        browser.close()

    print("Done.")


if __name__ == "__main__":
    main()
