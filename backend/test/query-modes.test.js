import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, officer } from './helpers.js';

test('specification and service query endpoints (stub engine)', async (t) => {
  const { call, waitDone, close } = await startTestServer();
  t.after(close);
  const { body: { token } } = await call('/auth/register', { method: 'POST', body: officer });
  const specs = { itemName: 'Laptop', itemType: 'Computers & Accessories', specs: [{ key: 'RAM', value: '16 GB' }, { key: 'Storage', value: '512 GB SSD' }] };
  const service = { serviceType: 'IT Support Services', location: 'Indore, Madhya Pradesh', description: 'On-site hardware support' };

  await t.test('both require authentication', async () => {
    assert.equal((await call('/query/specs', { method: 'POST', body: specs })).status, 401);
    assert.equal((await call('/query/service', { method: 'POST', body: service })).status, 401);
  });

  await t.test('invalid specification input returns row-level 400s', async () => {
    const r = await call('/query/specs', { method: 'POST', token, body: { ...specs, specs: [{ key: 'RAM', value: '' }] } });
    assert.equal(r.status, 400);
    assert.ok(r.body.details['specs.0.value']);
  });

  await t.test('valid specification query completes and echoes the specs', async () => {
    const r = await call('/query/specs', { method: 'POST', token, body: specs });
    assert.equal(r.status, 202);
    const done = await waitDone(r.body.queryId, token);
    assert.equal(done.body.status, 'COMPLETED');
    assert.equal(done.body.query.queryType, 'SPECIFICATION');
    assert.deepEqual(done.body.query.specifications, specs.specs);
  });

  await t.test('invalid service input returns 400', async () => {
    const r = await call('/query/service', { method: 'POST', token, body: { ...service, serviceType: 'Nope', description: '' } });
    assert.equal(r.status, 400);
    assert.ok(r.body.details.serviceType && r.body.details.description);
  });

  await t.test('valid service query completes; location "nodata" gives the no-data path', async () => {
    const ok = await call('/query/service', { method: 'POST', token, body: service });
    const done = await waitDone(ok.body.queryId, token);
    assert.equal(done.body.query.serviceType, 'IT Support Services');
    assert.equal(done.body.query.location, 'Indore, Madhya Pradesh');
    assert.equal(done.body.status, 'COMPLETED');
    const none = await call('/query/service', { method: 'POST', token, body: { ...service, location: 'nodata' } });
    const d2 = await waitDone(none.body.queryId, token);
    assert.equal(d2.status, 200);
    assert.equal(d2.body.noDataFlag, true);
  });

  await t.test('service types are served to the form', async () => {
    const r = await call('/meta/service-types', { token });
    assert.ok(r.body.some((x) => x.name === 'IT Support Services'));
  });
});
