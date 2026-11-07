import * as cheerio from 'cheerio';
import * as chrono from 'chrono-node';
import { parsePrice } from './priceParser.js';

const asArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

function jsonLdNodes($) {
  const out = [];
  const walk = (n) => {
    if (Array.isArray(n)) n.forEach(walk);
    else if (n && typeof n === 'object') { out.push(n); if (n['@graph']) walk(n['@graph']); }
  };
  $('script[type="application/ld+json"]').each((_, el) => {
    try { walk(JSON.parse($(el).contents().text())); } catch { /* malformed JSON-LD is common; ignore */ }
  });
  return out;
}

function fromJsonLd($) {
  for (const n of jsonLdNodes($)) {
    if (!asArray(n['@type']).some((t) => t === 'Product' || t === 'Service')) continue;
    const offers = asArray(n.offers).flatMap((o) => (o?.offers ? asArray(o.offers).concat(o) : [o]));
    for (const o of offers) {
      const spec = o?.priceSpecification || {};
      const p = parsePrice(o?.price ?? o?.lowPrice ?? spec.price, o?.priceCurrency ?? spec.priceCurrency);
      if (p) return { title: n.name, ...p, dateStr: n.dateModified || o.dateModified || n.datePublished, method: 'json-ld' };
    }
  }
  return null;
}

const meta = ($, sel) => $(sel).first().attr('content');

function fromMeta($) {
  const amount = meta($, 'meta[property="product:price:amount"]') ?? meta($, 'meta[property="og:price:amount"]')
    ?? $('[itemprop="price"]').first().attr('content') ?? $('[itemprop="price"]').first().text();
  const cur = meta($, 'meta[property="product:price:currency"]') ?? meta($, 'meta[property="og:price:currency"]')
    ?? $('[itemprop="priceCurrency"]').first().attr('content');
  const p = parsePrice(amount?.trim(), cur);
  return p ? { ...p, method: 'meta' } : null;
}

const SYMBOL_PRICE = /(?:₹|Rs\.?|INR|US\$|\$|USD|€|EUR|£|GBP)\s*\d[\d,]*(?:\.\d{1,2})?/;

/** Lowest-confidence fallback: first currency-marked amount inside an element whose class/id says "price". */
function fromText($) {
  let found = null;
  $('[class],[id]').each((_, el) => {
    if (found) return;
    if (!/price/i.test(`${el.attribs.class || ''} ${el.attribs.id || ''}`)) return;
    const m = $(el).text().replace(/\s+/g, ' ').match(SYMBOL_PRICE);
    const p = m && parsePrice(m[0]);
    if (p) found = { ...p, method: 'text' };
  });
  return found;
}

/**
 * Accepts ISO, RFC 2822 (Last-Modified), "20 Sep 2026", "Sept 2026", "20th September 2026".
 * Slash/dash dates like 12/09/2026 are read DAY-first (Indian convention), not US month-first.
 * Future dates and anything before 2000 are rejected.
 */
function toDate(s) {
  if (!s) return null;
  const str = String(s).trim();
  let date = null;
  if (/^\d{4}-\d{2}-\d{2}/.test(str) || /\b(GMT|UTC)\b|Z$/.test(str)) {
    const d = new Date(str);
    if (!Number.isNaN(d.getTime())) date = d;
  }
  if (!date) date = chrono.en.GB.parseDate(str);
  if (!date) { const d = new Date(str); if (!Number.isNaN(d.getTime())) date = d; }
  if (!date || date.getFullYear() < 2000 || date.getTime() > Date.now() + 86_400_000) return null;
  return date;
}

const iso = (d, basis) => ({ vintage: d.toISOString(), vintageBasis: basis });

function attributeDate(found, $) {
  const candidates = [found.dateStr, meta($, 'meta[property="article:modified_time"]'), meta($, 'meta[property="og:updated_time"]'),
    meta($, 'meta[itemprop="dateModified"]'), $('[itemprop="dateModified"]').first().attr('content'),
    $('time[itemprop="dateModified"]').first().attr('datetime')];
  for (const c of candidates) { const d = toDate(c); if (d) return iso(d, 'page'); }
  return null;
}

const UPDATED_TEXT = /(?:last\s+(?:updated|modified|revised)|updated\s+on|price\s+(?:as\s+of|updated)|as\s+of)\s*[:-]?\s*([0-9A-Za-z ,./-]{6,26})/i;

function textDate(text) {
  const m = text.match(UPDATED_TEXT);
  const d = m && toDate(m[1].trim());
  return d ? iso(d, 'page') : null;
}

function headerDate(page) {
  const d = toDate(page.lastModified);
  return d ? iso(d, 'header') : null;
}

// A live product page shows today's price, so retrieval time is the honest date; the basis says so.
const retrieved = (page) => ({ vintage: page.fetchedAt || new Date().toISOString(), vintageBasis: 'retrieved' });

/** Explainable extraction: JSON-LD, then meta tags, then labelled text. Returns null if no price is found. */
export function extractListing(page) {
  const $ = cheerio.load(page.html);
  const found = fromJsonLd($) || fromMeta($) || fromText($);
  if (!found) return null;
  const title = (found.title || meta($, 'meta[property="og:title"]') || $('h1').first().text() || $('title').first().text() || '')
    .replace(/\s+/g, ' ').trim();
  const attrDated = attributeDate(found, $);

  $('script,style,noscript,svg').remove();           // after everything that needs them
  $('body *').after(' ');                            // cheerio .text() glues neighbouring cells ("DDR4Storage"); keep them apart
  const text = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 30_000);

  const dated = attrDated || textDate(text) || headerDate(page) || retrieved(page);
  return { title, text, price: found.amount, currency: found.currency, method: found.method, ...dated };
}
