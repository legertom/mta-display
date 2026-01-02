# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Key commands

- Install dependencies:
  - `npm install`
- Run the local Express server (uses `server.js`, serves `public/`):
  - `npm start`
  - `npm run dev` (alias for `node server.js`)
- Run the stop-finder helper script (requires `BUS_TIME_API_KEY` in `.env`):
  - `node find-stops.js "Caton Ave"`
  - `node find-stops.js "Clarkson Ave"`
  - `node find-stops.js "Rogers Lenox"`

There are currently no npm scripts defined for tests or linting.

## Environment & deployment

- Local development expects a `.env` file in the repo root with at least:
  - `BUS_TIME_API_KEY=...` (required for bus data)
  - `PORT=3001` (or any port you prefer; `server.js` reads `process.env.PORT` and defaults to 3001).
- Vercel deployment is configured via `vercel.json`:
  - All `/api/*` routes are routed to `api/index.js` as a serverless function.
  - The root path `/` serves `index.html` from the repo root.
- The Express app in `api/index.js` also serves static files from `public/` as a fallback when running in the Vercel/serverless context.

## High-level architecture

### Overview

This project is a small real-time transit board for specific NYC MTA subway and bus routes. It consists of:

- A backend that aggregates real-time data from MTA subway GTFS-RT feeds and Bus Time (SIRI + JSON APIs), normalizes it, and exposes a small JSON API.
- A single-page frontend (vanilla JS + CSS) that polls the backend every 30 seconds and renders arrivals with filtering and basic crowding indicators.
- A CLI helper (`find-stops.js`) for discovering bus stop IDs in the MTA Bus Time system.

There are two parallel backend implementations with overlapping responsibilities:

- `server.js`: Node/Express server for local development and non-serverless hosting.
- `api/index.js`: Express app exported as a Vercel serverless function, with more robust health/debug endpoints and slightly different output shaping.

### Backend: core concepts

#### Subway data pipeline

Relevant files:
- `server.js`
- `api/index.js`
- `MTA_DATA_NOTES.md`

Key behavior:

- Both backends pull from the same public MTA GTFS-RT subway feeds (no API key required):
  - B train: `.../gtfs-bdfm`
  - Q train: `.../gtfs-nqrw`
  - 2/5 trains: `.../gtfs` (IRT feed)
- Target stations and directions are hard-coded:
  - Church Ave (D28N) for B/Q Manhattan-bound.
  - Winthrop St (241N) for 2/5 Manhattan-bound.
- Each backend has a `fetchSubwayFeed`-style helper that:
  - Fetches and decodes the GTFS-RT feed via `gtfs-realtime-bindings`.
  - First pass: collects `vehicle` entities into a `Map<tripId, vehicleData>` so occupancy-related fields can be joined to trip updates.
  - Second pass: walks `tripUpdate.stopTimeUpdate`, filters to the target stop (with some flexibility around stop ID variants and `N`/northbound direction), and computes `minutes` until arrival from the current time.
  - Attaches any occupancy metadata found on the matching vehicle (see **Occupancy/crowding** below).
- `fetchSubwayData` (in both `server.js` and `api/index.js`) orchestrates the per-route fetchers to produce arrays for:
  - `churchAve`: arrivals for B/Q at Church Ave.
  - `winthrop`: arrivals for 2/5 at Winthrop.
- `/api/arrivals` returns these grouped under `subway.churchAve` and `subway.winthrop`.

#### Bus data pipeline

Relevant files:
- `server.js`
- `api/index.js`
- `find-stops.js`
- `MTA_DATA_NOTES.md`

Key behavior:

- All bus logic depends on `BUS_TIME_API_KEY`. If it is missing, backends log a warning and skip bus data.
- Target stops are hard-coded:
  - B41 at Caton Ave and Clarkson Ave.
  - B49 at Rogers & Lenox (Bed-Stuy/Fulton St bound).
- Both backends use a layered strategy for bus arrivals:
  1. **Primary**: SIRI `stop-monitoring.json` for route + stop.
     - Returns `MonitoredStopVisit` entries with rich data, including `ExpectedArrivalTime` and `Extensions.Capacities` for passenger counts.
  2. **Fallback**: JSON Bus Time `arrivals-and-departures-for-stop/...` endpoint.
     - Joined with `vehicles-for-route` and/or GTFS-RT `vehiclePositions` to pull any available occupancy/load-factor data.
- Direction filtering is applied where necessary:
  - For B41, different stops encode service type: Caton Ave acts as Local, Clarkson Ave acts as Limited; the code enforces this when labeling and combining results.
  - For B49, heuristics on `tripHeadsign` (e.g., references to Fulton / Bed Stuy) ensure only the desired direction is shown; if that yields no results, `api/index.js` retries without direction filtering.
