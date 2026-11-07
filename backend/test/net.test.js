import test from 'node:test';
import assert from 'node:assert/strict';
import { RobotsGuard } from '../scrapers/net/RobotsGuard.js';
import { DomainRateLimiter } from '../scrapers/net/DomainRateLimiter.js';

const resp = (body, status = 200) => async () => new Response(body, { status });

test('RobotsGuard: allows when robots.txt is missing (404), blocks disallowed paths', async () => {
  const none = new RobotsGuard({ userAgent: 'CASPERBot', fetchImpl: resp('', 404) });
  assert.equal(await none.isAllowed('https://a.com/p'), true);
  const rules = new RobotsGuard({ userAgent: 'CASPERBot', fetchImpl: resp('User-agent: *\nDisallow: /private') });
  assert.equal(await rules.isAllowed('https://a.com/private/x'), false);
  assert.equal(await rules.isAllowed('https://a.com/shop/x'), true);
});

test('RobotsGuard: unreadable robots.txt (5xx or network error) means do not scrape', async () => {
  assert.equal(await new RobotsGuard({ userAgent: 'x', fetchImpl: resp('', 503) }).isAllowed('https://a.com/p'), false);
  const boom = new RobotsGuard({ userAgent: 'x', fetchImpl: async () => { throw new Error('down'); } });
  assert.equal(await boom.isAllowed('https://a.com/p'), false);
});

test('RobotsGuard caches per origin', async () => {
  let calls = 0;
  const g = new RobotsGuard({ userAgent: 'x', fetchImpl: async () => { calls++; return new Response('', { status: 404 }); } });
  await g.isAllowed('https://a.com/1'); await g.isAllowed('https://a.com/2');
  assert.equal(calls, 1);
});

test('DomainRateLimiter spaces same-host requests and lets other hosts through', async () => {
  let t = 0; const sleeps = [];
  const rl = new DomainRateLimiter({ minIntervalMs: 1000, now: () => t, sleep: async (ms) => { sleeps.push(ms); t += ms; } });
  await Promise.all([rl.wait('a.com'), rl.wait('a.com'), rl.wait('a.com'), rl.wait('b.com')]);
  assert.deepEqual(sleeps, [1000, 1000]);   // a.com 2nd and 3rd waited; first a.com and b.com did not
});

// ---- scraper safety: redirects are checked before they are followed; page size is capped while downloading
import { fakeInternet } from './engineHelpers.js';
import { CheerioScraper } from '../scrapers/CheerioScraper.js';

const scraperFor = (routes, extra = {}) => {
  const fetchImpl = fakeInternet(routes);
  return { fetchImpl, scraper: new CheerioScraper({ userAgent: 'CASPERBot', fetchImpl, robots: new RobotsGuard({ userAgent: 'CASPERBot', fetchImpl }), limiter: new DomainRateLimiter({ minIntervalMs: 0 }), ...extra }) };
};

test('scraper: a redirect off the allow-list is refused BEFORE it is requested', async () => {
  const { scraper, fetchImpl } = scraperFor({ 'https://good.example/p': { redirectTo: 'http://169.254.169.254/latest/meta-data' } });
  await assert.rejects(() => scraper.scrape('https://good.example/p', { isAllowed: (u) => u.startsWith('https://good.example') }), (e) => e.reason === 'redirect');
  assert.ok(!fetchImpl.requested.some((u) => u.includes('169.254')), 'the internal address must never be fetched');
});

test('scraper: an allowed redirect is followed, a loop is stopped, and robots.txt applies to the new page', async () => {
  const ok = scraperFor({ 'https://good.example/a': { redirectTo: 'https://good.example/b' }, 'https://good.example/b': { html: '<html>hi</html>' } });
  const page = await ok.scraper.scrape('https://good.example/a', { isAllowed: () => true });
  assert.equal(page.finalUrl, 'https://good.example/b');

  const loop = scraperFor({ 'https://good.example/a': { redirectTo: 'https://good.example/a' } });
  await assert.rejects(() => loop.scraper.scrape('https://good.example/a'), (e) => e.reason === 'redirect' && /Too many/.test(e.message));

  const blocked = scraperFor({ 'https://good.example/a': { redirectTo: 'https://other.example/x' }, 'https://other.example/robots.txt': 'User-agent: *\nDisallow: /', 'https://other.example/x': { html: 'x' } });
  await assert.rejects(() => blocked.scraper.scrape('https://good.example/a'), (e) => e.reason === 'robots');
});

test('scraper: a page that declares itself too large is refused, and a streamed page stops at the cap', async () => {
  const big = scraperFor({ 'https://good.example/p': { html: 'x', headers: { 'content-length': '9000000' } } }, { maxBytes: 1000 });
  await assert.rejects(() => big.scraper.scrape('https://good.example/p'), (e) => e.reason === 'size');

  const html = '<html>' + 'a'.repeat(50_000) + '</html>';
  const capped = scraperFor({ 'https://good.example/q': { html } }, { maxBytes: 1000 });
  const page = await capped.scraper.scrape('https://good.example/q');
  assert.ok(page.html.length < 5000, `kept ${page.html.length} characters`);
});
