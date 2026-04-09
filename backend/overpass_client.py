"""Tiny Overpass API client for bbox POI queries (public endpoint, no API key)."""

from __future__ import annotations

import json
import os
from pathlib import Path
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

OVERPASS_BASE_URL = os.getenv("OVERPASS_BASE_URL", "https://overpass-api.de/api/interpreter")
OVERPASS_FALLBACK_URLS = [
    url.strip()
    for url in os.getenv(
        "OVERPASS_FALLBACK_URLS",
        "https://overpass.kumi.systems/api/interpreter,https://lz4.overpass-api.de/api/interpreter",
    ).split(",")
    if url.strip()
]
OVERPASS_TIMEOUT_SEC = float(os.getenv("OVERPASS_TIMEOUT_SEC", "14"))
OVERPASS_USER_AGENT = os.getenv(
    "OVERPASS_USER_AGENT",
    "4007UI/0.1 (+local-dev map feature)",
)
OVERPASS_FAILURE_COOLDOWN_SEC = float(os.getenv("OVERPASS_FAILURE_COOLDOWN_SEC", "25"))

_endpoint_blocked_until: dict[str, float] = {}
_REPO_ROOT = Path(__file__).resolve().parents[1]
MAP_CACHE_DIR = Path(os.getenv("MAP_CACHE_DIR", str(_REPO_ROOT / "Data" / "map_cache")))
POIS_CACHE_FILE = MAP_CACHE_DIR / "pois_rochester.json"

_CATEGORY_TAGS: dict[str, list[tuple[str, str]]] = {
    "transport": [("public_transport", ""), ("railway", "station"), ("highway", "bus_stop")],
    "park": [("leisure", "park"), ("leisure", "garden")],
    "restaurant": [("amenity", "restaurant"), ("amenity", "cafe"), ("amenity", "bar")],
    "education": [("amenity", "school"), ("amenity", "university"), ("amenity", "college")],
    "hospital": [("amenity", "hospital"), ("amenity", "clinic"), ("amenity", "pharmacy")],
}


def _query_for_bbox(
    south: float,
    west: float,
    north: float,
    east: float,
    category: str,
) -> str:
    tags = _CATEGORY_TAGS.get(category, _CATEGORY_TAGS["transport"])
    bbox = f"{south},{west},{north},{east}"
    lines = ["[out:json][timeout:20];", "("]
    for key, val in tags:
        if val:
            lines.append(f'  node["{key}"="{val}"]({bbox});')
            lines.append(f'  way["{key}"="{val}"]({bbox});')
        else:
            lines.append(f'  node["{key}"]({bbox});')
            lines.append(f'  way["{key}"]({bbox});')
    lines.extend([");", "out center 120;"])
    return "\n".join(lines)


def _request_overpass(url: str, payload: bytes) -> str:
    req = urllib.request.Request(
        url,
        data=payload,
        headers={
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "User-Agent": OVERPASS_USER_AGENT,
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=OVERPASS_TIMEOUT_SEC) as resp:
        return resp.read().decode("utf-8", errors="replace")


def load_offline_pois(
    *,
    south: float,
    west: float,
    north: float,
    east: float,
    category: str = "transport",
) -> tuple[list[dict[str, Any]], str | None, float]:
    """
    Load POIs from offline cache and filter by request bbox.

    Returns:
      (pois, generated_at, coverage)
    """
    if not POIS_CACHE_FILE.exists():
        return [], None, 0.0

    try:
        data = json.loads(POIS_CACHE_FILE.read_text(encoding="utf-8"))
    except Exception:
        return [], None, 0.0

    categories = data.get("categories")
    if not isinstance(categories, dict):
        return [], data.get("generated_at"), 0.0

    raw_items = categories.get(category) or []
    out: list[dict[str, Any]] = []
    for poi in raw_items:
        try:
            lat = float(poi.get("lat"))
            lon = float(poi.get("lon"))
        except (TypeError, ValueError):
            continue
        if south <= lat <= north and west <= lon <= east:
            out.append(
                {
                    "id": poi.get("id"),
                    "type": poi.get("type"),
                    "lat": lat,
                    "lon": lon,
                    "name": poi.get("name") or "Unnamed POI",
                    "category": poi.get("category") or category,
                }
            )

    coverage = data.get("coverage")
    try:
        coverage_num = float(coverage)
    except (TypeError, ValueError):
        coverage_num = 0.0
    return out, data.get("generated_at"), coverage_num


def fetch_pois_bbox(
    *,
    south: float,
    west: float,
    north: float,
    east: float,
    category: str = "transport",
) -> tuple[list[dict[str, Any]], str, bool]:
    """Fetch and normalize POIs with endpoint fallback metadata."""
    query = _query_for_bbox(south=south, west=west, north=north, east=east, category=category)
    payload = urllib.parse.urlencode({"data": query}).encode("utf-8")
    endpoints = [OVERPASS_BASE_URL, *OVERPASS_FALLBACK_URLS]
    errors: list[str] = []
    raw = ""
    selected_upstream = ""
    fallback_used = False

    now = time.monotonic()
    for idx, endpoint in enumerate(endpoints):
        blocked_until = _endpoint_blocked_until.get(endpoint, 0.0)
        if blocked_until > now:
            errors.append(f"{endpoint} cooldown until {blocked_until:.1f}")
            continue
        try:
            raw = _request_overpass(endpoint, payload)
            selected_upstream = endpoint
            fallback_used = idx > 0
            break
        except urllib.error.URLError as e:
            _endpoint_blocked_until[endpoint] = time.monotonic() + OVERPASS_FAILURE_COOLDOWN_SEC
            errors.append(f"{endpoint}: {e}")
        except Exception as e:  # noqa: BLE001 - normalize as RuntimeError for API layer.
            _endpoint_blocked_until[endpoint] = time.monotonic() + OVERPASS_FAILURE_COOLDOWN_SEC
            errors.append(f"{endpoint}: {e}")

    if not selected_upstream:
        raise RuntimeError(f"Overpass request failed on all endpoints: {' | '.join(errors)}")

    data = json.loads(raw)
    out: list[dict[str, Any]] = []
    for el in data.get("elements", []):
        lat = el.get("lat")
        lon = el.get("lon")
        if lat is None or lon is None:
            center = el.get("center") or {}
            lat = center.get("lat")
            lon = center.get("lon")
        if lat is None or lon is None:
            continue
        tags = el.get("tags") or {}
        out.append(
            {
                "id": el.get("id"),
                "type": el.get("type"),
                "lat": float(lat),
                "lon": float(lon),
                "name": tags.get("name") or tags.get("operator") or tags.get("brand") or "Unnamed POI",
                "category": category,
            }
        )
    return out, selected_upstream, fallback_used

