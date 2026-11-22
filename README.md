# SoloLedger
#Deploy Link:https://sololedger-4ohe.onrender.com/

SoloLedger is a cash-flow workspace for Apex Studios, a boutique brand and design studio in Hyderabad. It tracks invoices, bills, and customer payment behaviour, and forecasts the cash balance so the studio can see upcoming shortfalls before they happen.

## Key features

- **20-Second Quick Invoice**: Paste a WhatsApp message to parse invoice details, then generate a UPI QR code
- **Realistic History-Adjusted Cash Forecast**
- **What-If Delay Simulator**
- **Bad Day Rescue Mode**
- **Customer Reliability Profiles**
- **Split-Screen Chase Stage**
- **Obsidian Dark and Cool-Slate Light Themes**

## Tech stack

- React and Vite
- Tailwind CSS and Recharts
- Node.js (`node:sqlite`) and Express

## Local setup

Requires Node 22+. Use two terminals.

**Terminal 1 (API):**

```bash
cd server
npm install
npm start
```

The API runs on http://localhost:5000.

**Terminal 2 (UI):**

```bash
cd client
npm install
npm run dev
```

The UI runs on http://localhost:5173 and proxies `/api` requests to port 5000.

## Render deployment

- **Build Command:** `npm run build`
- **Start Command:** `npm start`
- **Node version:** 22 (set by the `engines` field in `package.json`)

The server serves the built client from `client/dist` and listens on `process.env.PORT`.
