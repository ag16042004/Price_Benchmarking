import test from 'node:test';
import assert from 'node:assert/strict';
import { SerperSearchProvider } from '../scrapers/search/SerperSearchProvider.js';
import { TavilySearchProvider } from '../scrapers/search/TavilySearchProvider.js';
import { buildScrapeEngine } from '../scrapers/buildEngine.js';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const recorder = (reply) => { const f = async (url, init) => { f.calls.push({ url, init, body: init.body && JSON.parse(init.body) }); return reply; }; f.calls = []; return f; };

test('serper: sends the key in X-API-KEY, limits sites with site: operators, maps the Google results', async () => {
  const fetchImpl = recorder(json({ organic: [{ link: 'https://ettus.com/b200mini', title: 'USRP B200mini', snippet: 'SDR' }] }));
  const p = new SerperSearchProvider({ apiKey: 'k123', fetchImpl });
  const out = await p.search('usrp b200mini price', { domains: ['ettus.com', 'pasternack.com'], count: 5 });
  const call = fetchImpl.calls[0];
  assert.equal(call.url, 'https://google.serper.dev/search');
  assert.equal(call.init.method, 'POST');
  assert.equal(call.init.headers['X-API-KEY'], 'k123');
  assert.match(call.body.q, /usrp b200mini price \(site:ettus\.com OR site:pasternack\.com\)/);
  assert.equal(call.body.num, 5);
  assert.deepEqual(out, [{ url: 'https://ettus.com/b200mini', title: 'USRP B200mini', snippet: 'SDR' }]);
});

test('tavily: sends the key as a Bearer token, limits sites with include_domains, maps the results', async () => {
  const fetchImpl = recorder(json({ results: [{ url: 'https://ettus.com/x', title: 'T', content: 'C', score: 0.9 }] }));
  const p = new TavilySearchProvider({ apiKey: 'tvly-abc', fetchImpl });
  const out = await p.search('hackrf one price', { domains: ['ettus.com'], count: 3 });
  const call = fetchImpl.calls[0];
  assert.equal(call.url, 'https://api.tavily.com/search');
  assert.equal(call.init.headers.Authorization, 'Bearer tvly-abc');
  assert.deepEqual(call.body.include_domains, ['ettus.com']);
  assert.equal(call.body.max_results, 3);
  assert.equal(call.body.query, 'hackrf one price');
  assert.deepEqual(out, [{ url: 'https://ettus.com/x', title: 'T', snippet: 'C' }]);
  const none = recorder(json({ results: [] }));
  await new TavilySearchProvider({ apiKey: 'k', fetchImpl: none }).search('q');
  assert.ok(!('include_domains' in none.calls[0].body), 'no domains means no include_domains field');
});

test('both providers fail loudly with the HTTP status (a bad key must not look like "no data")', async () => {
  await assert.rejects(() => new SerperSearchProvider({ apiKey: 'k', fetchImpl: recorder(json({}, 403)) }).search('q'), /Serper search failed: HTTP 403/);
  await assert.rejects(() => new TavilySearchProvider({ apiKey: 'k', fetchImpl: recorder(json({}, 401)) }).search('q'), /Tavily search failed: HTTP 401/);
  assert.throws(() => new SerperSearchProvider({}), /SERPER_API_KEY/);
  assert.throws(() => new TavilySearchProvider({}), /TAVILY_API_KEY/);
});

test('the engine picks the configured provider, and falls back to the flagged mock without a key', () => {
  const repo = { listActive: async () => [] };
  const kind = (env) => buildScrapeEngine({ NODE_ENV: 'test', ...env }, repo).constructor.name;
  assert.equal(kind({ SEARCH_PROVIDER: 'serper', SERPER_API_KEY: 'k' }), 'ScrapeEngine');
  assert.equal(kind({ SEARCH_PROVIDER: 'tavily', TAVILY_API_KEY: 'k' }), 'ScrapeEngine');
  assert.equal(kind({ SEARCH_PROVIDER: 'serper' }), 'StubScrapeEngine');
  assert.equal(kind({ SEARCH_PROVIDER: 'tavily' }), 'StubScrapeEngine');
});

