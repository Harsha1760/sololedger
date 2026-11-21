'use strict';

const { calculateCashForecast, daysBetween, addDays } = require('./forecastService');

const SEVERITY_RANK = { critical: 0, warning: 1, info: 2 };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Indian digit grouping: last 3 digits, then groups of 2. e.g. 145000 -> ₹1,45,000
function formatINR(n) {
  const num = Math.round(Number(n) || 0);
  const sign = num < 0 ? '-' : '';
  const s = String(Math.abs(num));
  if (s.length <= 3) return `${sign}₹${s}`;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${sign}₹${rest},${last3}`;
}

// "YYYY-MM-DD" -> "12 Mar" (parsed manually to avoid timezone shifts)
function formatDate(dateStr) {
  const [, m, d] = String(dateStr).split('-');
  const day = String(Number(d));
  return `${day} ${MONTHS[Number(m) - 1]}`;
}

function localToday() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function generateAlerts(db) {
  const today = localToday();
  const in3 = addDays(today, 3);
  const in7 = addDays(today, 7);
  const alerts = [];

  // 1. Overdue invoices (sent or overdue status, due date already passed)
  const overdueInvoices = db
    .prepare(
      `SELECT i.id, i.title, i.amount, i.due_date, i.status, c.name AS client_name
         FROM invoices i
         LEFT JOIN clients c ON c.id = i.client_id
        WHERE i.status IN (?, ?) AND i.due_date < ?`
    )
    .all('overdue', 'sent', today);

  for (const inv of overdueInvoices) {
    const days = daysBetween(inv.due_date, today);
    alerts.push({
      severity: 'critical',
      type: 'overdue_invoice',
      message: `Chase ${inv.client_name || inv.title} (${formatINR(inv.amount)} — ${days} days overdue) today`,
      action: { type: 'chase', invoiceId: inv.id },
      _sortDays: days,
    });
  }

  // 2. Projected cash dip over the next 90 days
  const forecast = calculateCashForecast(db, 90, null);
  if (forecast && forecast.dipsBelowZero) {
    alerts.push({
      severity: 'critical',
      type: 'cash_forecast',
      message: `Cash projected to go below ₹0 on ${formatDate(forecast.lowestDate)} — chase overdue invoices`,
      action: { type: 'forecast' },
      _sortDays: 0,
    });
  } else if (forecast && forecast.dipsBelowSafetyBuffer) {
    alerts.push({
      severity: 'warning',
      type: 'cash_forecast',
      message: `Cash projected to dip below safety buffer on ${formatDate(forecast.lowestDate)} — chase overdue invoices`,
      action: { type: 'forecast' },
      _sortDays: 0,
    });
  }

  // 3. Bills already overdue (unpaid, due date passed)
  const overdueBills = db
    .prepare('SELECT id, name, amount, due_date FROM bills WHERE is_paid = 0 AND due_date < ?')
    .all(today);

  for (const bill of overdueBills) {
    alerts.push({
      severity: 'critical',
      type: 'overdue_bill',
      message: `Pay ${bill.name} (${formatINR(bill.amount)}) — overdue since ${formatDate(bill.due_date)}`,
      action: { type: 'pay', billId: bill.id },
      _sortDays: daysBetween(bill.due_date, today),
    });
  }

  // 4. Bills due within the next 7 days
  const upcomingBills = db
    .prepare(
      'SELECT id, name, amount, due_date FROM bills WHERE is_paid = 0 AND due_date >= ? AND due_date <= ?'
    )
    .all(today, in7);

  for (const bill of upcomingBills) {
    alerts.push({
      severity: 'warning',
      type: 'bill_due',
      message: `Pay ${bill.name} (${formatINR(bill.amount)}) on ${formatDate(bill.due_date)}`,
      action: { type: 'pay', billId: bill.id },
      _sortDays: 0,
    });
  }

  // 5. Sent invoices due within the next 3 days
  const upcomingInvoices = db
    .prepare(
      `SELECT i.id, i.title, i.amount, i.due_date, c.name AS client_name
         FROM invoices i
         LEFT JOIN clients c ON c.id = i.client_id
        WHERE i.status = ? AND i.due_date >= ? AND i.due_date <= ?`
    )
    .all('sent', today, in3);

  for (const inv of upcomingInvoices) {
    alerts.push({
      severity: 'info',
      type: 'invoice_due_soon',
      message: `Invoice ${inv.title} for ${inv.client_name || 'client'} (${formatINR(inv.amount)}) is due on ${formatDate(inv.due_date)}`,
      action: { type: 'chase', invoiceId: inv.id },
      _sortDays: 0,
    });
  }

  // Critical first, then warning, then info; most overdue first within a severity.
  alerts.sort((a, b) => {
    const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (bySeverity !== 0) return bySeverity;
    return b._sortDays - a._sortDays;
  });

  return alerts.map(({ _sortDays, ...alert }, index) => ({
    priority: index + 1,
    ...alert,
  }));
}

module.exports = { generateAlerts, formatINR };
