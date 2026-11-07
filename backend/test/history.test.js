import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, registerOfficer, exactInput, countingEngine } from './helpers.js';

test('query history and dashboard stats (FR-8)', async (t) => {
  const { call, waitDone, close } = await startTestServer({ overrides: { scrapeEngine: countingEngine() }, env: { CACHE: 'off' } });
  t.after(close);
  const me = await registerOfficer(call), other = await registerOfficer(call, 'other@example.gov.in');
  const post = async (path, body, who = me) => waitDone((await call(path, { method: 'POST', token: who.token, body })).body.queryId, who.token);

  await post('/query/exact-match', exactInput);
  await post('/query/exact-match', { ...exactInput, make: 'HP', model: 'ProBook 440' });
  await post('/query/specs', { itemName: 'Laptop', itemType: 'Computers & Accessories', specs: [{ key: 'RAM', value: '16 GB' }] });
  await post('/query/service', { serviceType: 'IT Support Services', location: 'Indore', description: 'x' });
  await post('/query/exact-match', { ...exactInput, make: 'Cisco', model: 'C9200' });
  await post('/query/exact-match', exactInput, other);

  await t.test('requires authentication and is not shadowed by /:id', async () => {
    assert.equal((await call('/query/history')).status, 401);
    assert.equal((await call('/query/history', { token: me.token })).status, 200);
  });

  await t.test('newest first, only my own, with readable summaries', async () => {
    const r = await call('/query/history', { token: me.token });
    assert.equal(r.body.total, 5);
    assert.deepEqual(r.body.items.map((x) => x.summary), ['Cisco C9200', 'IT Support Services in Indore', 'Laptop (1 specs)', 'HP ProBook 440', 'Dell Latitude 5430']);
    assert.equal(r.body.items[0].resultCount, 1);
    assert.equal((await call('/query/history', { token: other.token })).body.total, 1);
  });

  await t.test('pagination', async () => {
    const p2 = await call('/query/history?pageSize=2&page=2', { token: me.token });
    assert.deepEqual([p2.body.page, p2.body.pageSize, p2.body.total, p2.body.items.length], [2, 2, 5, 2]);
    const p3 = await call('/query/history?pageSize=2&page=3', { token: me.token });
    assert.equal(p3.body.items.length, 1);
  });

  await t.test('type filter and text search', async () => {
    assert.equal((await call('/query/history?type=SERVICE', { token: me.token })).body.total, 1);
    assert.equal((await call('/query/history?type=exact_match', { token: me.token })).body.total, 3);
    assert.deepEqual((await call('/query/history?search=probook', { token: me.token })).body.items.map((x) => x.summary), ['HP ProBook 440']);
    assert.equal((await call('/query/history?search=zzz', { token: me.token })).body.total, 0);
  });

  await t.test('junk parameters are clamped or rejected, never a 500', async () => {
    assert.equal((await call('/query/history?type=DROP', { token: me.token })).status, 400);
    const r = await call('/query/history?page=abc&pageSize=99999', { token: me.token });
    assert.equal(r.status, 200);
    assert.deepEqual([r.body.page, r.body.pageSize], [1, 50]);
    assert.equal((await call('/query/history?page=-5&pageSize=0', { token: me.token })).status, 200);
    assert.equal((await call('/query/history?search[]=a&search[]=b', { token: me.token })).status, 200);
  });

  await t.test('a past query re-opens with its stored results', async () => {
    const first = (await call('/query/history?pageSize=50', { token: me.token })).body.items.at(-1);
    const r = await call(`/query/${first.queryId}`, { token: me.token });
    assert.equal(r.body.query.make, 'Dell');
    assert.equal(r.body.results.length, 1);
  });

  await t.test('stats count honestly and list recent queries', async () => {
    const r = await call('/query/stats', { token: me.token });
    assert.deepEqual([r.body.total, r.body.completed, r.body.noData], [5, 5, 0]);
    assert.ok(r.body.activeSources > 10);
    assert.equal(r.body.recent.length, 5);
  });
});
