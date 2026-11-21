'use strict';
// SoloLedger Express API server.
const express = require('express');
const cors = require('cors');
const { db, seedDatabase } = require('./database');
const { calculateCashForecast } = require('./services/forecastService');
const { generateAlerts } = require('./services/alertService');

const app = express();
app.use(cors());
app.use(express.json());

const STATUSES = ['draft', 'sent', 'overdue', 'paid'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Local calendar date (YYYY-MM-DD) for today.
function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function nowIso() {
  return new Date().toISOString();
}

// Whole local days between a YYYY-MM-DD due date and today (positive = overdue).
function daysOverdue(dueDate) {
  const [y, m, d] = dueDate.split('-').map(Number);
  const due = new Date(y, m - 1, d);
  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((todayMidnight - due) / 86400000);
}

// Indian digit grouping, e.g. 145000 -> "₹1,45,000".
function formatRupees(amount) {
  const n = Math.round(Number(amount));
  const sign = n < 0 ? '-' : '';
  const s = String(Math.abs(n));
  if (s.length <= 3) return `${sign}₹${s}`;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${sign}₹${rest},${last3}`;
}

// Wraps a handler so any thrown error becomes a 500 JSON response.
const wrap = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

app.get('/api/dashboard', wrap((req, res) => {
  const settings = db.prepare(
    'SELECT business_name, upi_id, current_cash_balance, safety_buffer FROM settings WHERE id = 1'
  ).get();
  const overdue = db.prepare(`
    SELECT COUNT(*) AS overdueCount, COALESCE(SUM(amount), 0) AS overdueAmount
    FROM invoices WHERE status = 'overdue'`).get();
  const bills = db.prepare(`
    SELECT COUNT(*) AS unpaidBillsCount, COALESCE(SUM(amount), 0) AS unpaidBillsAmount
    FROM bills WHERE is_paid = 0`).get();
  res.json({
    settings,
    totals: { ...overdue, ...bills },
    forecast: calculateCashForecast(db, 90, null),
    alerts: generateAlerts(db),
  });
}));

app.get('/api/clients', wrap((req, res) => {
  res.json(db.prepare('SELECT * FROM clients ORDER BY id').all());
}));

app.post('/api/clients', wrap((req, res) => {
  const { name, email = null, phone = null } = req.body || {};
  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  const info = db.prepare('INSERT INTO clients (name, email, phone) VALUES (?, ?, ?)')
    .run(name.trim(), email, phone);
  const row = db.prepare('SELECT * FROM clients WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(row);
}));

app.get('/api/invoices', wrap((req, res) => {
  res.json(db.prepare(`
    SELECT i.*, c.name AS client_name
    FROM invoices i
    LEFT JOIN clients c ON c.id = i.client_id
    ORDER BY i.due_date`).all());
}));

app.post('/api/invoices', wrap((req, res) => {
  const { client_id = null, title, amount, due_date, issue_date = null } = req.body || {};
  const amt = Number(amount);
  if (typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'title is required' });
  }
  if (!Number.isFinite(amt) || amt <= 0) {
    return res.status(400).json({ error: 'amount must be greater than 0' });
  }
  if (typeof due_date !== 'string' || !DATE_RE.test(due_date)) {
    return res.status(400).json({ error: 'due_date must be YYYY-MM-DD' });
  }
  const info = db.prepare(
    "INSERT INTO invoices (client_id, title, amount, issue_date, due_date, status) VALUES (?, ?, ?, ?, ?, 'sent')"
  ).run(client_id, title.trim(), amt, issue_date, due_date);
  const row = db.prepare('SELECT * FROM invoices WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(row);
}));

app.patch('/api/invoices/:id/status', wrap((req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body || {};
  if (!STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of ${STATUSES.join(', ')}` });
  }

  db.exec('BEGIN');
  try {
    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
    if (!invoice) {
      db.exec('ROLLBACK');
      return res.status(404).json({ error: 'Invoice not found' });
    }
    if (status === 'paid' && invoice.status !== 'paid') {
      db.prepare("UPDATE invoices SET status = 'paid', paid_at = ? WHERE id = ?").run(nowIso(), id);
      db.prepare('UPDATE settings SET current_cash_balance = current_cash_balance + ? WHERE id = 1')
        .run(invoice.amount);
    } else {
      db.prepare('UPDATE invoices SET status = ? WHERE id = ?').run(status, id);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  res.json(db.prepare('SELECT * FROM invoices WHERE id = ?').get(id));
}));

