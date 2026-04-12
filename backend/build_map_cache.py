"""Build offline map cache artifacts under Data/map_cache."""

from __future__ import annotations

import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import select

from models import Listing, SessionLocal
from overpass_client import fetch_pois_bbox, fetch_pois_by_tags

REPO_ROOT = Path(__file__).resolve().parents[1]
MAP_CACHE_DIR = REPO_ROOT / "Data" / "map_cache"

CITY = "rochester"
BBOX = {"south": 43.05, "west": -77.78, "north": 43.28, "east": -77.45}
CATEGORIES = ["transport", "park", "restaurant", "education", "hospital"]
SCHEMA_VERSION = 1
# Per-category cap after merge/dedupe (Overpass may cap per tile; raise via env if needed).
PER_CATEGORY_CAP = int(os.getenv("MAP_CACHE_PER_CATEGORY_CAP", "120"))
# One full-Rochester bbox per category by default (fewer requests -> less 429 from public Overpass).
SHARD_ROWS = int(os.getenv("MAP_CACHE_SHARD_ROWS", "1"))
SHARD_COLS = int(os.getenv("MAP_CACHE_SHARD_COLS", "1"))
OVERPASS_TILE_MAX = int(os.getenv("MAP_CACHE_OVERPASS_TILE_MAX", "900"))
OVERPASS_PAUSE_SEC = float(os.getenv("OVERPASS_BUILD_PAUSE_SEC", "12"))


def _iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _bbox_tiles(
    *,
    south: float,
    west: float,
    north: float,
    east: float,
    rows: int,
    cols: int,
) -> list[dict[str, float]]:
    lat_step = (north - south) / float(rows)
    lon_step = (east - west) / float(cols)
    out: list[dict[str, float]] = []
    for r in range(rows):
        for c in range(cols):
            out.append(
                {
                    "south": south + r * lat_step,
                    "north": south + (r + 1) * lat_step,
                    "west": west + c * lon_step,
                    "east": west + (c + 1) * lon_step,
                }
            )
    return out


def _normalize_poi(item: dict[str, Any], default_category: str) -> dict[str, Any] | None:
    try:
        lat = float(item.get("lat"))
        lon = float(item.get("lon"))
    except (TypeError, ValueError):
        return None
    poi_id = item.get("id")
    name = str(item.get("name") or "Unnamed POI").strip() or "Unnamed POI"
    return {
        "id": poi_id,
        "type": item.get("type"),
        "lat": lat,
        "lon": lon,
        "name": name,
        "category": item.get("category") or default_category,
    }


def _dedupe_pois(items: list[dict[str, Any]], default_category: str) -> list[dict[str, Any]]:
    by_id: dict[Any, dict[str, Any]] = {}
    no_id: dict[tuple[str, float, float], dict[str, Any]] = {}
    for raw in items:
        norm = _normalize_poi(raw, default_category)
        if norm is None:
            continue
        poi_id = norm.get("id")
        if poi_id is not None:
            by_id[poi_id] = norm
            continue
        key = (
            str(norm.get("name", "")).strip().lower(),
            round(float(norm["lat"]), 6),
            round(float(norm["lon"]), 6),
        )
        no_id[key] = norm
    merged = list(by_id.values()) + list(no_id.values())
    merged.sort(key=lambda x: (str(x.get("name", "")).lower(), float(x["lat"]), float(x["lon"])))
    return merged


