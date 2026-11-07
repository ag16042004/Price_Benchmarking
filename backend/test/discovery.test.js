// The discovery rewrite: prices are read from search listings and shopping data, not only from pages shops may refuse to serve.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ScrapeEngine } from '../scrapers/ScrapeEngine.js';
import { CheerioScraper } from '../scrapers/CheerioScraper.js';
import { RobotsGuard } from '../scrapers/net/RobotsGuard.js';
import { DomainRateLimiter } from '../scrapers/net/DomainRateLimiter.js';
import { SearxngProvider } from '../scrapers/search/SearxngProvider.js';
import { SerperSearchProvider } from '../scrapers/search/SerperSearchProvider.js';
import { SourceRepository } from '../services/SourceRepository.js';
import { createMemoryRepos } from '../database/repositories/memoryRepos.js';
import { ResultItem } from '../models/ResultItem.js';
import { dedupe } from '../scrapers/extraction/dedupe.js';
import { pricesInText, bestPrice, leadingDate } from '../scrapers/extraction/textPrice.js';
import { fakeInternet } from './engineHelpers.js';

const HACKRF = { queryType: 'EXACT_MATCH', itemType: 'Communication Equipment', itemName: 'Software Defined Radio', make: 'Great Scott Gadgets', model: 'HackRF One' };

/** An engine whose "internet" refuses every page (HTTP 403), like the shops in the user's log, so only listing data can succeed. */
function engineWith(searchProvider, { routes = {}, allowUnlisted = true } = {}) {
  const fetchImpl = fakeInternet(routes);
  const scraper = new CheerioScraper({ userAgent: 'CASPERBot', fetchImpl, robots: new RobotsGuard({ userAgent: 'CASPERBot', fetchImpl }), limiter: new DomainRateLimiter({ minIntervalMs: 0 }) });
  const sourceRepository = new SourceRepository({ sourceDataRepo: createMemoryRepos().sourceDataRepo });
  return { engine: new ScrapeEngine({ searchProvider, scraper, sourceRepository, logger: { warn() {}, info() {} }, allowUnlisted }), requested: fetchImpl.requested };
}
const searchOf = (hits, extra = {}) => ({ search: async () => hits, ...extra });

test('price reader: takes the real price, ignores savings, EMI, shipping thresholds and cashback', () => {
  assert.deepEqual(bestPrice('HackRF One - ₹ 29,999.00 - In stock. Free shipping above ₹999'), { amount: 29999, currency: 'INR', index: 13 });
  assert.equal(bestPrice('Dell Latitude 5430 | Save ₹5,000 | Price: ₹76,999 | EMI from ₹3,200/month').amount, 76999);
  assert.equal(bestPrice('Buy HackRF One Rs. 24,500 only').amount, 24500);
  assert.equal(bestPrice('Price 1,299 INR inclusive of tax').amount, 1299);
  assert.deepEqual([bestPrice('USRP B200mini from $1,499.00').currency, bestPrice('€ 120').currency], ['USD', 'EUR']);
  assert.equal(bestPrice('AMC starting at ₹ 1.5 lakh per year').amount, 150000);
  assert.equal(bestPrice('Cashback of Rs. 500 on this item'), null);
  assert.equal(bestPrice('No price here, call us'), null);
  assert.equal(pricesInText('₹ 0').length, 0);
});

test('price reader: only a date at the very start of a snippet is trusted', () => {
  const now = new Date('2026-10-28T00:00:00Z');
  assert.equal(leadingDate('12 Sep 2026 — HackRF One for sale', now).getUTCMonth(), 8);
  assert.equal(leadingDate('Great price, last updated 2019', now), null);
  assert.equal(leadingDate('3 days ago — new stock', now).getUTCDate(), 25);
});

