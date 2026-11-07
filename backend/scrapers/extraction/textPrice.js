import * as chrono from 'chrono-node';
import { parseNumber } from './priceParser.js';

/**
 * Reads prices out of free text: a search result's title and snippet, or a shopping listing.
 * Search engines often print the price right in the result ("HackRF One - Rs. 29,999.00 - In stock"),
 * which makes a page visit unnecessary (and sidesteps sites that refuse robots or draw prices with JavaScript).
 */
const SYMBOL_FIRST = /(US\$|₹|Rs\.?|INR|USD|\$|€|EUR|£|GBP)\s?(\d[\d,]*(?:\.\d{1,2})?)(?:\s?(lakhs?|crores?)\b)?/gi;
const SYMBOL_AFTER = /(\d[\d,]*(?:\.\d{1,2})?)\s?(INR|Rs\.?|USD|EUR|GBP)(?![a-z])/gi;

const CODE = { '₹': 'INR', rs: 'INR', inr: 'INR', 'us$': 'USD', $: 'USD', usd: 'USD', '€': 'EUR', eur: 'EUR', '£': 'GBP', gbp: 'GBP' };
const currencyOf = (sym) => CODE[sym.toLowerCase().replace(/\.$/, '')] || null;

// "Save Rs. 500", "EMI from Rs. 1,200", "Free shipping above $50": amounts that are not the price of the item.
const NOISE_BEFORE = /\b(save|saves|saving|savings|off|emi|cashback|cash back|discount|shipping|delivery|extra|coupon|reward|rebate|deposit|refund|above|over|minimum|min)\b[^\d₹$€£]{0,14}$/i;
const NOISE_AFTER = /^\s*(off\b|emi\b|cashback|\/\s*(mo|month)\b|per month|a month|\/\s*mo\b)/i;

/** Every plausible price in `text`, in reading order: [{ amount, currency, index }]. */
export function pricesInText(text) {
  const s = String(text || '').replace(/\s+/g, ' ');
  const found = [];
  const add = (amountText, sym, index, length, unit) => {
    let amount = parseNumber(amountText);
    const currency = currencyOf(sym);
    if (!amount || !currency) return;
    if (unit) amount *= /^lakh/i.test(unit) ? 100_000 : 10_000_000;
    if (amount < 1 || amount > 1e9) return;
    if (NOISE_BEFORE.test(s.slice(Math.max(0, index - 24), index))) return;
    if (NOISE_AFTER.test(s.slice(index + length, index + length + 14))) return;
    found.push({ amount: Math.round(amount * 100) / 100, currency, index });
  };
  for (const m of s.matchAll(SYMBOL_FIRST)) add(m[2], m[1], m.index, m[0].length, m[3]);
  for (const m of s.matchAll(SYMBOL_AFTER)) add(m[1], m[2], m.index, m[0].length);
  return found.sort((a, b) => a.index - b.index);
}

/** The first plausible price, or null. */
export const bestPrice = (text) => pricesInText(text)[0] ?? null;

/** Google-style snippets start with the listing date ("12 Sep 2026 — ..." or "3 days ago"). Only a date at the very start is trusted. */
export function leadingDate(snippet, now = new Date()) {
  const head = String(snippet || '').trim().slice(0, 34);
  if (!/^(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}|[A-Za-z]{3,9}\s+\d{1,2},\s+\d{4}|\d+\s+(hour|day|week|month)s?\s+ago)/i.test(head)) return null;
  const hit = chrono.parse(head, now)[0];
  const d = hit?.start.date();
  return d && d <= now && d.getFullYear() >= 2000 ? d : null;
}
