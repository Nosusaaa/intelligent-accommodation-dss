# Intelligent Accommodation Decision Support System

A full-stack academic project that helps travelers explore and compare short-term accommodation using map-based search, listing insights, review sentiment, and monthly performance forecasts.

The application combines a React interface with a FastAPI backend and a SQLite data pipeline. It was developed as a university capstone project and is intended as a local portfolio demonstration.

## Highlights

- Map-driven listing discovery with Leaflet and OpenStreetMap
- Multi-criteria filtering by price, capacity, room type, amenities, and location
- Offline-first points-of-interest overlays with an Overpass API fallback
- Property detail pages with review sentiment summaries
- Monthly price and occupancy visualizations
- Favorites, ranking, and side-by-side property comparison
- Admin tools for data sync logs, scenic spots, users, and ranking strategy weights
- Responsive traveler and administrator interfaces

## Tech Stack

| Layer | Technologies |
| --- | --- |
| Frontend | React 19, Vite 8, React Router, Tailwind CSS, Recharts, Leaflet |
| Backend | FastAPI, SQLAlchemy, Pydantic, bcrypt |
| Data | SQLite, pandas, CSV, GeoJSON |
| External data | OpenStreetMap tiles and Overpass POI data |

## Architecture

```text
React + Vite client
        |
        | REST API
        v
FastAPI application
        |
        +-- SQLAlchemy models
        +-- ranking and forecast services
        +-- offline-first POI service
        |
        v
SQLite + CSV + GeoJSON datasets
```

## Main Workflows

1. Start as a guest or create a local account.
2. Select travel preferences during onboarding.
3. Search listings and move the map to update the result area.
4. Inspect property details, reviews, and monthly metrics.
5. Save favorites or compare shortlisted properties.
6. Use the admin portal to manage demonstration data and strategy settings.

## Local Setup

### 1. Start the backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python seed_data.py
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

The API is available at `http://127.0.0.1:8000`. Interactive API documentation is available at `http://127.0.0.1:8000/docs`.

### 2. Start the frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

For local admin demonstrations, use `admin` / `password123` after seeding the database. These credentials are for local development only.

## Project Structure

```text
4007UI/
|-- frontend/       React application
|-- backend/        FastAPI service, models, and data scripts
|-- Data/           Source datasets, GeoJSON, and local cache files
|-- docs/           Product and feature documentation
|-- test/           Small seed datasets for development
|-- Admin.md        Admin module notes
`-- README.md
```

## Configuration

The frontend uses the Vite development proxy by default. To connect to another API host, copy `frontend/.env.example` to `frontend/.env` and set `VITE_API_BASE_URL`.

To allow additional frontend origins, copy or load `backend/.env.example` and configure `CORS_ORIGINS`.

## Verification

```bash
cd frontend
npm run build
npm run lint
```

The production frontend build currently completes successfully. Some legacy and experimental components still require lint cleanup; see the repository status before treating lint as a release gate.

## Documentation

- [Feature and API specification](docs/FEATURE-PRD.md)
- [Backend setup and data scripts](backend/README.md)
- [Dataset reference](Data/README.md)
- [Admin module notes](Admin.md)

## Current Scope

This repository is an academic demonstration rather than a production booking platform. Authentication is local and does not issue JWT or session tokens, some comparison values are demonstration data, and there is currently no hosted public demo.

## Author

GitHub: [@AvaPeng-625](https://github.com/AvaPeng-625)
