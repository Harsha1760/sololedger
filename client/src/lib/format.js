const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});
const dateFormatter = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const shortDateFormatter = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });
const DAY_MS = 86400000;

export function formatINR(n) {
  return inrFormatter.format(Number(n) || 0);
}

// "YYYY-MM-DD" (or a timestamp starting with it) -> local Date, avoiding timezone shifts.
export function parseYMD(value) {
  const [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function formatDate(value) {
  return value ? dateFormatter.format(parseYMD(value)) : '—';
}

export function formatDateShort(value) {
  return value ? shortDateFormatter.format(parseYMD(value)) : '—';
}

export function todayYMD() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Whole calendar days from `from` to `to` (positive when `to` is later).
export function daysBetween(from, to) {
  const a = parseYMD(from);
  const b = parseYMD(to);
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((utcB - utcA) / DAY_MS);
}
