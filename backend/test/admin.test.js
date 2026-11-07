import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, makeAdmin, registerOfficer, countingEngine, exactInput } from './helpers.js';
import { MemoryCache } from '../cache/MemoryCache.js';

const ADMIN_ROUTES = [
  ['GET', '/admin/sources'], ['POST', '/admin/sources'], ['PATCH', '/admin/sources/1'],
  ['GET', '/admin/item-types'], ['POST', '/admin/item-types'], ['PATCH', '/admin/item-types/1'],
  ['GET', '/admin/service-types'], ['POST', '/admin/service-types'], ['PATCH', '/admin/service-types/1'],
  ['GET', '/admin/rates'], ['POST', '/admin/rates'], ['PATCH', '/admin/rates/1'],
];

test('admin access control (NFR-3)', async (t) => {
  const { call, container, close } = await startTestServer();
  t.after(close);
  const officer = await registerOfficer(call);

  await t.test('every admin route: 401 without a token, 403 for an officer', async () => {
    for (const [method, path] of ADMIN_ROUTES) {
      assert.equal((await call(path, { method })).status, 401, `${method} ${path} anon`);
      assert.equal((await call(path, { method, token: officer.token, ...(method !== 'GET' && { body: {} }) })).status, 403, `${method} ${path} officer`);
    }
  });

  await t.test('role comes from the database, not the token: promotion works, demotion bites at once', async () => {
    const admin = await makeAdmin(call, container);
    assert.equal((await call('/admin/sources', { token: admin.token })).status, 200);      // token says OFFICER, DB says ADMIN
    await container.userRepo.setRole(admin.id, 'OFFICER');
    assert.equal((await call('/admin/sources', { token: admin.token })).status, 403);      // same token, now refused
  });
});

test('admin: sources (FR-9)', async (t) => {
  const { call, container, close } = await startTestServer();
  t.after(close);
  const { token } = await makeAdmin(call, container);
  const body = { domain: 'HTTPS://WWW.NewVendor.com/shop?x=1', name: 'New Vendor', category: 'Distributor', trustLevel: 'medium' };

  await t.test('create normalizes the domain, defaults to active', async () => {
    const r = await call('/admin/sources', { method: 'POST', token, body });
    assert.equal(r.status, 201);
    assert.deepEqual([r.body.domain, r.body.trustLevel, r.body.isActive], ['newvendor.com', 'MEDIUM', true]);
  });

  await t.test('duplicate domain is 409 (also when typed differently)', async () => {
    assert.equal((await call('/admin/sources', { method: 'POST', token, body: { ...body, domain: 'newvendor.com' } })).status, 409);
  });

  await t.test('bad domains, category and trust level are rejected with field errors', async () => {
    for (const domain of ['localhost', '192.168.0.1', 'a b.com', '', 'nodots', '-bad-.com', null, { x: 1 }]) {
      const r = await call('/admin/sources', { method: 'POST', token, body: { ...body, domain } });
      assert.equal(r.status, 400, `domain ${JSON.stringify(domain)}`);
      assert.ok(r.body.details.domain);
    }
    const r = await call('/admin/sources', { method: 'POST', token, body: { ...body, domain: 'ok.com', category: 'Nope', trustLevel: 'HUGE', name: '' } });
    assert.deepEqual(Object.keys(r.body.details).sort(), ['category', 'name', 'trustLevel']);
  });

  await t.test('deactivating removes the source from the scraping allow-list at once (NFR-8)', async () => {
    const list = (await call('/admin/sources', { token })).body;
    const id = list.find((s) => s.domain === 'newvendor.com').id;
    assert.ok((await container.sourceRepository.listActive()).some((s) => s.domain === 'newvendor.com'));
    const r = await call(`/admin/sources/${id}`, { method: 'PATCH', token, body: { isActive: false } });
    assert.equal(r.body.isActive, false);
    assert.ok(!(await container.sourceRepository.listActive()).some((s) => s.domain === 'newvendor.com'));
  });

  await t.test('PATCH edge cases: empty body 400, unknown id 404, garbage id 404, domain clash 409, non-boolean 400', async () => {
    assert.equal((await call('/admin/sources/1', { method: 'PATCH', token, body: {} })).status, 400);
    assert.equal((await call('/admin/sources/99999', { method: 'PATCH', token, body: { name: 'x' } })).status, 404);
    assert.equal((await call('/admin/sources/abc', { method: 'PATCH', token, body: { name: 'x' } })).status, 404);
    assert.equal((await call('/admin/sources/1', { method: 'PATCH', token, body: { domain: 'dell.com' } })).status, 409);
    assert.equal((await call('/admin/sources/1', { method: 'PATCH', token, body: { isActive: 'yes' } })).status, 400);
  });
});

