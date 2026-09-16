# Frontend

React and Vite client for the Intelligent Accommodation Decision Support System.

## Development

Run frontend dependency commands from this directory so Vite resolves a single dependency tree:

```bash
cd frontend
npm install
npm run dev
```

The Vite development server proxies `/api` to `http://127.0.0.1:8000`. Start the FastAPI backend first.

To use a shared or deployed backend, copy `.env.example` to `.env`, set `VITE_API_BASE_URL`, and restart the development server.

## Commands

```bash
npm run dev      # Start the development server
npm run build    # Create a production build
npm run lint     # Run ESLint
npm run preview  # Preview the production build
```

## Map Search

The search experience uses Leaflet and OpenStreetMap tiles. Moving the map sends a bounding-box query to the backend. POI overlays are served from the local cache when available, with Overpass used as a fallback.
