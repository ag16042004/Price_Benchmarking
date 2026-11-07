const CURRENCIES = [
  [/₹|\bRs\.?(?=\s|\d)|\bINR\b/i, 'INR'],
  [/US\$|\$|\bUSD\b/i, 'USD'],
  [/€|\bEUR\b/i, 'EUR'],
  [/£|\bGBP\b/i, 'GBP'],
];

export function detectCurrency(s) {
  for (const [re, code] of CURRENCIES) if (re.test(s)) return code;
  return null;
}

/** Handles 1,23,456.00 (Indian), 1,234.50 (US), 1.234,50 (EU), 12,50 (decimal comma). */
export function parseNumber(str) {
  // Isolate the number first, so punctuation from the currency text ("Rs.", "INR:") is never mistaken for a separator.
  let s = (String(str).match(/\d[\d.,]*\d|\d/) || [])[0];
  if (!s) return null;
  const dot = s.lastIndexOf('.'), comma = s.lastIndexOf(',');
  if (dot > -1 && comma > -1) {
    const dec = dot > comma ? '.' : ',';
    const thou = dec === '.' ? ',' : '.';
    s = s.split(thou).join('').replace(dec, '.');
  } else if (comma > -1) {
    if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (dot > -1 && (s.match(/\./g) || []).length > 1) {
    s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Returns { amount, currency } or null. A price whose currency we cannot determine is rejected, never guessed. */
export function parsePrice(raw, hintCurrency) {
  if (raw == null || raw === '') return null;
  const amount = typeof raw === 'number' ? raw : parseNumber(raw);
  if (!amount || amount <= 0 || amount > 1e9) return null;
  // A currency label is only trusted if it is a real 3-letter code or a known symbol; anything else drops the price.
  const h = String(hintCurrency ?? '').trim();
  const hint = /^[A-Za-z]{3}$/.test(h) ? h.toUpperCase() : detectCurrency(h);
  const currency = (typeof raw === 'string' && detectCurrency(raw)) || hint;
  if (!currency) return null;
  return { amount: Math.round(amount * 100) / 100, currency };
}
