// Tests for the fixes from the code review (findings 1, 2, 4, 5, 10) and the demo accounts / sample data.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, officer, exactInput } from './helpers.js';
import { buildContainer } from '../api/container.js';
import { parsePrice } from '../scrapers/extraction/priceParser.js';
import { MemoryCache } from '../cache/MemoryCache.js';

test('finding 1: a bad currency label drops the price instead of crashing the results page', () => {
  assert.equal(parsePrice(1299, 'Rs'), null);
  assert.equal(parsePrice(1299, 'rupees!'), null);
  assert.deepEqual(parsePrice(1299, '₹'), { amount: 1299, currency: 'INR' });
  assert.deepEqual(parsePrice(1299, 'usd'), { amount: 1299, currency: 'USD' });
});

test('finding 2: "no data" is remembered for 10 minutes, a real answer for hours', async () => {
  const ttls = [];
  const cache = new MemoryCache();
  const set = cache.set.bind(cache);
  cache.set = (k, v, ttl) => { ttls.push([v.noDataFlag, ttl]); return set(k, v, ttl); };
  let answer = [];
  const engine = { async dispatchQuery() { return answer; } };
  const s = await startTestServer({ overrides: { scrapeEngine: engine, cache } });
  const { token } = (await s.call('/auth/register', { method: 'POST', body: officer })).body;

  const a = await s.call('/query/exact-match', { method: 'POST', token, body: exactInput });
  await s.waitDone(a.body.queryId, token);
  answer = [{ price: 100, currency: 'INR', sourceUrl: 'https://dell.com/x', sourceName: 'Dell', vintage: new Date().toISOString(), isMock: false }];
  const b = await s.call('/query/exact-match', { method: 'POST', token, body: { ...exactInput, model: 'Other' } });
  await s.waitDone(b.body.queryId, token);

  assert.deepEqual(ttls[0], [true, 600]);
  assert.equal(ttls[1][0], false);
  assert.ok(ttls[1][1] >= 3600);
  await s.close();
});

test('finding 4: production refuses a short or placeholder JWT secret', async () => {
  for (const bad of [undefined, 'change-me', 'a'.repeat(31)]) {
    await assert.rejects(() => buildContainer({ DATA_STORE: 'memory', NODE_ENV: 'production', JWT_SECRET: bad }), /JWT_SECRET/);
  }
  const ok = await buildContainer({ DATA_STORE: 'memory', NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(32) });
  await ok.close();
});

test('finding 5: with REGISTRATION_CODE set, sign-up needs the invite code (and /auth/config says so)', async () => {
  const s = await startTestServer({ env: { REGISTRATION_CODE: 'open-sesame' } });
  assert.equal((await s.call('/auth/config')).body.inviteCodeRequired, true);
  const no = await s.call('/auth/register', { method: 'POST', body: officer });
  assert.equal(no.status, 403);
  assert.match(no.body.error, /invite code/i);
  assert.equal((await s.call('/auth/register', { method: 'POST', body: { ...officer, inviteCode: 'wrong' } })).status, 403);
  assert.equal((await s.call('/auth/register', { method: 'POST', body: { ...officer, inviteCode: 'open-sesame' } })).status, 201);
  await s.close();

  const open = await startTestServer();
  assert.equal((await open.call('/auth/config')).body.inviteCodeRequired, false);
  assert.equal((await open.call('/auth/register', { method: 'POST', body: officer })).status, 201);
  await open.close();
});

test('finding 10: a short city name no longer matches other cities\' curated rates', async () => {
  const s = await startTestServer();
  const { rateRepo } = s.container;
  const base = { serviceType: 'IT Support Services', price: 2500, currency: 'INR', sourceName: 'Contract', sourceUrl: 'https://example.gov.in/r', vintage: '2026-08-01T00:00:00.000Z' };
  await rateRepo.create({ ...base, location: 'Jaipur' });
  await rateRepo.create({ ...base, location: 'Kanpur, Uttar Pradesh' });
  await rateRepo.create({ ...base, location: 'Navi Mumbai' });
  await rateRepo.create({ ...base, location: 'Mumbai' });
  assert.deepEqual(await rateRepo.findMatching({ serviceType: base.serviceType, city: 'pur' }), []);
  assert.equal((await rateRepo.findMatching({ serviceType: base.serviceType, city: 'Mumbai' })).length, 1);
  assert.equal((await rateRepo.findMatching({ serviceType: base.serviceType, city: 'kanpur' })).length, 1);
  await s.close();
});