def _fetch_category_sharded(category: str) -> tuple[list[dict[str, Any]], list[str]]:
    tiles = _bbox_tiles(
        south=BBOX["south"],
        west=BBOX["west"],
        north=BBOX["north"],
        east=BBOX["east"],
        rows=SHARD_ROWS,
        cols=SHARD_COLS,
    )
    last_failures: list[str] = []
    last_capped: list[dict[str, Any]] = []

    for attempt in range(2):
        failures: list[str] = []
        collected: list[dict[str, Any]] = []
        for i, tile in enumerate(tiles):
            try:
                pois, upstream, fallback_used = fetch_pois_bbox(
                    south=tile["south"],
                    west=tile["west"],
                    north=tile["north"],
                    east=tile["east"],
                    category=category,
                    max_elements=OVERPASS_TILE_MAX,
                )
                collected.extend(pois)
                print(
                    f"[{category}-tile {i + 1}/{len(tiles)}] +{len(pois)} "
                    f"(upstream={upstream}, fallback_used={fallback_used})"
                )
            except Exception as exc:  # noqa: BLE001
                failures.append(f"tile_{i + 1}: {exc}")
                print(f"[{category}-tile {i + 1}/{len(tiles)}] failed -> {exc}")
            if i + 1 < len(tiles):
                time.sleep(OVERPASS_PAUSE_SEC)
        deduped = _dedupe_pois(collected, category)
        capped = deduped[:PER_CATEGORY_CAP]
        last_failures = failures
        last_capped = capped
        if not failures or attempt == 1:
            return capped, failures
        print(f"[{category}] retrying after errors (sleep 75s)...")
        time.sleep(75.0)

    return last_capped, last_failures


def _build_pois(generated_at: str) -> dict[str, Any]:
    existing_payload: dict[str, Any] = {}
    existing_categories: dict[str, list[dict[str, Any]]] = {}
    pois_path = MAP_CACHE_DIR / f"pois_{CITY}.json"
    if pois_path.exists():
        try:
            existing_payload = json.loads(pois_path.read_text(encoding="utf-8"))
            loaded = existing_payload.get("categories")
            if isinstance(loaded, dict):
                existing_categories = {
                    key: value for key, value in loaded.items() if isinstance(value, list)
                }
        except Exception:  # noqa: BLE001
            existing_payload = {}
            existing_categories = {}

    categories: dict[str, list[dict[str, Any]]] = {}
    category_counts: dict[str, int] = {}
    failures: list[str] = []
    restaurant_under_target = False

    for idx, category in enumerate(CATEGORIES):
        if idx > 0:
            time.sleep(OVERPASS_PAUSE_SEC)
        try:
            fetched, tile_failures = _fetch_category_sharded(category)
            if tile_failures:
                failures.extend([f"{category} {x}" for x in tile_failures])
            if (
                category == "transport"
                and len(fetched) < PER_CATEGORY_CAP
                and PER_CATEGORY_CAP > 0
            ):
                time.sleep(OVERPASS_PAUSE_SEC)
                try:
                    extra, _up, _fb = fetch_pois_by_tags(
                        south=BBOX["south"],
                        west=BBOX["west"],
                        north=BBOX["north"],
                        east=BBOX["east"],
                        tag_pairs=[("highway", "bus_stop")],
                        category="transport",
                        max_elements=min(800, OVERPASS_TILE_MAX + 200),
                    )
                    fetched = _dedupe_pois([*fetched, *extra], "transport")[
                        :PER_CATEGORY_CAP
                    ]
                    print(
                        f"[pois] transport: after bus_stop supplement -> {len(fetched)}"
                    )
                except Exception as exc:  # noqa: BLE001
                    failures.append(f"transport bus_stop supplement: {exc}")
                    print(f"[pois] transport bus_stop supplement failed -> {exc}")
            existing_cat = existing_categories.get(category, [])
            if len(fetched) < PER_CATEGORY_CAP and existing_cat:
                merged = _dedupe_pois([*fetched, *existing_cat], category)
                fetched = merged[:PER_CATEGORY_CAP]
            categories[category] = fetched
            category_counts[category] = len(fetched)
            if category == "restaurant" and len(fetched) < PER_CATEGORY_CAP:
                restaurant_under_target = True
                failures.append(
                    f"restaurant under cap: {len(fetched)} < {PER_CATEGORY_CAP} (after merge)"
                )
            print(
                f"[pois] {category}: {len(fetched)} "
                f"(cap={PER_CATEGORY_CAP}, shards={SHARD_ROWS}x{SHARD_COLS})"
            )
        except Exception as exc:  # noqa: BLE001
            fallback_items = _dedupe_pois(existing_categories.get(category, []), category)[
                :PER_CATEGORY_CAP
            ]
            categories[category] = fallback_items
            category_counts[category] = len(fallback_items)
            if category == "restaurant" and len(fallback_items) < PER_CATEGORY_CAP:
                restaurant_under_target = True
            fallback_note = (
                f"fallback={len(fallback_items)} from existing cache"
                if fallback_items
                else "fallback=empty"
            )
            failures.append(f"{category}: {exc} ({fallback_note})")
            print(f"[pois] {category}: failed -> {exc}; {fallback_note}")

    non_empty = sum(1 for c in CATEGORIES if category_counts.get(c, 0) > 0)
    coverage = non_empty / float(len(CATEGORIES)) if CATEGORIES else 0.0

    if all(category_counts.get(c, 0) == 0 for c in CATEGORIES) and existing_payload:
        print("[pois] all categories empty; keeping existing offline cache unchanged")
        existing_payload["generated_at"] = generated_at
        _write_json(pois_path, existing_payload)
        old_counts = existing_payload.get("category_counts") or {}
        return {
            "coverage": float(existing_payload.get("coverage") or 0.0),
            "failures": failures,
            "category_counts": old_counts,
            "restaurant_under_target": restaurant_under_target,
        }

    payload = {
        "schema_version": SCHEMA_VERSION,
        "city": CITY,
        "generated_at": generated_at,
        "bbox": BBOX,
        "category_counts": category_counts,
        "coverage": round(coverage, 4),
        "categories": categories,
    }
    _write_json(pois_path, payload)
    return {
        "coverage": payload["coverage"],
        "failures": failures,
        "category_counts": category_counts,
        "restaurant_under_target": restaurant_under_target,
    }


