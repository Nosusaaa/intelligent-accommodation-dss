"""Shared ranking helpers: merged POI proximity, cost/sentiment normalization, vibe preference match."""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

_REPO_ROOT = Path(__file__).resolve().parents[1]
_POIS_PATH = _REPO_ROOT / "Data" / "map_cache" / "pois_rochester.json"
_MERGED_POI_CATEGORIES = ("transport", "park", "restaurant", "education", "hospital")

# Larger values soften decay vs raw km (legacy was 100/(1+d_km)).
POI_DISTANCE_SCALE_KM = 2.0

# Same canonical strings as frontend `constants/suggestedVibeTags.js` / `Data/room_tags.csv`.
DEFAULT_ADMIN_PREFERENCE_TAGS: dict[str, int] = {
    "Cozy & Homey": 4,
    "Modern & Updated": 3,
}


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * r * math.asin(math.sqrt(min(1.0, max(0.0, a))))


def load_merged_pois_from_cache() -> list[dict[str, Any]]:
    """All cached POI categories for Rochester (used for merged amenities dimension)."""
    if not _POIS_PATH.is_file():
        return []
    try:
        data = json.loads(_POIS_PATH.read_text(encoding="utf-8"))
    except Exception:
        return []
    cats = data.get("categories")
    if not isinstance(cats, dict):
        return []
    out: list[dict[str, Any]] = []
    seen: set[Any] = set()
    for key in _MERGED_POI_CATEGORIES:
        raw = cats.get(key) or []
        if not isinstance(raw, list):
            continue
        for poi in raw:
            if not isinstance(poi, dict):
                continue
            try:
                lat = float(poi.get("lat"))
                lon = float(poi.get("lon"))
            except (TypeError, ValueError):
                continue
            pid = poi.get("id")
            if pid in seen:
                continue
            seen.add(pid)
            out.append(
                {
                    "id": pid,
                    "lat": lat,
                    "lon": lon,
                    "name": str(poi.get("name") or "POI"),
                    "category": str(poi.get("category") or key),
                }
            )
    return out


def poi_proximity_score_0_100(lat: float | None, lon: float | None, pois: list[dict[str, Any]]) -> float:
    if lat is None or lon is None or not pois:
        return 0.0
    nearest = float("inf")
    for p in pois:
        d = _haversine_km(lat, lon, float(p["lat"]), float(p["lon"]))
        if d < nearest:
            nearest = d
    if not math.isfinite(nearest):
        return 0.0
    # 100 at d=0, gentler falloff than 100/(1+d): e.g. d=1km -> ~67 with scale 2.
    denom = 1.0 + (nearest / POI_DISTANCE_SCALE_KM)
    return float(max(0.0, min(100.0, 100.0 / denom)))


def sentiment_score_0_100(listing: dict[str, Any]) -> float:
    intel = listing.get("intelligent_score")
    if intel is not None:
        try:
            v = float(intel)
            if math.isfinite(v):
                return max(0.0, min(100.0, v))
        except (TypeError, ValueError):
            pass
    rating = listing.get("review_scores_rating")
    if rating is not None:
        try:
            r = float(rating)
            if math.isfinite(r):
                return max(0.0, min(100.0, r * 20.0))
        except (TypeError, ValueError):
            pass
    avg = listing.get("average_sentiment_score")
    if avg is not None:
        try:
            a = float(avg)
            if math.isfinite(a):
                if a <= 1.0:
                    return max(0.0, min(100.0, a * 100.0))
                return max(0.0, min(100.0, a))
        except (TypeError, ValueError):
            pass
    return 50.0


def cost_score_0_100(price: float | None, pmin: float, pmax: float) -> float:
    if price is None or not math.isfinite(float(price)):
        return 50.0
    p = float(price)
    if pmax <= pmin:
        return 50.0
    t = (p - pmin) / (pmax - pmin)
    t = max(0.0, min(1.0, t))
    return 100.0 * (1.0 - t)


def parse_vibe_tag_list(vibe_tags: str | None) -> list[str]:
    if not vibe_tags or not isinstance(vibe_tags, str):
        return []
    return [s.strip() for s in vibe_tags.split("|") if s.strip()]