test('listing path: a priced search result is enough, even when every shop page would be refused', async () => {
  const hits = [
    { url: 'https://www.digikey.in/en/products/detail/hackrf-one', title: 'HackRF One | Great Scott Gadgets', snippet: '12 Sep 2026 — HackRF One software defined radio. Price ₹ 31,500.00. In stock.' },
    { url: 'https://shop.unknown.example/hackrf-one', title: 'HackRF One SDR', snippet: 'Buy now Rs. 24,500. Great Scott Gadgets 1 MHz to 6 GHz.' },
    { url: 'https://shop.unknown.example/hackrf-pro', title: 'HackRF Pro', snippet: 'Price ₹ 49,000' },                              // different model: never accepted
    { url: 'https://shop.unknown.example/hackrf-one-case', title: 'HackRF One case', snippet: 'Save ₹500. Cashback ₹100' },                // matches the name, but no real price
    { url: 'https://www.pasternack.com/blocked', title: 'RF cable', snippet: 'Coax cable' },                                              // approved site, no price: a page visit, which is refused
  ];
  const { engine } = engineWith(searchOf(hits), { routes: { 'https://www.pasternack.com/blocked': { status: 403 } } });
  const trace = {};
  const out = await engine.dispatchQuery(HACKRF, { trace });

  assert.deepEqual(out.map((r) => r.price).sort((a, b) => a - b), [24500, 31500]);
  assert.ok(out.every((r) => r.vintageBasis === 'listing' && r.isMock === false));
  const approved = out.find((r) => r.sourceUrl.includes('digikey'));
  assert.ok(approved.sourceId, 'a source on the approved list keeps its id');
  assert.equal(new Date(approved.vintage).toISOString().slice(0, 10), '2026-09-12', 'the listing date at the start of the snippet is used');
  assert.equal(out.find((r) => r.sourceUrl.includes('unknown.example')).sourceId, null);
  assert.equal(trace.pages[0].outcome, 'skipped: HTTP 403');
  assert.equal(out.diagnosis.refused, 1);
  assert.equal(out.diagnosis.fromListings, 2);
});

test('unlisted sources are flagged in the result, and can be switched off', async () => {
  const hits = [{ url: 'https://shop.unknown.example/hackrf-one', title: 'HackRF One', snippet: 'Great Scott Gadgets. ₹ 24,500' }];
  const on = await engineWith(searchOf(hits)).engine.dispatchQuery(HACKRF);
  assert.equal(new ResultItem(on[0]).toJSON().unlisted, true);
  const off = await engineWith(searchOf(hits), { allowUnlisted: false }).engine.dispatchQuery(HACKRF);
  assert.equal(off.length, 0);
  assert.equal(new ResultItem({ price: 1, sourceUrl: 'https://x.example', vintageBasis: 'curated' }).toJSON().unlisted, false, 'curated rates are admin-entered');
  assert.equal(new ResultItem({ price: 1, sourceUrl: 'https://x.example', isMock: true }).toJSON().unlisted, false, 'sample rows are exempt');
});

test('shopping path: structured merchant + price; the title must still be the exact item', async () => {
  const shopping = [
    { title: 'HackRF One Software Defined Radio', url: 'https://www.google.com/shopping/product/1', merchant: 'Robu.in', price: '₹23,999.00' },
    { title: 'HackRF One Software Defined Radio', url: 'https://www.google.com/shopping/product/1', merchant: 'ThinkRobotics', price: '₹25,499.00' },
    { title: 'HackRF Pro', url: 'https://www.google.com/shopping/product/2', merchant: 'Robu.in', price: '₹49,000.00' },
    { title: 'HackRF One', url: 'https://www.google.com/shopping/product/3', merchant: 'NoPriceShop', price: 'Call for price' },
  ];
  const { engine } = engineWith({ search: async () => [], searchProducts: async () => shopping });
  const out = await engine.dispatchQuery(HACKRF);
  assert.deepEqual(out.map((r) => [r.sourceName, r.price]).sort(), [['Robu.in', 23999], ['ThinkRobotics', 25499]], 'two merchants behind one Google link both survive');
  assert.equal(out.diagnosis.shopping, 4);
});

test('a listing that omits the maker is still accepted for a distinctive model, at a lower match score', async () => {
  const hits = [{ url: 'https://shop.unknown.example/hackrf-one', title: 'HackRF One Software Defined Radio', snippet: 'Buy online. ₹ 24,500' }];
  const out = await engineWith(searchOf(hits)).engine.dispatchQuery(HACKRF);
  assert.equal(out.length, 1);
  assert.equal(out[0].matchScore, 0.7);
  // ...but a bare model number is not distinctive enough to stand without the maker
  const weak = [{ url: 'https://shop.unknown.example/5430', title: 'Part 5430 adapter', snippet: '₹ 500' }];
  const none = await engineWith(searchOf(weak)).engine.dispatchQuery({ queryType: 'EXACT_MATCH', itemType: 'Computers & Accessories', make: 'Dell', model: '5430' });
  assert.equal(none.length, 0);
});

