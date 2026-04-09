# Map Offline Cache

This directory stores offline-first map artifacts used by backend map APIs.

## Files

- `pois_rochester.json`: Offline POIs grouped by category.
- `listings_geo_snapshot.json`: Listing latitude/longitude snapshot from SQLite.
- `tile_manifest.json`: Lightweight tile metadata (no heavy tile assets).

## Schema fields

Every artifact includes:

- `schema_version`
- `generated_at`
- `bbox` (`south`, `west`, `north`, `east`)

`pois_rochester.json` also includes:

- `city`
- `category_counts`
- `coverage`
- `categories`

This folder is generated/updated by `backend/build_map_cache.py`.
