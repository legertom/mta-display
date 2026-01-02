# Architecture Overview

This document serves as a critical, living template designed to equip agents with a rapid and comprehensive understanding of the codebase's architecture, enabling efficient navigation and effective contribution from day one. Update this document as the codebase evolves.

## 1. Project Structure

This section provides a high-level overview of the project's directory and file structure, categorised by architectural layer or major functional area.

```
mta-display/
├── api/                   # Vercel Serverless Function Adapter
│   └── index.js           # Bridges Vercel requests to src/server/app.js
├── public/                # Static assets & Frontend Application
│   ├── images/            # Images folder
│   ├── js/                # Client-side JavaScript
│   │   ├── modules/       # Client modules (Api, UI, State)
│   │   └── main.v2.js     # Frontend entry point
│   ├── index.html         # Main application HTML
│   └── styles.css         # Global styles
├── src/                   # Server Source Code
│   └── server/            # Backend application (Node.js/Express)
│       ├── index.js       # Local Server Entry Point
│       ├── app.js         # Core Express App & Logic (Unified)
│       ├── config/        # Environment and app configuration
│       ├── controllers/   # API route controllers
│       ├── domain/        # Domain logic and models
│       ├── services/      # Business logic (e.g., MTA integration)
│       └── utils/         # Shared utilities
├── .env                   # Environment variables (not committed)
├── index.html             # (Legacy/Root) HTML entry point
├── package.json           # Project dependencies and scripts
└── vercel.json            # Deployment configuration for Vercel
```

## 2. High-Level System Diagram

The system uses a **Unified Backend** architecture. The core Express application is defined in `src/server/app.js` and is consumed by both the local development server and the Vercel production environment.

```
[User Browser]
      |
      | HTTP/HTTPS
      v
[ Vercel / Local Node ]
      |
      +---> [ Static Assets (public/) ]
      |
      +---> [ Server Logic (src/server/app.js) ]
                |
                v
      [MTA GTFS-Realtime API]
```

## 3. Core Components

### 3.1. Frontend
*   **Name**: MTA Display Client
*   **Description**: A lightweight Vanilla JavaScript application that renders real-time subway arrival data.
*   **Location**: `public/js/` and `public/index.html`.
*   **Entry Point**: `public/js/main.v2.js` (loaded as ES Module).
*   **Technologies**: HTML5, CSS3, Vanilla JavaScript (ES Modules).
*   **Key Files**: `public/index.html`, `public/styles.css`, `public/js/main.v2.js`.

### 3.2. Backend Services
*   **Name**: MTA Display Server
*   **Description**: An Express.js application acting as a proxy and data transformer for the NYC MTA Realtime API.
*   **Location**: `src/server/`.
*   **Core Logic**: `src/server/app.js` handles all routing, API logic, and middleware.
*   **Enty Points**:
    1.  **Local Dev**: `src/server/index.js` imports `app.js` and starts a local server on port 3000.
    2.  **Vercel Prod**: `api/index.js` imports `app.js` and exports it as a Vercel Serverless Function.
*   **Technologies**: Node.js, Express, `gtfs-realtime-bindings`, `axios`.

## 4. Data Stores
*   **In-Memory**: The application currently processes real-time data on the fly and does not maintain a persistent database. It relies on fetching fresh data from the MTA API.
*   **External Data**: NYC MTA GTFS-Realtime Feeds (ProtoBuf format).

## 5. External Integrations / APIs
*   **Service Name**: NYC MTA Realtime Data Feeds
*   **Purpose**: Provides live subway status and arrival times.
*   **Integration Method**: HTTP fetching of Protocol Buffer (ProtoBuf) feeds using `gtfs-realtime-bindings`.

## 6. Deployment & Infrastructure
*   **Cloud Provider**: Vercel
*   **Key Services**:
    *   **Static Hosting**: Serves content from `public/`.
    *   **Serverless Functions**: Executes `api/index.js` (which runs `src/server/app.js`) for `/api/*` routes.
*   **Configuration**: `vercel.json` and `package.json` scripts.

## 7. Security Considerations
*   **Environment Variables**: API keys (MTA) and configuration are managed via `.env` locally and Vercel Environment Variables in production.
*   **CORS**: Configured in `src/server/app.js` to allow/restrict cross-origin requests.

## 8. Development & Testing Environment
*   **Local Setup**:
    1.  `npm install`
    2.  Setup `.env` with MTA API Key.
    3.  `npm run dev` (runs `src/server/index.js` with `nodemon`).
*   **Testing**:
    *   Framework: `vitest`
    *   Command: `npm test`
*   **Linting**: `eslint` (`npm run lint`).

## 9. Project Identification
*   **Project Name**: mta-display
*   **Repository URL**: [Repo URL]
*   **Primary Contact**: Tom Leger
