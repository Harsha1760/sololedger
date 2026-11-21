'use strict';

// Local-date helpers. Pure local arithmetic (no toISOString, which shifts by timezone).
function parseYMD(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatYMD(dt) {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(dateStr, n) {
  const dt = parseYMD(dateStr);
  dt.setDate(dt.getDate() + n);
  return formatYMD(dt);
}

// Whole calendar days from fromStr to toStr (UTC math avoids DST off-by-one).
function daysBetween(fromStr, toStr) {
  const a = parseYMD(fromStr);
  const b = parseYMD(toStr);
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((utcB - utcA) / 86400000);
}

// Builds a daily balance series from events. Events outside 0..days are ignored.
function buildScenario(events, startingBalance, days, today) {
  const series = [];
  for (let i = 0; i <= days; i++) {
    series.push({ date: addDays(today, i), balance: 0, inflow: 0, outflow: 0, items: [] });
  }

  for (const ev of events) {
    const offset = daysBetween(today, ev.expected);
    if (offset < 0 || offset > days) continue;
    const day = series[offset];
    if (ev.type === 'invoice') day.inflow += ev.amount;
    else day.outflow += ev.amount;
    day.items.push({ type: ev.type, id: ev.id, label: ev.label, amount: ev.amount });
  }

  let balance = startingBalance;
  for (const day of series) {
    balance = balance + day.inflow - day.outflow;
    day.balance = balance;
  }
  return series;
}

function summarise(series, safetyBuffer) {
  let lowest = series[0];
  for (const day of series) {
    if (day.balance < lowest.balance) lowest = day;
  }
  const lowestBalance = lowest.balance;
  return {
    lowestBalance,
    lowestDate: lowest.date,
    dipsBelowBuffer: lowestBalance < safetyBuffer,
    dipsBelowZero: lowestBalance < 0,
  };
}

// Local calendar date (YYYY-MM-DD) of a stored ISO timestamp.
function localYmdOf(iso) {
  return formatYMD(new Date(iso));
}

/**
 * Per-client payment history from PAID invoices.
 * Returns Map<clientId, { paidCount, avgLateDays }>. avgLateDays is the rounded mean of whole
 * local days between due_date and the local paid_at date (0 when there is no paid history).
 */
function paymentHistoryByClient(db) {
  const rows = db
    .prepare("SELECT client_id, due_date, paid_at FROM invoices WHERE status = 'paid' AND paid_at IS NOT NULL")
    .all();
  const acc = new Map();
  for (const r of rows) {
    const late = daysBetween(r.due_date, localYmdOf(r.paid_at));
    const entry = acc.get(r.client_id) || { paidCount: 0, total: 0 };
    entry.paidCount += 1;
    entry.total += late;
    acc.set(r.client_id, entry);
  }
  const out = new Map();
  for (const [clientId, e] of acc) {
    out.set(clientId, { paidCount: e.paidCount, avgLateDays: Math.round(e.total / e.paidCount) });
  }
  return out;
}

/**
 * Cash forecast over `days` (30, 60 or 90; anything else becomes 90).
 * whatIf: { invoiceId, delayDays } shifts one unpaid invoice's expected date in the simulated run.
 * options: { realistic } shifts every open invoice's due date later by its client's avgLateDays
 * (from PAID history) before the overdue/past-due default; the what-if shift is applied after it.
 * Top-level lowest/dips values come from the simulated summary when it exists, else the baseline.
 */
function calculateCashForecast(db, days = 90, whatIf = null, options = {}) {
  if (![30, 60, 90].includes(days)) days = 90;
  const realistic = Boolean(options && options.realistic);

  const today = formatYMD(new Date());

  const settings =
    db.prepare('SELECT current_cash_balance, safety_buffer FROM settings WHERE id = 1').get() ||
    { current_cash_balance: 0, safety_buffer: 0 };
  const startingBalance = settings.current_cash_balance;
  const safetyBuffer = settings.safety_buffer;

  const invoices = db
    .prepare(
      "SELECT id, client_id, title, amount, due_date, status FROM invoices WHERE status IN ('sent', 'overdue')"
    )
    .all();
  const bills = db.prepare('SELECT id, name, amount, due_date FROM bills WHERE is_paid = 0').all();
  const history = realistic ? paymentHistoryByClient(db) : null;

  // Invoice inflows. Realistic mode shifts the due date by the client's average late days first.
  // Overdue or past-due invoices are expected in 5 days.
  const invoiceEvents = invoices.map((inv) => {
    const shift = realistic ? (history.get(inv.client_id)?.avgLateDays ?? 0) : 0;
    const dueDate = shift ? addDays(inv.due_date, shift) : inv.due_date;
    const expected = inv.status === 'overdue' || dueDate < today ? addDays(today, 5) : dueDate;
    return { type: 'invoice', id: inv.id, label: inv.title, amount: inv.amount, expected, invoiceId: inv.id };
  });

  // Bill outflows. Past-due bills are expected today.
  const billEvents = bills.map((b) => ({
    type: 'bill',
    id: b.id,
    label: b.name,
    amount: b.amount,
    expected: b.due_date < today ? today : b.due_date,
  }));

  const baselineEvents = [...invoiceEvents, ...billEvents];
  const baseline = buildScenario(baselineEvents, startingBalance, days, today);
  const baselineSummary = summarise(baseline, safetyBuffer);

  let simulated = null;
  let simulatedSummary = null;
  let whatIfOut = null;
  if (whatIf) {
    const delayDays = Number(whatIf.delayDays) || 0;
    // Shift applied after the overdue/past-due default.
    const shiftedEvents = baselineEvents.map((ev) =>
      ev.type === 'invoice' && ev.invoiceId === whatIf.invoiceId
        ? { ...ev, expected: addDays(ev.expected, delayDays) }
        : ev
    );
    simulated = buildScenario(shiftedEvents, startingBalance, days, today);
    simulatedSummary = summarise(simulated, safetyBuffer);
    whatIfOut = { invoiceId: whatIf.invoiceId, delayDays };
  }

  // Top-level values use the simulated scenario when present, otherwise the baseline.
  const top = simulatedSummary || baselineSummary;

  return {
    days,
    startingBalance,
    safetyBuffer,
    baseline,
    simulated,
    baselineSummary,
    simulatedSummary,
    whatIf: whatIfOut,
    lowestBalance: top.lowestBalance,
    lowestDate: top.lowestDate,
    dipsBelowSafetyBuffer: top.dipsBelowBuffer,
    dipsBelowZero: top.dipsBelowZero,
  };
}

module.exports = { calculateCashForecast, daysBetween, addDays, paymentHistoryByClient, localYmdOf };