app.post('/api/invoices/:id/chase', wrap((req, res) => {
  const id = Number(req.params.id);
  const invoice = db.prepare(`
    SELECT i.*, c.name AS client_name
    FROM invoices i
    LEFT JOIN clients c ON c.id = i.client_id
    WHERE i.id = ?`).get(id);
  if (!invoice) {
    return res.status(404).json({ error: 'Invoice not found' });
  }

  const lastChasedAt = nowIso();
  db.prepare('UPDATE invoices SET last_chased_at = ? WHERE id = ?').run(lastChasedAt, id);

  const days = daysOverdue(invoice.due_date);
  const tone = days > 14 ? 'final' : days >= 1 ? 'firm' : 'polite';

  const settings = db.prepare('SELECT business_name, upi_id FROM settings WHERE id = 1').get() || {};
  const name = invoice.client_name || 'there';
  const amount = formatRupees(invoice.amount);
  const sign = `Regards,\n${settings.business_name || 'SoloLedger'}\nUPI: ${settings.upi_id || '-'}`;

  const drafts = {
    polite: `Hi ${name},\n\nA friendly reminder that invoice "${invoice.title}" for ${amount} was due on ${invoice.due_date}. Please arrange payment at your convenience.\n\n${sign}`,
    firm: `Hi ${name},\n\nInvoice "${invoice.title}" for ${amount} was due on ${invoice.due_date} and is now overdue. Please clear the payment at the earliest.\n\n${sign}`,
    final: `Hi ${name},\n\nThis is a final reminder: invoice "${invoice.title}" for ${amount}, due on ${invoice.due_date}, remains unpaid. Please settle it immediately to avoid further action.\n\n${sign}`,
  };

  res.json({ invoiceId: id, last_chased_at: lastChasedAt, tone, drafts });
}));

app.get('/api/bills', wrap((req, res) => {
  res.json(db.prepare('SELECT * FROM bills ORDER BY due_date').all());
}));

app.post('/api/bills', wrap((req, res) => {
  const { name, amount, due_date } = req.body || {};
  const amt = Number(amount);
  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  if (!Number.isFinite(amt) || amt <= 0) {
    return res.status(400).json({ error: 'amount must be greater than 0' });
  }
  if (typeof due_date !== 'string' || !DATE_RE.test(due_date)) {
    return res.status(400).json({ error: 'due_date must be YYYY-MM-DD' });
  }
  const info = db.prepare('INSERT INTO bills (name, amount, due_date) VALUES (?, ?, ?)')
    .run(name.trim(), amt, due_date);
  const row = db.prepare('SELECT * FROM bills WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(row);
}));

app.patch('/api/bills/:id/pay', wrap((req, res) => {
  const id = Number(req.params.id);
  const bill = db.prepare('SELECT * FROM bills WHERE id = ?').get(id);
  if (!bill) {
    return res.status(404).json({ error: 'Bill not found' });
  }
  if (bill.is_paid === 1) {
    return res.status(409).json({ error: 'Bill is already paid' });
  }

  db.exec('BEGIN');
  try {
    db.prepare('UPDATE bills SET is_paid = 1, paid_at = ? WHERE id = ?').run(nowIso(), id);
    db.prepare('UPDATE settings SET current_cash_balance = current_cash_balance - ? WHERE id = 1')
      .run(bill.amount);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  res.json(db.prepare('SELECT * FROM bills WHERE id = ?').get(id));
}));

app.get('/api/forecast', wrap((req, res) => {
  const days = Number(req.query.days) || 90;
  const delayInvoiceId = req.query.delayInvoiceId;
  const delayDays = Number(req.query.delayDays) || 0;
  const whatIf = delayInvoiceId ? { invoiceId: Number(delayInvoiceId), delayDays } : null;
  res.json(calculateCashForecast(db, days, whatIf));
}));

app.post('/api/reset', wrap((req, res) => {
  seedDatabase(true);
  res.json({ ok: true });
}));

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`SoloLedger server running at http://localhost:${PORT}`);
});
