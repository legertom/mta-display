# Architecture Overview

This document serves as a critical, living template designed to equip agents with a rapid and comprehensive understanding of the codebase's architecture, enabling efficient navigation and effective contribution from day one. Update this document as the codebase evolves.

## 1. Project Structure

This section provides a high-level overview of the project's directory and file structure, categorised by architectural layer or major functional area.

```
mta-display/
├── api/                   # Vercel Serverless Function entry point
│   └── index.js           # Adapter for Vercel
├── public/                # Static assets hosted by Vercel
│   └── images/            # (Assumed) Images folder
├── src/                   # Main source code
│   ├── client/            # Frontend application (Vanilla JS)
│   │   ├── main.js        # Frontend entry point
│   │   └── modules/       # Client-side modules/components
│   └── server/            # Backend application (Node.js/Express)
│       ├── index.js       # Server entry point (local dev & start)
│       ├── app.js         # Express app configuration
│       ├── config/        # Environment and app configuration
│       ├── controllers/   # API route controllers
│       ├── domain/        # Domain logic and models
│       ├── services/      # Business logic (e.g., MTA integration)
│       └── utils/         # Shared utilities
├── .env                   # Environment variables (not committed)
├── index.html             # Main HTML entry point
├── styles.css             # Global styles
├── package.json           # Project dependencies and scripts
└── vercel.json            # Deployment configuration for Vercel
```

## 2. High-Level System Diagram

The system follows a standard client-server architecture, deployable as a monolithic node app or as a serverless application on Vercel.

```
[User Browser]
      |
      | HTTP/HTTPS
      v
[Vercel / Node Server]
      |
      +---> [Static Assets (HTML/CSS/JS)]
      |
      +---> [API Routes (/api/*)]
                  |
                  v
[MTA GTFS-Realtime API] <--- GTFS Buffer
```

## 3. Core Components

### 3.1. Frontend
*   **Name**: MTA Display Client
*   **Description**: A lightweight Vanilla JavaScript application that renders real-time subway arrival data. It consumes the backend API to update the UI dynamically.
*   **Technologies**: HTML5, CSS3, Vanilla JavaScript (ES Modules).
*   **Key Files**: `index.html`, `styles.css`, `src/client/main.js`.

### 3.2. Backend Services
*   **Name**: MTA Display Server
*   **Description**: An Express.js application acting as a proxy and data transformer for the NYC MTA Realtime API. It handles GTFS-realtime buffer parsing and provides a clean JSON API for the frontend.
*   **Technologies**: Node.js, Express, `gtfs-realtime-bindings`, `axios`.
*   **Deployment**:
    *   **Local**: Standard Node.js process (`npm start`).
    *   **Production**: Vercel Serverless Functions (via `api/index.js`).

## 4. Data Stores
*   **In-Memory**: The application currently processes real-time data on the fly and does not appear to maintain a persistent database. It relies on fetching fresh data from the MTA API.
*   **External Data**: NYC MTA GTFS-Realtime Feeds (ProtoBuf format).

## 5. External Integrations / APIs
*   **Service Name**: NYC MTA Realtime Data Feeds
*   **Purpose**: Provides live subway status and arrival times.
*   **Integration Method**: HTTP fetching of Protocol Buffer (ProtoBuf) feeds using `gtfs-realtime-bindings`.

## 6. Deployment & Infrastructure
*   **Cloud Provider**: Vercel
*   **Key Services**: Vercel Static Hosting (frontend), Vercel Functions (backend API).
*   **Configuration**: `vercel.json` maps `/api/*` requests to the backend function and handles static routing.

## 7. Security Considerations
*   **Environment Variables**: API keys (MTA) and configuration are managed via `.env` locally and Vercel Environment Variables in production.
*   **CORS**: Configured in `package.json` dependencies (likely used in `src/server/app.js`) to allow/restrict cross-origin requests.

## 8. Development & Testing Environment
*   **Local Setup**:
    1.  `npm install`
    2.  Setup `.env` with MTA API Key.
    3.  `npm run dev` (uses `nodemon` for hot reloading).
*   **Testing**:
    *   Framework: `vitest`
    *   Command: `npm test`
*   **Linting**: `eslint` (`npm run lint`).

## 9. Project Identification
*   **Project Name**: mta-display
*   **Repository URL**: [Repo URL]
*   **Primary Contact**: Tom Leger
