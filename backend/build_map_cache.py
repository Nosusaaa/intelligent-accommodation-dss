"""Build offline map cache artifacts under Data/map_cache."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import select

from models import Listing, SessionLocal
from overpass_client import fetch_pois_bbox

REPO_ROOT = Path(__file__).resolve().parents[1]
MAP_CACHE_DIR = REPO_ROOT / "Data" / "map_cache"

CITY = "rochester"
BBOX = {"south": 43.05, "west": -77.78, "north": 43.28, "east": -77.45}
CATEGORIES = ["transport", "park", "restaurant", "education", "hospital"]
SCHEMA_VERSION = 1
RESTAURANT_TARGET_MIN = 200
RESTAURANT_TARGET_MAX = 400


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


def _fetch_restaurant_sharded() -> tuple[list[dict[str, Any]], list[str]]:
    failures: list[str] = []
    collected: list[dict[str, Any]] = []
    tiles = _bbox_tiles(
        south=BBOX["south"],
        west=BBOX["west"],
        north=BBOX["north"],
        east=BBOX["east"],
        rows=4,
        cols=4,
    )
    for i, tile in enumerate(tiles):
        try:
            pois, upstream, fallback_used = fetch_pois_bbox(
                south=tile["south"],
                west=tile["west"],
                north=tile["north"],
                east=tile["east"],
                category="restaurant",
            )
            collected.extend(pois)
            print(
                f"[restaurant-tile {i+1}/{len(tiles)}] +{len(pois)} "
                f"(upstream={upstream}, fallback_used={fallback_used})"
            )
        except Exception as exc:  # noqa: BLE001
            failures.append(f"tile_{i+1}: {exc}")
            print(f"[restaurant-tile {i+1}/{len(tiles)}] failed -> {exc}")
    deduped = _dedupe_pois(collected, "restaurant")
    return deduped, failures


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

    for category in CATEGORIES:
        if category == "restaurant":
            try:
                sharded, tile_failures = _fetch_restaurant_sharded()
                fetched = sharded
                if tile_failures:
                    failures.extend([f"restaurant {x}" for x in tile_failures])
                existing_rest = existing_categories.get("restaurant", [])
                if len(fetched) < RESTAURANT_TARGET_MIN and existing_rest:
                    merged = _dedupe_pois([*fetched, *existing_rest], "restaurant")
                    fetched = merged
                if len(fetched) < RESTAURANT_TARGET_MIN:
                    restaurant_under_target = True
                    failures.append(
                        f"restaurant under target: {len(fetched)} < {RESTAURANT_TARGET_MIN}"
                    )
                if len(fetched) > RESTAURANT_TARGET_MAX:
                    fetched = fetched[:RESTAURANT_TARGET_MAX]
                categories["restaurant"] = fetched
                category_counts["restaurant"] = len(fetched)
                print(f"[pois] restaurant: {len(fetched)} (target {RESTAURANT_TARGET_MIN}-{RESTAURANT_TARGET_MAX})")
                continue
            except Exception as exc:  # noqa: BLE001
                fallback_items = _dedupe_pois(existing_categories.get("restaurant", []), "restaurant")
                categories["restaurant"] = fallback_items
                category_counts["restaurant"] = len(fallback_items)
                restaurant_under_target = len(fallback_items) < RESTAURANT_TARGET_MIN
                fallback_note = (
                    f"fallback={len(fallback_items)} from existing cache"
                    if fallback_items
                    else "fallback=empty"
                )
                failures.append(f"restaurant: {exc} ({fallback_note})")
                print(f"[pois] restaurant: failed -> {exc}; {fallback_note}")
                continue

        try:
            pois, upstream, fallback_used = fetch_pois_bbox(
                south=BBOX["south"],
                west=BBOX["west"],
                north=BBOX["north"],
                east=BBOX["east"],
                category=category,
            )
            deduped = _dedupe_pois(pois, category)
            categories[category] = deduped
            category_counts[category] = len(deduped)
            print(
                f"[pois] {category}: {len(deduped)} "
                f"(upstream={upstream}, fallback_used={fallback_used})"
            )
        except Exception as exc:  # noqa: BLE001
            fallback_items = _dedupe_pois(existing_categories.get(category, []), category)
            categories[category] = fallback_items
            category_counts[category] = len(fallback_items)
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