def _build_listing_snapshot(generated_at: str) -> dict[str, Any]:
    with SessionLocal() as db:
        rows = db.execute(
            select(Listing.id, Listing.latitude, Listing.longitude).where(
                Listing.latitude.isnot(None), Listing.longitude.isnot(None)
            )
        ).all()

    listings = [
        {"id": int(row[0]), "lat": float(row[1]), "lon": float(row[2])}
        for row in rows
    ]
    payload = {
        "schema_version": SCHEMA_VERSION,
        "generated_at": generated_at,
        "bbox": BBOX,
        "count": len(listings),
        "listings": listings,
    }
    _write_json(MAP_CACHE_DIR / "listings_geo_snapshot.json", payload)
    return {"count": len(listings)}


def _build_tile_manifest(generated_at: str) -> None:
    payload = {
        "schema_version": SCHEMA_VERSION,
        "generated_at": generated_at,
        "bbox": BBOX,
        "tiles": {
            "provider": "openstreetmap",
            "template": "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
            "min_zoom": 10,
            "max_zoom": 16,
            "note": "metadata only; no offline tile bundle",
        },
    }
    _write_json(MAP_CACHE_DIR / "tile_manifest.json", payload)


def main() -> None:
    generated_at = _iso_now()
    print(f"[map-cache] build started at {generated_at}")
    pois_summary = _build_pois(generated_at)
    listing_summary = _build_listing_snapshot(generated_at)
    _build_tile_manifest(generated_at)
    print("[map-cache] build done")
    print(
        "[map-cache] summary:",
        {
            "coverage": pois_summary["coverage"],
            "category_counts": pois_summary["category_counts"],
            "listing_count": listing_summary["count"],
            "failures": pois_summary["failures"],
            "restaurant_under_target": pois_summary["restaurant_under_target"],
        },
    )


if __name__ == "__main__":
    main()
