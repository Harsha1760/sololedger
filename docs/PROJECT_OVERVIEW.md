# SoloLedger Project Overview

## 1. Purpose

SoloLedger is a cash-flow workspace for Apex Studios, a boutique brand and design studio in Hyderabad. It tracks invoices, bills and customer payment behaviour, and forecasts cash balance to show upcoming shortfalls.

## 2. Features

Listed in the README:

- **20-Second Quick Invoice**: WhatsApp chat parser and UPI QR code.
- **Realistic history-adjusted cash forecast.**
- **What-If delay simulator.**
- **Bad Day rescue mode.**
- **Customer reliability profiles.**
- **Split-screen chase stage.**
- **Obsidian dark and cool-slate light themes.**

## 3. Folder Structure

- **Root**
  - `package.json`: private package `sololedger` version 1.0.0, engines `node >=22.13.0`. The build script installs server and client dependencies and builds the client. The start script runs the server.
  - `README.md`
  - `.gitignore`
  - `.vscode/`
- **`server/`**
  - `index.js`: Express app, all routes.
  - `database.js`: `node:sqlite` connection, schema, seed data.
  - `services/forecastService.js`
  - `services/alertService.js`
- **`client/`**
  - `vite.config.js`: React and Tailwind plugins; dev proxy `/api` to `http://localhost:5000`.
  - `src/main.jsx`
  - `src/App.jsx`
  - `src/lib/api.js`
  - `src/lib/format.js`
  - `src/lib/parseChat.js`
  - `src/views/`: `OverviewTab`, `CustomersTab`, `InvoicesTab`, `CashForecastTab`, `BillsTab`
  - `src/components/`: `ui`, `Modal`, `NewInvoiceModal`, `FollowUpDrawer`

## 4. Components and Interaction

The request path is:

1. **Browser client** (React views in `client/src/views/`).
2. **`client/src/lib/api.js`**: a fetch wrapper that prefixes paths with `/api` and throws on non-2xx responses.
3. **Express routes** in `server/index.js`.
4. **`server/database.js`** (`DatabaseSync` from `node:sqlite`, database file `server/sololedger.db`) and the **services** in `server/services/`.

Module dependencies:

- `alertService` imports `calculateCashForecast`, `daysBetween` and `addDays` from `forecastService`.
- `index.js` imports `database`, `forecastService` and `alertService`.

Serving:

- **Production:** the Express server serves `client/dist` for non-`/api` GET requests.
- **Development:** Vite proxies `/api` requests to port 5000.

## 5. API Routes

| Method | Path | Notes |
|---|---|---|
| GET | `/api/dashboard` | |
| GET | `/api/clients` | |
| GET | `/api/customers` | |
| POST | `/api/clients` | |
| GET | `/api/invoices` | |
| POST | `/api/invoices` | |
| PATCH | `/api/invoices/:id/status` | Marking paid adds the amount to cash balance, in a transaction. |
| POST | `/api/invoices/:id/chase` | |
| GET | `/api/bills` | |
| POST | `/api/bills` | |
| PATCH | `/api/bills/:id/pay` | Subtracts the amount from cash, in a transaction. Returns 409 if already paid. |
| GET | `/api/forecast` | Query parameters: `days`, `delayInvoiceId`, `delayDays`, `realistic`. |
| PATCH | `/api/settings` | |
| POST | `/api/reset` | Re-seeds the database. |

## 6. Database Schema

Defined in `server/database.js`. Foreign keys are enabled. Demo data is seeded on first run.

| Table | Columns | Notes |
|---|---|---|
| `settings` | `id`, `business_name`, `upi_id`, `current_cash_balance`, `safety_buffer` | Single row, `id = 1`. |
| `clients` | `id`, `name`, `email`, `phone`, `created_at` | |
| `invoices` | `id`, `client_id`, `title`, `amount`, `issue_date`, `due_date`, `status`, `paid_at`, `last_chased_at` | `client_id` references `clients`. `status` is one of `draft`, `sent`, `overdue`, `paid`. |
| `bills` | `id`, `name`, `amount`, `due_date`, `is_paid`, `paid_at` | |

## 7. Running Locally

Requires Node 22.13.0 or later, matching the engines field in package.json.

- **Terminal 1 (API):** `cd server`, `npm install`, `npm start`. API runs on port 5000.
- **Terminal 2 (UI):** `cd client`, `npm install`, `npm run dev`. UI runs on port 5173.

Render deployment:

- Build command: `npm run build`
- Start command: `npm start`
- The server listens on `process.env.PORT`, which defaults to 5000 in code.

## 8. Technology Choices

- **React 19 and Vite (client):** No stated reason found.
- **Tailwind CSS 4:** No stated reason found.
- **Recharts:** No stated reason found.
- **Express 4 (server):** No stated reason found.
- **`node:sqlite` (built-in SQLite, no separate database server):** No stated reason found.
  - Inferred: it avoids an external database dependency.
- **Node 22.13+ requirement:** No stated reason found.
- **Serving the built client from the Express server (single deploy on Render):** No stated reason found.
  - Inferred: one process serves both UI and API.

## 9. Architecture Choices

- **Services separated from route handlers** (forecast and alert logic live in `server/services/`): No stated reason found.
  - Inferred: this keeps the calculations usable as plain functions.
- **Client and server in separate folders, each with its own `package.json`:** No stated reason found.

## 10. Open Questions and Gaps

- No stated reasons for technology or architecture choices exist in the README.
- The git history checked gave no design rationale.
- `formatINR` in `alertService` is exported but not imported elsewhere.
- Not reviewed in this document: dashboard and forecast handler internals, and the client `parseChat` and `format` logic.

## 11. Should the README Carry This?

The README covers purpose, features, stack, setup and deployment adequately for a new developer. It does not cover folder structure, API routes, database schema or architecture. This document adds those four areas, so a separate document is warranted. The README should stay as the short entry point, and this file should hold the reference detail. The README itself was not edited.
