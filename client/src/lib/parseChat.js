const EMPTY = { client: null, title: null, amount: null, dueDays: null };
const STOP = '(?:for|due|on|of|and|in|the|at|by)';
const UNIT_MULT = { k: 1e3, l: 1e5, lakh: 1e5, lakhs: 1e5, lac: 1e5, lacs: 1e5, cr: 1e7, crore: 1e7, crores: 1e7 };

const CURRENCY_AMOUNT_RE = /(?:₹|\brs\.?|\binr)\s*(\d[\d,]*(?:\.\d+)?)\s*(k|lakhs?|lacs?|l|crores?|cr)?\b/i;
const UNIT_AMOUNT_RE = /\b(\d[\d,]*(?:\.\d+)?)\s*(k|lakhs?|lacs?|l|crores?|cr)\b/i;
const TO_CLIENT_RE = new RegExp(`\\bto\\s+((?!${STOP}\\b)[A-Za-z][A-Za-z.'-]*(?:\\s+(?!${STOP}\\b)[A-Za-z][A-Za-z.'-]*)?)`, 'i');
const FOR_CLIENT_RE = new RegExp(`\\bfor\\s+((?!${STOP}\\b)[A-Za-z][A-Za-z.'-]*(?:\\s+(?!${STOP}\\b)[A-Za-z][A-Za-z.'-]*)?)`, 'i');
const FOR_TITLE_RE = /\bfor\s+(.+?)(?=[,;!?]|\.\s|\s+due\b|$)/i;
const DUE_DAYS_RE = /\bdue\s+in\s+(\d+)\s*(days?|weeks?)\b/i;

function parseAmount(text) {
  const m = text.match(CURRENCY_AMOUNT_RE) || text.match(UNIT_AMOUNT_RE);
  if (!m) return null;
  const base = Number(m[1].replace(/,/g, ''));
  const unit = (m[2] || '').toLowerCase();
  const value = base * (unit ? UNIT_MULT[unit] ?? 1 : 1);
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : null;
}

function parseDueDays(text) {
  if (/\bdue\s+today\b/i.test(text)) return 0;
  if (/\bdue\s+tomorrow\b/i.test(text)) return 1;
  const m = text.match(DUE_DAYS_RE);
  if (!m) return null;
  const n = Number(m[1]);
  return /^week/i.test(m[2]) ? n * 7 : n;
}

function clean(value) {
  return value.replace(/[\s.,;:!?'"-]+$/, '').trim();
}

export function parseChat(text) {
  try {
    const src = String(text ?? '');
    if (!src.trim()) return { ...EMPTY };

    let client = null;
    const toMatch = src.match(TO_CLIENT_RE);
    const forClient = src.match(FOR_CLIENT_RE);
    if (toMatch) client = clean(toMatch[1]) || null;
    else if (forClient) client = clean(forClient[1]) || null;

    let title = null;
    const forTitle = src.match(FOR_TITLE_RE);
    if (forTitle && (toMatch || !forClient || forTitle[1] !== forClient[1])) {
      const raw = clean(forTitle[1]);
      title = raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : null;
    }

    return {
      client,
      title,
      amount: parseAmount(src),
      dueDays: parseDueDays(src),
    };
  } catch {
    return { ...EMPTY };
  }
}
