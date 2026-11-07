import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryCache } from '../cache/MemoryCache.js';
import { RedisCache } from '../cache/RedisCache.js';
import { fingerprint } from '../services/queryFingerprint.js';
import { startTestServer, registerOfficer, exactInput, countingEngine } from './helpers.js';

test('MemoryCache expires entries after the TTL', async () => {
  let t = 0;
  const c = new MemoryCache({ now: () => t });
  await c.set('k', { a: 1 }, 10);
  assert.deepEqual(await c.get('k'), { a: 1 });
  t = 9_999; assert.ok(await c.get('k'));
  t = 10_000; assert.equal(await c.get('k'), null);
  await c.set('x', 1, 10); await c.clear();
  assert.equal(await c.get('x'), null);
});

test('RedisCache set/get/expire/clear', { skip: process.env.REDIS_URL ? false : 'set REDIS_URL to run Redis tests' }, async () => {
  const c = new RedisCache({ redisUrl: process.env.REDIS_URL, prefix: `casper:test:${Date.now()}:` });
  await c.set('a', { n: 1 }, 1); await c.set('b', { n: 2 }, 60);
  assert.deepEqual(await c.get('a'), { n: 1 });
  await new Promise((r) => setTimeout(r, 1200));
  assert.equal(await c.get('a'), null);
  await c.clear();
  assert.equal(await c.get('b'), null);
  await c.close();
});

test('fingerprint ignores case, spacing, spec order, and fields the search never uses', () => {
  const a = fingerprint({ queryType: 'EXACT_MATCH', itemType: 'Antennas', make: 'Dell', model: 'Latitude  5430', itemName: 'one' });
  const b = fingerprint({ queryType: 'EXACT_MATCH', itemType: 'antennas', make: ' dell ', model: 'latitude 5430', itemName: 'two' });
  assert.equal(a, b);
  const s1 = fingerprint({ queryType: 'SPECIFICATION', itemName: 'L', itemType: 'T', specifications: [{ key: 'RAM', value: '16 GB' }, { key: 'SSD', value: '512' }] });
  const s2 = fingerprint({ queryType: 'SPECIFICATION', itemName: 'l', itemType: 'T', specifications: [{ key: 'ssd', value: '512' }, { key: 'ram', value: '16 gb' }] });
  assert.equal(s1, s2);
  const v1 = fingerprint({ queryType: 'SERVICE', serviceType: 'X', location: 'Indore, MP', description: 'a' });
  assert.equal(v1, fingerprint({ queryType: 'SERVICE', serviceType: 'x', location: 'indore', description: 'b' }));
  assert.notEqual(a, fingerprint({ queryType: 'EXACT_MATCH', itemType: 'Antennas', make: 'Dell', model: '7430' }));
});

test('cache-hit path (Redis-style caching of repeat queries)', async (t) => {
  const engine = countingEngine();
  const { call, waitDone, close } = await startTestServer({ overrides: { scrapeEngine: engine } });
  t.after(close);
  const me = await registerOfficer(call), other = await registerOfficer(call, 'other@example.gov.in');
  const submit = (body, who = me) => call('/query/exact-match', { method: 'POST', token: who.token, body });

  let firstId;
  await t.test('first query runs the engine', async () => {
    const r = await submit(exactInput);
    assert.equal(r.status, 202);
    firstId = r.body.queryId;
    assert.equal((await waitDone(firstId, me.token)).body.fromCache, false);
    assert.equal(engine.calls, 1);
  });

  await t.test('same query again (different case and spacing) is answered from cache: 200, no job, no engine call', async () => {
    const r = await submit({ ...exactInput, make: '  DELL ', model: 'latitude   5430', itemName: 'something else' });
    assert.equal(r.status, 200);
    assert.deepEqual([r.body.status, r.body.fromCache], ['COMPLETED', true]);
    assert.equal(engine.calls, 1);
    const g = await call(`/query/${r.body.queryId}`, { token: me.token });
    assert.deepEqual([g.body.fromCache, g.body.results.length, g.body.results[0].price], [true, 1, 1000]);
    assert.notEqual(r.body.queryId, firstId);                       // still its own history entry
  });

  await t.test('another officer benefits from the cache too', async () => {
    assert.equal((await submit(exactInput, other)).body.fromCache, true);
    assert.equal(engine.calls, 1);
  });

  await t.test('refresh:true bypasses the cache and re-runs the engine', async () => {
    const r = await submit({ ...exactInput, refresh: true });
    assert.equal(r.status, 202);
    assert.equal((await waitDone(r.body.queryId, me.token)).body.fromCache, false);
    assert.equal(engine.calls, 2);
  });

  await t.test('a different model is a different cache entry', async () => {
    const r = await submit({ ...exactInput, model: 'Latitude 7430' });
    assert.equal(r.status, 202);
  });

  await t.test('"no data" answers are cached too and stay "no data"', async () => {
    engine.dispatchQuery = async () => { engine.calls++; return []; };
    const first = await waitDone((await submit({ ...exactInput, model: 'Ghost 1' })).body.queryId, me.token);
    assert.equal(first.body.noDataFlag, true);
    const again = await submit({ ...exactInput, model: 'Ghost 1' });
    assert.deepEqual([again.status, again.body.status, again.body.fromCache], [200, 'NO_DATA', true]);
  });
});

test('mock results are never cached; a broken cache never breaks a query', async (t) => {
  await t.test('stub engine results (isMock) are not cached', async (t2) => {
    const { call, waitDone, close } = await startTestServer();       // default stub engine
    t2.after(close);
    const me = await registerOfficer(call);
    for (let i = 0; i < 2; i++) {
      const r = await call('/query/exact-match', { method: 'POST', token: me.token, body: exactInput });
      assert.equal(r.status, 202);
      await waitDone(r.body.queryId, me.token);
    }
  });

  await t.test('cache that throws on every call: queries still complete', async (t2) => {
    const broken = { kind: 'broken', get: async () => { throw new Error('redis down'); }, set: async () => { throw new Error('redis down'); }, clear: async () => { throw new Error('redis down'); }, close: async () => {} };
    const { call, waitDone, close } = await startTestServer({ overrides: { scrapeEngine: countingEngine(), cache: broken } });
    t2.after(close);
    const me = await registerOfficer(call);
    const r = await call('/query/exact-match', { method: 'POST', token: me.token, body: exactInput });
    assert.equal((await waitDone(r.body.queryId, me.token)).body.status, 'COMPLETED');
  });
});