test('admin: categories (FR-10)', async (t) => {
  const { call, container, close } = await startTestServer();
  t.after(close);
  const { token } = await makeAdmin(call, container);
  const officer = await registerOfficer(call);

  await t.test('a new item type shows up in the officer dropdown and can be queried', async () => {
    const r = await call('/admin/item-types', { method: 'POST', token, body: { name: 'Drones', description: 'UAVs' } });
    assert.equal(r.status, 201);
    assert.ok((await call('/meta/item-types', { token: officer.token })).body.some((x) => x.name === 'Drones'));
    const q = await call('/query/exact-match', { method: 'POST', token: officer.token, body: { ...exactInput, itemType: 'Drones' } });
    assert.equal(q.status, 202);
  });

  await t.test('duplicate name (any case) is 409; empty name 400', async () => {
    assert.equal((await call('/admin/item-types', { method: 'POST', token, body: { name: 'drones' } })).status, 409);
    assert.equal((await call('/admin/item-types', { method: 'POST', token, body: { name: '  ' } })).status, 400);
  });

  await t.test('deactivating hides it from the dropdown, rejects new queries, but the admin list still shows it', async () => {
    const all = (await call('/admin/item-types', { token })).body;
    const drones = all.find((x) => x.name === 'Drones');
    await call(`/admin/item-types/${drones.id}`, { method: 'PATCH', token, body: { isActive: false } });
    assert.ok(!(await call('/meta/item-types', { token: officer.token })).body.some((x) => x.name === 'Drones'));
    assert.equal((await call('/query/exact-match', { method: 'POST', token: officer.token, body: { ...exactInput, itemType: 'Drones' } })).status, 400);
    assert.ok((await call('/admin/item-types', { token })).body.some((x) => x.name === 'Drones' && x.isActive === false));
  });

  await t.test('service types work the same way; unknown kind is 404', async () => {
    assert.equal((await call('/admin/service-types', { method: 'POST', token, body: { name: 'Drone Surveys' } })).status, 201);
    assert.ok((await call('/meta/service-types', { token: officer.token })).body.some((x) => x.name === 'Drone Surveys'));
    assert.equal((await call('/admin/widgets', { token })).status, 404);
  });
});