test('demo mode: seeded accounts, sample queries (flagged as sample data) and one-click sign-in', async () => {
  const s = await startTestServer({ env: { DEMO_SEED: 'true', DEMO_QUICK_LOGIN: 'true' } });
  assert.equal((await s.call('/auth/config')).body.demoLogin, true);

  const admin = (await s.call('/auth/demo', { method: 'POST', body: { role: 'admin' } })).body;
  assert.equal(admin.user.role, 'ADMIN');
  const off = (await s.call('/auth/demo', { method: 'POST', body: { role: 'officer' } })).body;
  assert.equal(off.user.role, 'OFFICER');
  assert.match(off.user.email, /@demo\.gov\.in$/);

  // the seeded password also works through normal sign-in
  assert.equal((await s.call('/auth/login', { method: 'POST', body: { email: off.user.email, password: 'Officer@demo123' } })).status, 200);

  const history = (await s.call('/query/history', { token: off.token })).body;
  assert.equal(history.total, 4);
  const first = (await s.call(`/query/${history.items[0].queryId}`, { token: off.token })).body;
  assert.equal(first.status, 'COMPLETED');
  assert.ok(first.results.length >= 2 && first.results.every((r) => r.isMock), 'sample rows must be flagged as sample data');
  assert.equal((await s.call('/admin/sources', { token: admin.token })).status, 200);
  assert.equal((await s.call('/admin/sources', { token: off.token })).status, 403);
  await s.close();
});

test('demo mode is off by default, and refused in production without an explicit override', async () => {
  const s = await startTestServer();
  assert.equal((await s.call('/auth/demo', { method: 'POST', body: { role: 'admin' } })).status, 404);
  assert.equal((await s.call('/auth/config')).body.demoLogin, false);
  await s.close();
  await assert.rejects(() => buildContainer({ DATA_STORE: 'memory', NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(32), DEMO_QUICK_LOGIN: 'true' }), /DEMO_QUICK_LOGIN/);
});

test('seeding twice does not duplicate users or queries', async () => {
  const c = await buildContainer({ DATA_STORE: 'memory', JWT_SECRET: 'test-secret', DEMO_SEED: 'true' });
  const { seedDemo } = await import('../services/DemoSeeder.js');
  const again = await seedDemo({ userRepo: c.userRepo, queryRepo: c.queryRepo, env: {} });
  assert.equal(again.sampleQueriesCreated, 0);
  await c.close();
});

test('start-up: the database mode without a DATABASE_URL fails at once with a message that says what to do', async () => {
  await assert.rejects(() => buildContainer({ DATA_STORE: 'prisma' }), /DATABASE_URL is not set[\s\S]*\.env\.demo\.example/);
  await assert.rejects(() => buildContainer({}), /DATABASE_URL is not set/);          // the default store is the database
});

import { matchesExact } from '../scrapers/extraction/matcher.js';

test('matching: the MODEL must be exact, the MAKE only needs supporting evidence (shops rarely print the full maker name)', () => {
  const q = { make: 'Great Scott Gadgets', model: 'HackRF One' };
  assert.ok(matchesExact({ title: 'HackRF One Software Defined Radio', url: 'https://shop.example/hackrf-one', text: 'Made by Great Scott Gadgets. 1 MHz to 6 GHz.' }, q).matches, 'full maker name on the page is enough');
  assert.ok(matchesExact({ title: 'Great HackRF One SDR', url: 'https://shop.example/x', text: '' }, q).matches, 'first word of the maker in the title is enough');
  assert.ok(matchesExact({ title: 'Ettus USRP B200mini', url: 'https://x.example/b200mini', text: '' }, { make: 'Ettus Research', model: 'USRP B200mini' }).matches);
  assert.ok(!matchesExact({ title: 'HackRF One Software Defined Radio', url: 'https://shop.example/h', text: 'a radio for hobbyists' }, q).matches, 'no evidence of the maker at all: refused');
  assert.ok(!matchesExact({ title: 'Great Scott Gadgets HackRF Pro', url: 'https://shop.example/hackrf-pro', text: 'Great Scott Gadgets' }, q).matches, 'a different model is never accepted');
  assert.ok(!matchesExact({ title: 'Dell Latitude 5430i', url: 'https://x.example/l', text: 'Dell' }, { make: 'Dell', model: 'Latitude 5430' }).matches, '5430 is not 5430i');
});

test('no-data diagnosis: the API says where the search dropped out (counts only), and only for no-data answers', async () => {
  const none = []; Object.defineProperty(none, 'diagnosis', { value: { searched: 20, approved: 7, refused: 3, refusedSites: ['robu.in'], opened: 4, withPrice: 2 }, enumerable: false });
  const s = await startTestServer({ overrides: { scrapeEngine: { async dispatchQuery() { return none; } } } });
  try {
    const { token } = (await s.call('/auth/register', { method: 'POST', body: officer })).body;
    const r = await s.call('/query/exact-match', { method: 'POST', token, body: exactInput });
    const done = (await s.waitDone(r.body.queryId, token)).body;
    assert.equal(done.noDataFlag, true);
    assert.deepEqual(done.diagnosis, { searched: 20, approved: 7, refused: 3, refusedSites: ['robu.in'], opened: 4, withPrice: 2 });
  } finally { await s.close(); }
});
