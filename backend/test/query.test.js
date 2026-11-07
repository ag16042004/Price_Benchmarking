import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startTestServer, officer, exactInput } from './helpers.js';
import { makeEngine } from './engineHelpers.js';

test('exact-match query flow (async, stub engine)', async (t) => {
  const { call, waitDone, close } = await startTestServer();
  t.after(close);
  const { body: { token } } = await call('/auth/register', { method: 'POST', body: officer });

  await t.test('requires authentication', async () => {
    assert.equal((await call('/query/exact-match', { method: 'POST', body: exactInput })).status, 401);
  });

  await t.test('invalid input returns 400 and persists nothing', async () => {
    const r = await call('/query/exact-match', { method: 'POST', token, body: { ...exactInput, make: '', itemType: 'Nonsense' } });
    assert.equal(r.status, 400);
    assert.ok(r.body.details.make && r.body.details.itemType);
    assert.equal((await call('/query/1', { token })).status, 404);
  });

  let queryId;
  await t.test('valid query is accepted (202) and completes with a clearly flagged mock result', async () => {
    const r = await call('/query/exact-match', { method: 'POST', token, body: exactInput });
    assert.equal(r.status, 202);
    assert.equal(r.body.status, 'PENDING');
    queryId = r.body.queryId;
    const done = await waitDone(queryId, token);
    assert.equal(done.body.status, 'COMPLETED');
    assert.equal(done.body.noDataFlag, false);
    const row = done.body.results[0];
    assert.ok(row.price && row.sourceUrl && row.vintage);
    assert.equal(row.isMock, true);
  });

  await t.test('no data is a COMPLETED-style 200 with noDataFlag, not an error', async () => {
    const r = await call('/query/exact-match', { method: 'POST', token, body: { ...exactInput, make: 'nodata' } });
    const done = await waitDone(r.body.queryId, token);
    assert.equal(done.status, 200);
    assert.equal(done.body.status, 'NO_DATA');
    assert.equal(done.body.noDataFlag, true);
    assert.deepEqual(done.body.results, []);
  });

  await t.test("another user cannot see someone else's query (404)", async () => {
    const other = await call('/auth/register', { method: 'POST', body: { ...officer, email: 'other@example.gov.in' } });
    assert.equal((await call(`/query/${queryId}`, { token: other.body.token })).status, 404);
  });

  await t.test('item types list is available to signed-in users', async () => {
    const r = await call('/meta/item-types', { token });
    assert.ok(r.body.some((x) => x.name === 'Antennas'));
  });
});

test('end to end with the REAL engine against offline fixtures', async (t) => {
  const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
  const routes = { 'https://www.dell.com/latitude-5430': { html: fx('dell-jsonld.html') }, 'https://digikey.in/p/5430': { html: fx('digikey-meta.html') } };
  const { engine } = makeEngine(routes, ['https://www.dell.com/latitude-5430', 'https://digikey.in/p/5430']);
  const { call, waitDone, close } = await startTestServer({ overrides: { scrapeEngine: engine } });
  t.after(close);
  const { body: { token } } = await call('/auth/register', { method: 'POST', body: officer });

  const r = await call('/query/exact-match', { method: 'POST', token, body: exactInput });
  const done = await waitDone(r.body.queryId, token);
  assert.equal(done.body.status, 'COMPLETED');
  assert.equal(done.body.results.length, 2);
  assert.ok(done.body.results.every((x) => !x.isMock && x.sourceUrl.startsWith('https://') && x.vintage && x.vintageBasis));
  const inr = done.body.results.find((x) => x.currency === 'INR');
  assert.equal(inr.formattedPrice, '₹76,999.00');
  assert.equal(inr.sourceName, 'Dell India');
});

test('engine failure surfaces as status FAILED, not a hang', async (t) => {
  const engine = { dispatchQuery: async () => { throw new Error('Search provider failed'); } };
  const { call, waitDone, close } = await startTestServer({ overrides: { scrapeEngine: engine } });
  t.after(close);
  const { body: { token } } = await call('/auth/register', { method: 'POST', body: officer });
  const r = await call('/query/exact-match', { method: 'POST', token, body: exactInput });
  assert.equal((await waitDone(r.body.queryId, token)).body.status, 'FAILED');
});
