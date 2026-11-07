import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, officer } from './helpers.js';

test('auth', async (t) => {
  const { call, container, close } = await startTestServer();
  t.after(close);

  await t.test('register returns a session and never exposes the hash', async () => {
    const r = await call('/auth/register', { method: 'POST', body: officer });
    assert.equal(r.status, 201);
    assert.ok(r.body.token);
    assert.equal(r.body.user.role, 'OFFICER');
    assert.equal(r.body.user.passwordHash, undefined);
  });

  await t.test('password is stored as a salted hash (NFR-2)', async () => {
    const u = await container.userRepo.findByEmail(officer.email);
    assert.notEqual(u.passwordHash, officer.password);
    assert.match(u.passwordHash, /^\$2[aby]\$/);
  });

  await t.test('duplicate email is rejected with 409', async () => {
    assert.equal((await call('/auth/register', { method: 'POST', body: officer })).status, 409);
  });

  await t.test('registration validation returns per-field 400', async () => {
    const r = await call('/auth/register', { method: 'POST', body: { name: '', email: 'bad', password: 'short' } });
    assert.equal(r.status, 400);
    assert.deepEqual(Object.keys(r.body.details).sort(), ['email', 'name', 'password']);
  });

  await t.test('registration is limited to @gov.in addresses (and look-alikes are refused)', async () => {
    const tryEmail = (email) => call('/auth/register', { method: 'POST', body: { name: 'N', email, password: 'password123' } });
    for (const bad of ['someone@gmail.com', 'someone@evilgov.in', 'someone@gov.in.evil.com', 'someone@notgov.in']) {
      const r = await tryEmail(bad);
      assert.equal(r.status, 400, bad);
      assert.match(r.body.details.email, /@gov\.in/);
    }
    assert.equal((await tryEmail('a.b@gov.in')).status, 201);                 // the bare domain is allowed
    assert.equal((await tryEmail('c@mail.dept.GOV.IN')).status, 201);         // subdomains and any case are allowed
  });

  await t.test('login works; wrong password and unknown email give the same 401', async () => {
    assert.equal((await call('/auth/login', { method: 'POST', body: officer })).status, 200);
    const a = await call('/auth/login', { method: 'POST', body: { email: officer.email, password: 'wrongwrong' } });
    const b = await call('/auth/login', { method: 'POST', body: { email: 'nobody@example.gov.in', password: 'password123' } });
    assert.equal(a.status, 401);
    assert.deepEqual(a.body, b.body);
  });
});