- `api/index.js` exposes additional diagnostic behavior:
  - `fetchBusVehiclePositionsFromGTFS` prefers the GTFS-RT vehicle positions feed to derive occupancy, falling back to Bus Time REST if needed.
  - `/api/debug/bus` hits both vehicles and arrivals endpoints and attempts to correlate `tripId`s to help debug occupancy extraction.

#### Occupancy / crowding model

- `MTA_DATA_NOTES.md` summarizes a core constraint: subway GTFS-RT currently sets occupancy fields to `0`/`0` for all trains, so the code treats these values as "no data" rather than "empty train".
- For subways:
  - Backends attach occupancy fields when present, but the frontend suppresses display when the combination clearly indicates unpopulated data (status 0 and percentage 0 with no passenger counts).
- For buses:
  - SIRI `Extensions.Capacities` is the preferred source and provides passenger counts and capacities used to compute a percentage full.
  - Where only load factor or discrete occupancy status codes are present, helpers convert them into a normalized occupancy representation.

#### API surface

`server.js` (local server):
- `GET /api/arrivals`
  - Returns `{ subway: { churchAve, winthrop }, buses: { b41, b49 }, timestamp }`.
  - Includes occupancy fields when available.
- `GET /api/search-stops?q=...`
  - Thin proxy to Bus Time `stops-for-location`, scoped to a fixed Brooklyn lat/lon.
- Serves static frontend from `public/`.

`api/index.js` (Vercel serverless app):
- `GET /api/arrivals`
  - Similar to `server.js` but designed for partial failure: wraps individual data fetches in try/catch, accumulates `errors` and `warnings`, and only returns HTTP 503 when *all* sources fail.
- `GET /api/search-stops?q=...`
  - Same base behavior as `server.js` but with more structured error responses and clear messaging when the API key is missing or requests time out.
- `GET /api/health`
  - Lightweight health check indicating subway/bus data availability and environment info (presence/length of API key, `NODE_ENV`, whether running on Vercel).
- `GET /api/debug/bus`
  - Developer-only endpoint that queries vehicles and arrivals for a specified route/stop, then attempts to match `tripId`s to understand how occupancy data flows through the APIs.
- `GET *` (non-API)
  - Serves `public/index.html` for all non-API paths when used as a traditional Express app; Vercel routing normally serves `index.html` at `/` per `vercel.json`.

## Frontend architecture

Relevant files:
- `public/index.html` - Main HTML entry point
- `public/js/main.v2.js` - Frontend entry point (ES Module)
- `public/js/modules/` - Client-side modules (Api, UI, State)
- `public/styles.css` - Global styles (single source of truth)

> **Note**: All frontend assets live in `public/`. There is no duplicate "root" variant. Changes to CSS or HTML should only be made to files in `public/`.

Core architecture:

- Plain HTML/CSS/JS, no framework.
- The frontend polls `/api/arrivals` every 30 seconds (with retry/backoff and user-friendly error states), and updates DOM containers for subway and bus arrivals.
- Local state/features:
  - Subway route filters are persisted in `localStorage` under a key like `mta-subway-filters`.
  - Filters are toggled via `.filter-badge` elements; the active routes drive client-side filtering in `renderFilteredSubwayArrivals`.
- Rendering pipeline:
  - Raw JSON from `/api/arrivals` is normalized into a flat array of arrival objects (subway arrivals tagged with station names; bus arrivals tagged with route, location, and service type).
  - `createArrivalItem` constructs DOM for each row, including:
    - Subway-style circular route badges with official line colors.
    - Bus-style rectangular badges with aspect ratio controlled by `--bus-badge-ratio` CSS variable.
    - An occupancy bar (no textual counts) when occupancy or passenger data is available.
  - Time labels are humanized ("Arriving", "1 min", "N mins").
- Layout/styling:
  - `styles.css` defines a responsive, card-based layout using a central `.container`, with CSS grid used at tablet/desktop breakpoints.
  - CSS design tokens in `:root` control badge sizing and aspect ratios for consistency.

## Helper script: stop ID discovery

- `find-stops.js` is a Node CLI designed to help discover MTA Bus Time stop IDs for a given search term.
- Behavior:
  - Reads `BUS_TIME_API_KEY` from `.env` and exits early with an error if missing.
  - Calls `stops-for-location.json` with a fixed Brooklyn-centric lat/lon and a large radius.
  - Prints each stop's name, ID, routes, and coordinates for the given query.
- Usage pattern:
  - `node find-stops.js "Caton Ave"`
  - `node find-stops.js "Clarkson Ave"`
  - `node find-stops.js "Rogers Lenox"`

Updating hard-coded stop IDs in `server.js` or `api/index.js` should generally be preceded by running this helper to verify IDs.
