import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsePrice } from '../scrapers/extraction/priceParser.js';
import { extractListing } from '../scrapers/extraction/extractListing.js';
import { matchesExact } from '../scrapers/extraction/matcher.js';
import { dedupe } from '../scrapers/extraction/dedupe.js';

const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
const page = (n, extra = {}) => ({ html: fx(n), fetchedAt: '2026-10-06T10:00:00.000Z', ...extra });

test('parsePrice handles Indian, US, and European formats', () => {
  assert.deepEqual(parsePrice('₹ 1,23,456.00'), { amount: 123456, currency: 'INR' });
  assert.deepEqual(parsePrice('Rs. 76,999'), { amount: 76999, currency: 'INR' });
  assert.deepEqual(parsePrice('$1,299.50'), { amount: 1299.5, currency: 'USD' });
  assert.deepEqual(parsePrice('1.234,50', 'EUR'), { amount: 1234.5, currency: 'EUR' });
  assert.deepEqual(parsePrice('12,50', 'EUR'), { amount: 12.5, currency: 'EUR' });
  assert.deepEqual(parsePrice(76999, 'inr'), { amount: 76999, currency: 'INR' });
  assert.deepEqual(parsePrice('INR: 5,499.00'), { amount: 5499, currency: 'INR' });
  assert.deepEqual(parsePrice('Price: Rs. 1,299/-'), { amount: 1299, currency: 'INR' });
});

test('parsePrice rejects junk and never guesses a currency', () => {
  assert.equal(parsePrice('Call for price'), null);
  assert.equal(parsePrice('0'), null);
  assert.equal(parsePrice('1299'), null);            // no symbol and no hint
  assert.equal(parsePrice(null), null);
});

test('extractListing: JSON-LD (best signal) with page date', () => {
  const l = extractListing(page('dell-jsonld.html'));
  assert.equal(l.method, 'json-ld');
  assert.equal(l.price, 76999);
  assert.equal(l.currency, 'INR');
  assert.equal(l.vintageBasis, 'page');
  assert.match(l.vintage, /^2026-09-20/);
});

test('extractListing: meta tags, no page date -> falls back to Last-Modified then retrieval time', () => {
  const a = extractListing(page('digikey-meta.html', { lastModified: 'Mon, 01 Sep 2026 08:00:00 GMT' }));
  assert.equal(a.method, 'meta');
  assert.deepEqual([a.price, a.currency, a.vintageBasis], [1299, 'USD', 'header']);
  const b = extractListing(page('digikey-meta.html'));
  assert.equal(b.vintageBasis, 'retrieved');
  assert.equal(b.vintage, '2026-10-06T10:00:00.000Z');
});

test('extractListing: text fallback and no-price pages', () => {
  const t = extractListing(page('text-only.html'));
  assert.deepEqual([t.method, t.price, t.currency], ['text', 123456, 'INR']);
  assert.match(t.title, /Dell Latitude 5430/);
  assert.equal(extractListing(page('no-price.html')), null);
});

test('matchesExact needs whole make and model tokens (5430 is not 5430i)', () => {
  const q = { make: 'Dell', model: 'Latitude 5430' };
  assert.equal(matchesExact({ title: 'Dell Latitude 5430 Laptop' }, q).matches, true);
  assert.equal(matchesExact({ title: 'Dell Latitude 5430i Laptop' }, q).matches, false);
  assert.equal(matchesExact({ title: 'Dell Latitude 7430' }, q).matches, false);
  assert.equal(matchesExact({ title: 'Latitude 5430', url: 'https://www.dell.com/p' }, q).matches, true); // make from URL
  assert.equal(matchesExact({ title: 'HP Latitude 5430' }, q).matches, false);
});

test('dedupe removes repeat URLs (ignoring query strings) and caps per host', () => {
  const r = (u, price) => ({ sourceUrl: u, price, currency: 'INR', itemDetails: u });
  const out = dedupe([r('https://a.com/p?utm=1', 1), r('https://a.com/p?utm=2', 1), r('https://a.com/q', 2), r('https://a.com/r', 3), r('https://a.com/s', 4)], { perDomain: 3 });
  assert.deepEqual(out.map((x) => x.sourceUrl), ['https://a.com/p?utm=1', 'https://a.com/q', 'https://a.com/r']);
});
