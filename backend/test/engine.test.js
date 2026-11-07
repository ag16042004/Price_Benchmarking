import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeEngine } from './engineHelpers.js';

const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
const query = { make: 'Dell', model: 'Latitude 5430', itemType: 'Computers & Accessories' };

test('engine: fork/join survives failures, enforces allow-list/robots/redirects, drops wrong products', async () => {
  const logs = [];
  const routes = {
    'https://www.dell.com/latitude-5430': { html: fx('dell-jsonld.html') },
    'https://www.dell.com/latitude-5430?utm=dup': { html: fx('dell-jsonld.html') },     // duplicate of the above
    'https://www.dell.com/latitude-5430i': { html: fx('wrong-model.html') },            // wrong product
    'https://digikey.in/p/5430': { html: fx('digikey-meta.html') },
    'https://www.hp.com/p': { throws: 'ECONNRESET' },                                   // network failure
    'https://www.lenovo.com/p': { html: fx('dell-jsonld.html') },
    'https://www.lenovo.com/robots.txt': 'User-agent: *\nDisallow: /',                  // robots block
    'https://robu.in/p': { redirectTo: 'https://evil.example.com/x' },                 // redirect off the list
    'https://www.pasternack.com/p': { html: fx('no-price.html') },                      // no price
  };
  const candidates = [
    'https://www.dell.com/latitude-5430', 'https://www.dell.com/latitude-5430?utm=dup', 'https://www.dell.com/latitude-5430i',
    'https://digikey.in/p/5430', 'https://www.hp.com/p', 'https://www.lenovo.com/p', 'https://robu.in/p',
    'https://www.pasternack.com/p',
    'https://www.amazon.in/dp/1',          // known source but INACTIVE
    'https://evil.example.com/p',          // not on the list at all
  ];
  const { engine, requested } = makeEngine(routes, candidates, logs, { perDomain: 5 });

  const results = await engine.dispatchQuery(query);

  assert.deepEqual(results.map((r) => r.sourceName).sort(), ['Dell India', 'DigiKey India']);
  const dell = results.find((r) => r.sourceName === 'Dell India');
  assert.deepEqual([dell.price, dell.currency, dell.vintageBasis, dell.isMock], [76999, 'INR', 'page', false]);
  assert.ok(dell.sourceId);
  // failures were logged, not thrown (NFR-4)
  assert.ok(logs.some((l) => l.includes('hp.com') && l.includes('ECONNRESET')));
  assert.ok(logs.some((l) => l.includes('lenovo.com') && l.includes('robots')));
  assert.ok(logs.some((l) => l.includes('robu.in') && l.includes('allow-list')));
  assert.ok(!results.some((r) => /amazon|evil/.test(r.sourceUrl)));
  assert.ok(!requested.some((u) => u.includes('evil.example.com')), 'the redirect target must never be requested');
});

test('engine: nothing found -> empty array (the caller turns this into noDataFlag)', async () => {
  const { engine } = makeEngine({}, []);
  assert.deepEqual(await engine.dispatchQuery(query), []);
});

test('engine: discovery failure throws (distinct from "no data")', async () => {
  const { engine, search } = makeEngine({}, []);
  search.search = async () => { throw new Error('HTTP 401'); };
  await assert.rejects(() => engine.dispatchQuery(query), /Search provider failed/);
});

test('engine: partial discovery failure still returns results from the other search', async () => {
  const routes = { 'https://www.dell.com/latitude-5430': { html: fx('dell-jsonld.html') } };
  const { engine, search } = makeEngine(routes, ['https://www.dell.com/latitude-5430']);
  const ok = search.search.bind(search); let n = 0;
  search.search = async (...a) => { if (n++ === 0) throw new Error('rate limited'); return ok(...a); };
  assert.equal((await engine.dispatchQuery(query)).length, 1);
});

test('engine: bounded API cost: one open web search plus at most two searches limited to at most 8 approved sites each', async () => {
  const { engine, search } = makeEngine({}, []);
  await engine.dispatchQuery(query);
  assert.ok(search.calls.length <= 3);   // 1 web search + at most 2 site groups
  assert.ok(search.calls.every((c) => (c.domains || []).length <= 8));
  assert.match(search.calls[0].text, /Dell Latitude 5430 price/);
});

test('engine: reports WHERE candidates dropped out (the trace behind "No reliable data found")', async () => {
  const routes = {
    'https://www.dell.com/latitude-5430': { html: fx('dell-jsonld.html') },
    'https://www.pasternack.com/blank': { html: '<html><body>Nothing to see</body></html>' },
    'https://digikey.in/boom': { status: 500 },
  };
  const candidates = ['https://www.dell.com/latitude-5430', 'https://www.pasternack.com/blank', 'https://digikey.in/boom', 'https://not-approved.example/x'];
  const { engine } = makeEngine(routes, candidates, [], { perDomain: 5 });
  const trace = {};
  await engine.dispatchQuery({ queryType: 'EXACT_MATCH', itemType: 'Computers & Accessories', make: 'Dell', model: 'Latitude 5430' }, { trace });
  assert.ok(trace.hits >= 4);                                   // the fake search answers each search group with the same list
  assert.equal(trace.picked, 3);
  assert.deepEqual([...new Set(trace.dropped.map((d) => d.url))], ['https://not-approved.example/x']);
  const outcome = (u) => trace.pages.find((p) => p.url === u).outcome;
  assert.equal(outcome('https://www.dell.com/latitude-5430'), 'matched');
  assert.match(outcome('https://www.pasternack.com/blank'), /no price recognised/);
  assert.match(outcome('https://digikey.in/boom'), /skipped: HTTP 500/);
});

test('engine: the diagnosis counts sites that refuse automated access (HTTP 403) separately', async () => {
  const routes = { 'https://www.dell.com/a': { status: 403 }, 'https://digikey.in/b': { status: 403 }, 'https://www.pasternack.com/c': { html: '<html><body>nothing</body></html>' } };
  const { engine } = makeEngine(routes, ['https://www.dell.com/a', 'https://digikey.in/b', 'https://www.pasternack.com/c'], [], { perDomain: 5 });
  const results = await engine.dispatchQuery({ queryType: 'EXACT_MATCH', itemType: 'Computers & Accessories', make: 'Dell', model: 'X1' });
  assert.equal(results.length, 0);
  assert.equal(results.diagnosis.refused, 2);
  assert.deepEqual(results.diagnosis.refusedSites.sort(), ['dell.com', 'digikey.in']);
  assert.equal(results.diagnosis.opened, 1);
  assert.equal(JSON.stringify(results), '[]', 'the diagnosis never leaks into the results themselves');
});