test('admin: curated service rates feed service queries', async (t) => {
  const engine = countingEngine([]);                       // scraping finds nothing
  const { call, waitDone, container, close } = await startTestServer({ overrides: { scrapeEngine: engine } });
  t.after(close);
  const { token: adminToken } = await makeAdmin(call, container);
  const officer = await registerOfficer(call);
  const rate = { serviceType: 'IT Support Services', location: 'Indore', price: '2,500', sourceName: 'MP Rate Contract', sourceUrl: 'https://example.gov.in/rates.pdf', vintage: '2026-08-01' };
  const ask = async (extra = {}) => {
    const r = await call('/query/service', { method: 'POST', token: officer.token, body: { serviceType: 'IT Support Services', location: 'Indore, Madhya Pradesh', description: 'On-site support', refresh: true, ...extra } });
    return waitDone(r.body.queryId, officer.token);
  };

  await t.test('rate validation: link, date, price, service type', async () => {
    const r = await call('/admin/rates', { method: 'POST', token: adminToken, body: { ...rate, sourceUrl: 'javascript:alert(1)', vintage: '2999-01-01', price: 0, serviceType: 'Nope' } });
    assert.equal(r.status, 400);
    assert.deepEqual(Object.keys(r.body.details).sort(), ['price', 'serviceType', 'sourceUrl', 'vintage']);
  });

  await t.test('before any rate exists the answer is "no data"', async () => {
    assert.equal((await ask()).body.noDataFlag, true);
  });

  await t.test('a curated rate answers the query, clearly labelled, with its own source and date', async () => {
    const created = await call('/admin/rates', { method: 'POST', token: adminToken, body: rate });
    assert.equal(created.status, 201);
    assert.equal(created.body.price, 2500);
    const done = await ask();
    assert.equal(done.body.noDataFlag, false);
    const row = done.body.results[0];
    assert.deepEqual([row.price, row.sourceName, row.vintageBasis, row.isMock], [2500, 'MP Rate Contract (curated)', 'curated', false]);
    assert.equal(row.sourceUrl, 'https://example.gov.in/rates.pdf');
    assert.match(row.vintage, /^2026-08-01/);
  });

  await t.test('a different city or service type does not match', async () => {
    assert.equal((await ask({ location: 'Pune, Maharashtra' })).body.noDataFlag, true);
    assert.equal((await ask({ serviceType: 'AMC / Maintenance' })).body.noDataFlag, true);
  });

  await t.test('deactivating the rate removes it', async () => {
    const id = (await call('/admin/rates', { token: adminToken })).body[0].id;
    await call(`/admin/rates/${id}`, { method: 'PATCH', token: adminToken, body: { isActive: false } });
    assert.equal((await ask()).body.noDataFlag, true);
  });

  await t.test('a curated rate still answers when the search provider is down', async () => {
    const created = await call('/admin/rates', { method: 'POST', token: adminToken, body: rate });
    assert.ok(created.body.id);
    engine.dispatchQuery = async () => { throw new Error('Search provider failed'); };
    const done = await ask();
    assert.equal(done.body.status, 'COMPLETED');
    assert.equal(done.body.results.length, 1);
  });
});

test('admin changes clear the result cache', async (t) => {
  const engine = countingEngine();
  const cache = new MemoryCache();
  const { call, waitDone, container, close } = await startTestServer({ overrides: { scrapeEngine: engine, cache } });
  t.after(close);
  const { token: adminToken } = await makeAdmin(call, container);
  const officer = await registerOfficer(call);
  const run = async () => { const r = await call('/query/exact-match', { method: 'POST', token: officer.token, body: exactInput }); return r.body.fromCache ? r : waitDone(r.body.queryId, officer.token); };

  await run(); await run();
  assert.equal(engine.calls, 1);                                  // second one was cached
  await call('/admin/sources', { method: 'POST', token: adminToken, body: { domain: 'fresh-vendor.com', name: 'Fresh', category: 'Retailer', trustLevel: 'LOW' } });
  await run();
  assert.equal(engine.calls, 2);                                  // cache was cleared by the admin write
});

test('memory mode creates the first admin from ADMIN_EMAIL / ADMIN_PASSWORD', async (t) => {
  const { call, close } = await startTestServer({ env: { ADMIN_EMAIL: 'boss@example.gov.in', ADMIN_PASSWORD: 'supersecret1' } });
  t.after(close);
  const login = await call('/auth/login', { method: 'POST', body: { email: 'boss@example.gov.in', password: 'supersecret1' } });
  assert.equal(login.body.user.role, 'ADMIN');
  assert.equal((await call('/admin/sources', { token: login.body.token })).status, 200);
});
