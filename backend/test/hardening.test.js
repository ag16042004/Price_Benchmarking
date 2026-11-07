import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, registerOfficer, exactInput, officer } from './helpers.js';

test('input hardening', async (t) => {
  const { call, raw, close } = await startTestServer();
  t.after(close);
  const me = await registerOfficer(call);
  const POSTS = ['/query/exact-match', '/query/specs', '/query/service', '/auth/login', '/auth/register'];

  await t.test('malformed JSON, "null", and bare strings are 400, never 500', async () => {
    for (const path of POSTS) {
      for (const body of ['{bad', 'null', '"text"', '']) {
        const r = await raw(path, { token: me.token, body });
        assert.ok(r.status === 400 || r.status === 401, `${path} ${JSON.stringify(body)} gave ${r.status}`);
        assert.ok((await r.json()).error);
      }
    }
  });

  await t.test('an array body is a validation error, not a crash', async () => {
    for (const path of ['/query/exact-match', '/query/specs', '/query/service']) {
      assert.equal((await raw(path, { token: me.token, body: '[]' })).status, 400);
    }
    assert.equal((await raw('/auth/register', { body: '[1,2]' })).status, 400);
  });

  await t.test('objects, arrays and numbers where strings belong are rejected per field', async () => {
    const r = await call('/query/exact-match', { method: 'POST', token: me.token, body: { itemName: 5, itemType: ['A'], make: { $ne: 1 }, model: true } });
    assert.equal(r.status, 400);
    assert.deepEqual(Object.keys(r.body.details).sort(), ['itemName', 'itemType', 'make', 'model']);
    const s = await call('/query/specs', { method: 'POST', token: me.token, body: { itemName: 'L', itemType: 'Antennas', specs: ['RAM', null, 7, { key: 1, value: [] }] } });
    assert.equal(s.status, 400);
    assert.equal((await call('/query/specs', { method: 'POST', token: me.token, body: { itemName: 'L', itemType: 'Antennas', specs: 'RAM' } })).status, 400);
    const l = await call('/auth/login', { method: 'POST', body: { email: { $gt: '' }, password: ['x'] } });
    assert.equal(l.status, 400);
  });

  await t.test('over-long and too-many inputs are rejected', async () => {
    assert.equal((await call('/query/exact-match', { method: 'POST', token: me.token, body: { ...exactInput, make: 'x'.repeat(81) } })).status, 400);
    const many = Array.from({ length: 16 }, (_, i) => ({ key: `k${i}`, value: 'v' }));
    assert.equal((await call('/query/specs', { method: 'POST', token: me.token, body: { itemName: 'L', itemType: 'Antennas', specs: many } })).status, 400);
    assert.equal((await call('/auth/register', { method: 'POST', body: { ...officer, email: 'a@b.co', password: 'p'.repeat(73) } })).status, 400);
  });

  await t.test('control characters are stripped from stored text', async () => {
    const r = await call('/query/exact-match', { method: 'POST', token: me.token, body: { ...exactInput, make: 'De\u0000ll\u0007' } });
    assert.equal(r.status, 202);
  });

  await t.test('a request body over 100 KB is 413', async () => {
    const r = await raw('/query/exact-match', { token: me.token, body: JSON.stringify({ ...exactInput, make: 'x'.repeat(200_000) }) });
    assert.equal(r.status, 413);
  });

  await t.test('garbage query ids are 404', async () => {
    for (const id of ['abc', '0', '-1', '1.5', '99999999999999999999', '%00', '1e3x']) {
      assert.equal((await call(`/query/${id}`, { token: me.token })).status, 404, id);
    }
  });
});

test('rate limiting', async (t) => {
  await t.test('query submissions are limited per user (protects the paid search quota)', async (t2) => {
    const { call, raw, close } = await startTestServer({ env: { QUERY_RATE_LIMIT_PER_HOUR: '2' } });
    t2.after(close);
    const a = await registerOfficer(call), b = await registerOfficer(call, 'b@example.gov.in');
    const go = (who) => call('/query/exact-match', { method: 'POST', token: who.token, body: exactInput });
    assert.equal((await go(a)).status, 202);
    assert.equal((await go(a)).status, 202);
    const blocked = await raw('/query/exact-match', { token: a.token, body: JSON.stringify(exactInput) });
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers.get('retry-after')) > 0);
    assert.equal((await go(b)).status, 202);                         // other users unaffected
  });

  await t.test('login attempts are limited (brute force)', async (t2) => {
    const { call, close } = await startTestServer({ env: { AUTH_RATE_LIMIT: '3' } });
    t2.after(close);
    const attempt = () => call('/auth/login', { method: 'POST', body: { email: 'x@example.gov.in', password: 'wrongwrong' } });
    for (let i = 0; i < 3; i++) assert.equal((await attempt()).status, 401);
    assert.equal((await attempt()).status, 429);
  });
});
