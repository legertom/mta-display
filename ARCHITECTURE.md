# Architecture Overview

This document serves as a critical, living template designed to equip agents with a rapid and comprehensive understanding of the codebase's architecture, enabling efficient navigation and effective contribution from day one. Update this document as the codebase evolves.

## 1. Project Structure

This section provides a high-level overview of the project's directory and file structure, categorised by architectural layer or major functional area.

```
mta-display/
├── api/                   # Vercel Serverless Function (Monolithic entry point)
│   └── index.js           # Independent server implementation for Vercel
├── public/                # Static assets hosted by Vercel
│   └── images/            # Images folder
├── src/                   # Main source code (Local Development)
│   ├── client/            # Frontend application (Vanilla JS)
│   │   ├── main.js        # Frontend entry point
│   │   └── modules/       # Client-side modules
│   │       ├── api/       # API integration
│   │       ├── state/     # State management
│   │       ├── ui/        # UI components and rendering
│   │       └── utils/     # Frontend utilities
│   └── server/            # Backend application (Node.js/Express)
│       ├── index.js       # Local Server entry point
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

The system follows a standard client-server architecture but maintains **two distinct backend implementations** to support different deployment targets.

> [!WARNING]
> There is significant logic duplication between `api/index.js` (Vercel) and `src/server/` (Local). Changes to backend logic (e.g., data fetching, parsing) must often be applied to **both** locations to ensure consistency between local development and production.

```
[User Browser]
      |
      | HTTP/HTTPS
      v
[Vercel (Production)]        OR        [Node Server (Local)]
      |                                      |
      | (`api/index.js`)                     | (`src/server/index.js`)
      |                                      |
      v                                      v
[MTA GTFS-Realtime API] <--- GTFS Buffer --+
```

## 3. Core Components

### 3.1. Frontend
*   **Name**: MTA Display Client
*   **Description**: A lightweight Vanilla JavaScript application that renders real-time subway arrival data. It consumes the backend API to update the UI dynamically.
*   **Technologies**: HTML5, CSS3, Vanilla JavaScript (ES Modules).
*   **Key Files**: `index.html`, `styles.css`, `src/client/main.js`, `src/client/modules/{api,state,ui,utils}/`.

### 3.2. Backend Services
*   **Name**: MTA Display Server
*   **Description**: An Express.js application acting as a proxy and data transformer for the NYC MTA Realtime API.
*   **Implementations**:
    1.  **Local (`src/server/`)**: A modular, structured Express app using controllers and services.
    2.  **Production (`api/index.js`)**: A monolithic, standalone script specialized for Vercel Serverless Functions.
*   **Technologies**: Node.js, Express, `gtfs-realtime-bindings`, `axios`.
*   **Deployment**:
    *   **Local**: Standard Node.js process (`npm start` runs `src/server/index.js`).
    *   **Production**: Vercel Serverless Functions (uses `api/index.js`).

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