test('service queries need the service wording AND the city in the listing', async () => {
  const hits = [
    { url: 'https://amc.example/indore', title: 'Computer AMC and IT support services in Indore', snippet: 'Annual maintenance from ₹ 2,400 per system per year' },
    { url: 'https://amc.example/pune', title: 'IT support services in Pune', snippet: '₹ 2,100 per month' },
    { url: 'https://amc.example/noprice', title: 'IT support services Indore', snippet: 'Call us for a quote' },
  ];
  const { engine } = engineWith(searchOf(hits));
  const out = await engine.dispatchQuery({ queryType: 'SERVICE', serviceType: 'IT Support Services', location: 'Indore, Madhya Pradesh', description: 'x' });
  assert.deepEqual(out.map((r) => r.sourceUrl), ['https://amc.example/indore']);
});

test('works end to end through SearXNG-shaped JSON, the way the real server answers', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ results: [
    { url: 'https://robu.in/product/hackrf-one/', title: 'HackRF One - Robu.in', content: 'HackRF One SDR by Great Scott Gadgets. Rs. 23,999 inclusive of GST.' },
    { url: 'https://www.digikey.in/en/products/detail/great-scott-gadgets/hackrf-one/5762395', title: 'HackRF One | Great Scott Gadgets | DigiKey India', content: 'Price ₹ 28,240.00 In stock' },
  ] }), { status: 200, headers: { 'content-type': 'application/json' } });
  const { engine, requested } = engineWith(new SearxngProvider({ baseUrl: 'http://localhost:8080', fetchImpl }));
  const out = await engine.dispatchQuery(HACKRF);
  assert.equal(out.length, 2);
  assert.deepEqual(out.map((r) => r.price).sort((a, b) => a - b), [23999, 28240]);
  assert.equal(requested.length, 0, 'no shop page was visited: nothing for a shop to refuse');
});

test('if every search call fails it is an error, never "no data"', async () => {
  const { engine } = engineWith({ search: async () => { throw new Error('boom'); } });
  await assert.rejects(() => engine.dispatchQuery(HACKRF), /Search provider failed/);
});

test('dedupe: merchants behind one Google shopping host are separate rows, repeated rows are still dropped', () => {
  const row = (name, price) => ({ sourceUrl: 'https://www.google.com/shopping/product/9', sourceName: name, price, currency: 'INR', itemDetails: 'HackRF One' });
  const out = dedupe([row('A', 1), row('B', 2), row('A', 1), row('C', 3), row('D', 4), row('E', 5)], { perDomain: 4 });
  assert.deepEqual(out.map((r) => r.sourceName), ['A', 'B', 'C', 'D', 'E']);
});

test('serper: shopping request asks Google India and maps merchant, link and price', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, body: JSON.parse(init.body), key: init.headers['X-API-KEY'] }); return new Response(JSON.stringify({ shopping: [{ title: 'HackRF One', source: 'Robu.in', link: 'https://robu.in/x', price: '₹23,999.00' }] }), { status: 200 }); };
  const p = new SerperSearchProvider({ apiKey: 'k', fetchImpl });
  const out = await p.searchProducts('hackrf one price', { count: 10 });
  assert.equal(calls[0].url, 'https://google.serper.dev/shopping');
  assert.deepEqual([calls[0].body.q, calls[0].body.gl, calls[0].key], ['hackrf one price', 'in', 'k']);
  assert.deepEqual(out, [{ title: 'HackRF One', url: 'https://robu.in/x', merchant: 'Robu.in', price: '₹23,999.00' }]);
  await assert.rejects(() => new SerperSearchProvider({ apiKey: 'k', fetchImpl: async () => new Response('{}', { status: 403 }) }).searchProducts('q'), /Serper shopping failed: HTTP 403/);
});
