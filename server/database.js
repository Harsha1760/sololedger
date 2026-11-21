'use strict';
// SoloLedger SQLite setup (node:sqlite) and seed data.
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const db = new DatabaseSync(path.join(__dirname, 'sololedger.db'));
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  business_name TEXT,
  upi_id TEXT,
  current_cash_balance REAL NOT NULL DEFAULT 0,
  safety_buffer REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER REFERENCES clients(id),
  title TEXT NOT NULL,
  amount REAL NOT NULL,
  issue_date TEXT,
  due_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('draft','sent','overdue','paid')),
  paid_at TEXT,
  last_chased_at TEXT
);

CREATE TABLE IF NOT EXISTS bills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  amount REAL NOT NULL,
  due_date TEXT NOT NULL,
  is_paid INTEGER NOT NULL DEFAULT 0,
  paid_at TEXT
);
`);

// Local calendar date (YYYY-MM-DD) offset by a number of days from today.
function dateOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function seedDatabase(forceReset = false) {
  if (forceReset) {
    db.exec('DELETE FROM invoices;');
    db.exec('DELETE FROM bills;');
    db.exec('DELETE FROM clients;');
    db.exec('DELETE FROM settings;');
  } else if (db.prepare('SELECT COUNT(*) AS n FROM clients').get().n > 0) {
    return;
  }

  db.exec('BEGIN');
  try {
    db.prepare(
      'INSERT INTO settings (id, business_name, upi_id, current_cash_balance, safety_buffer) VALUES (1, ?, ?, ?, ?)'
    ).run('Aarav Design Studio', 'aaravstudio@upi', 85000, 25000);

    const insertClient = db.prepare('INSERT INTO clients (name, email, phone) VALUES (?, ?, ?)');
    const clients = [
      ['Meera Textiles Pvt Ltd', 'accounts@meeratextiles.in', '9876501234'],
      ['Rohan Mehta', 'rohan.mehta@gmail.com', '9822012345'],
      ['Kaveri Foods LLP', 'finance@kaverifoods.in', '9811098765'],
      ['Vikram Rao', 'vikram.rao@outlook.com', '9890011223'],
      ['Sunrise Dental Clinic', 'billing@sunrisedental.in', '9845556677'],
      ['Nidhi Interiors', 'hello@nidhiinteriors.com', '9700123456'],
    ];
    const clientIds = clients.map(([name, email, phone]) =>
      insertClient.run(name, email, phone).lastInsertRowid
    );

    // [clientIndex, title, amount, dueDayOffset, status]
    const invoices = [
      [0, 'Brand identity - Phase 1', 145000, -45, 'overdue'],
      [2, 'Packaging artwork', 62000, -30, 'overdue'],
      [3, 'Logo refresh', 18000, -15, 'overdue'],
      [4, 'Clinic signage and website', 96000, -60, 'overdue'],
      [1, 'Website redesign', 54000, 10, 'sent'],
      [5, 'Showroom mood boards', 73500, 18, 'sent'],
      [0, 'Brand identity - Phase 2', 120000, 25, 'sent'],
      [2, 'Social media kit', 28000, 40, 'sent'],
      [4, 'Patient brochure set', 35000, 55, 'sent'],
    ];
    const insertInvoice = db.prepare(
      'INSERT INTO invoices (client_id, title, amount, issue_date, due_date, status) VALUES (?, ?, ?, ?, ?, ?)'
    );
    for (const [ci, title, amount, offset, status] of invoices) {
      insertInvoice.run(clientIds[ci], title, amount, dateOffset(offset - 30), dateOffset(offset), status);
    }

    const insertBill = db.prepare('INSERT INTO bills (name, amount, due_date, is_paid) VALUES (?, ?, ?, 0)');
    const bills = [
      ['Office rent', 45000, 4],
      ['Staff salaries', 110000, 7],
      ['Figma and Adobe subscriptions', 6800, 12],
      ['GST payment (GSTR-3B)', 38500, 20],
      ['Electricity bill', 4200, 16],
      ['Internet and broadband', 1899, 26],
    ];
    for (const [name, amount, offset] of bills) {
      insertBill.run(name, amount, dateOffset(offset));
    }

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

seedDatabase();

module.exports = { db, seedDatabase };
