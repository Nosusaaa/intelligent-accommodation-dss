# React + Vite

## Install rule (important)

Run all frontend dependency commands only inside `frontend/`:

```bash
npm --prefix "/Users/pyx/Desktop/4007UI/frontend" install
```

Do not install React/Leaflet packages at repository root, otherwise Vite may resolve a mixed dependency tree and cause map runtime failures.

## Backend API

`npm run dev` proxies `/api` → `http://127.0.0.1:8000` (see `vite.config.js`). Start FastAPI from `../backend` first, e.g. `python3 -m uvicorn main:app --reload --host 127.0.0.1 --port 8000`.

For production builds without that proxy, set `VITE_API_BASE_URL` (e.g. `http://127.0.0.1:8000/api`) when running `npm run build`.

## Full map search

- `SmartSearch` now uses Leaflet + OSM tiles and syncs listings to map viewport.
- Drag/zoom triggers listing query with `map_mode=true` and bbox params (`north/south/east/west`).
- POI overlay comes from backend `GET /api/map/pois` (offline-first, then Overpass fallback).
- If map rendering throws, UI automatically falls back to list mode, and a retry button remounts map safely.
- In development mode, map API calls are logged with tags like `[api:map_pois:*]` / `[api:listings:map_mode:*]` for quick diagnosis.
- `transport/park/restaurant/education/hospital` now affects listing order through `map_intent_score` (category-aware proximity score), not only map marker display.

---

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