def preference_score_0_100(vibe_tags: str | None, tag_weights: dict[str, int]) -> float:
    if not tag_weights:
        return 50.0
    tags = parse_vibe_tag_list(vibe_tags)
    if not tags:
        return 50.0
    max_w = max(tag_weights.values()) or 1
    # Score only listing tags that match a preference; avoids penalizing long tag lists.
    matched_raw: list[int] = []
    for lt in tags:
        lt_l = lt.lower()
        best = 0
        for ut, sc in tag_weights.items():
            u = ut.strip()
            if not u:
                continue
            ul = u.lower()
            if ul == lt_l:
                best = max(best, sc)
            elif ul in lt_l or lt_l in ul:
                best = max(best, int(sc * 0.65))
        if best > 0:
            matched_raw.append(best)
    if not matched_raw:
        return 0.0
    total = float(sum(matched_raw))
    raw = 100.0 * (total / (max_w * len(matched_raw)))
    return max(0.0, min(100.0, raw))


def weighted_total_score(
    *,
    poi: float,
    cost: float,
    sentiment: float,
    preference: float,
    w_poi: int,
    w_cost: int,
    w_sentiment: int,
    w_pref: int,
) -> float:
    ws = w_poi + w_cost + w_sentiment + w_pref
    if ws <= 0:
        return 0.0
    return (w_poi * poi + w_cost * cost + w_sentiment * sentiment + w_pref * preference) / ws


def price_bounds(listings: list[dict[str, Any]]) -> tuple[float, float]:
    vals: list[float] = []
    for li in listings:
        p = li.get("price_clean")
        if p is None:
            continue
        try:
            v = float(p)
        except (TypeError, ValueError):
            continue
        if math.isfinite(v) and v > 0:
            vals.append(v)
    if not vals:
        return 0.0, 1.0
    return min(vals), max(vals)


def rank_listings_payload(
    listings: list[dict[str, Any]],
    *,
    pois: list[dict[str, Any]],
    tag_weights: dict[str, int],
    w_poi: int,
    w_cost: int,
    w_sentiment: int,
    w_pref: int,
    include_breakdown: bool = False,
    price_bounds_override: tuple[float, float] | None = None,
) -> list[dict[str, Any]]:
    if price_bounds_override is not None:
        pmin, pmax = price_bounds_override
    else:
        pmin, pmax = price_bounds(listings)
    ranked: list[dict[str, Any]] = []
    for li in listings:
        lat = li.get("latitude")
        lon = li.get("longitude")
        try:
            la = float(lat) if lat is not None else None
            lo = float(lon) if lon is not None else None
        except (TypeError, ValueError):
            la, lo = None, None
        poi_s = poi_proximity_score_0_100(la, lo, pois)
        try:
            price = float(li["price_clean"]) if li.get("price_clean") is not None else None
        except (TypeError, ValueError):
            price = None
        cost_s = cost_score_0_100(price, pmin, pmax)
        sent_s = sentiment_score_0_100(li)
        pref_s = preference_score_0_100(li.get("vibe_tags"), tag_weights)
        total = weighted_total_score(
            poi=poi_s,
            cost=cost_s,
            sentiment=sent_s,
            preference=pref_s,
            w_poi=w_poi,
            w_cost=w_cost,
            w_sentiment=w_sentiment,
            w_pref=w_pref,
        )
        row: dict[str, Any] = {
            "listing": li,
            "score": round(total, 2),
        }
        if include_breakdown:
            row["breakdown"] = {
                "poi": round(poi_s, 2),
                "cost": round(cost_s, 2),
                "sentiment": round(sent_s, 2),
                "preference": round(pref_s, 2),
            }
        ranked.append(row)
    ranked.sort(key=lambda x: (-x["score"], x["listing"].get("id") or 0))
    return ranked


def parse_default_preference_json(raw: str | None) -> dict[str, int]:
    if not raw or not str(raw).strip():
        return dict(DEFAULT_ADMIN_PREFERENCE_TAGS)
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return dict(DEFAULT_ADMIN_PREFERENCE_TAGS)
    if not isinstance(data, dict):
        return dict(DEFAULT_ADMIN_PREFERENCE_TAGS)
    out: dict[str, int] = {}
    for k, v in data.items():
        if not isinstance(k, str) or not k.strip():
            continue
        try:
            iv = int(v)
        except (TypeError, ValueError):
            continue
        if iv > 0:
            out[k.strip()] = iv
    return out or dict(DEFAULT_ADMIN_PREFERENCE_TAGS)


def serialize_default_preference(tags: dict[str, int] | None) -> str | None:
    if not tags:
        return None
    clean: dict[str, int] = {}
    for k, v in tags.items():
        if not isinstance(k, str) or not k.strip():
            continue
        try:
            iv = int(v)
        except (TypeError, ValueError):
            continue
        if iv > 0:
            clean[k.strip()] = iv
    if not clean:
        return None
    return json.dumps(clean, ensure_ascii=False)