import { SearxngProvider } from '../scrapers/search/SearxngProvider.js';
import { FallbackSearchProvider } from '../scrapers/search/FallbackSearchProvider.js';

test('searxng: every engine timing out is an ERROR with a fix, not an empty answer that reads as "no data"', async () => {
  const body = { query: 'hackrf one', results: [], unresponsive_engines: [['brave', 'timeout'], ['duckduckgo', 'timeout'], ['wikipedia', 'timeout']] };
  const p = new SearxngProvider({ baseUrl: 'http://localhost:8080', fetchImpl: async () => new Response(JSON.stringify(body), { status: 200 }) });
  await assert.rejects(() => p.search('hackrf one'), /none of its search engines answered \(brave: timeout, duckduckgo: timeout, wikipedia: timeout\)[\s\S]*RUN_GUIDE/);
  // a genuinely empty answer (no engine failed) is still just an empty list, and partial failures with results are fine
  assert.deepEqual(await new SearxngProvider({ baseUrl: 'http://x', fetchImpl: async () => new Response(JSON.stringify({ results: [] }), { status: 200 }) }).search('q'), []);
  const some = await new SearxngProvider({ baseUrl: 'http://x', fetchImpl: async () => new Response(JSON.stringify({ results: [{ url: 'https://a.example', title: 'A', content: 'c' }], unresponsive_engines: [['brave', 'timeout']] }), { status: 200 }) }).search('q');
  assert.equal(some.length, 1);
});

test('fallback: uses the first provider that answers; skips one that throws or returns nothing; reports a dead service as an error', async () => {
  const warn = [];
  const logger = { warn: (m) => warn.push(m) };
  const dead = { search: async () => { throw new Error('SearXNG timed out'); } };
  const empty = { search: async () => [] };
  const good = { search: async () => [{ url: 'https://shop.example/x', title: 'T', snippet: 'S' }], searchProducts: async () => [{ title: 'P', url: 'https://shop.example/p', merchant: 'M', price: '₹1' }] };

  assert.equal((await new FallbackSearchProvider([dead, good], logger).search('q')).length, 1);
  assert.equal((await new FallbackSearchProvider([empty, good], logger).search('q')).length, 1, 'an empty answer moves on to the next provider');
  assert.deepEqual(await new FallbackSearchProvider([empty, empty], logger).search('q'), [], 'nobody had anything: that is a real "no results"');
  await assert.rejects(() => new FallbackSearchProvider([dead, dead], logger).search('q'), /SearXNG timed out/);
  assert.ok(warn.some((m) => /SearXNG timed out/.test(m)));

  assert.equal(typeof new FallbackSearchProvider([dead, good], logger).searchProducts, 'function');
  assert.equal(new FallbackSearchProvider([dead, empty], logger).searchProducts, undefined, 'no shopping unless some provider offers it');
});

test('the engine builder accepts a list and skips providers that are not configured', () => {
  const repo = { listActive: async () => [] };
  const search = (env) => buildScrapeEngine({ NODE_ENV: 'test', ...env }, repo).search?.constructor.name;
  assert.equal(search({ SEARCH_PROVIDER: 'serper,searxng', SERPER_API_KEY: 'k', SEARXNG_URL: 'http://x' }), 'FallbackSearchProvider');
  assert.equal(search({ SEARCH_PROVIDER: 'serper,searxng', SEARXNG_URL: 'http://x' }), 'SearxngProvider', 'no Serper key yet: SearXNG alone');
  assert.equal(search({ SEARCH_PROVIDER: 'serper,searxng', SERPER_API_KEY: 'k' }), 'SerperSearchProvider');
  assert.equal(search({ SEARCH_PROVIDER: 'serper,searxng' }), undefined, 'nothing configured: the flagged mock engine');
});
