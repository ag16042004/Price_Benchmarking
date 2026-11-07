import { createApp } from '../api/app.js';
import { buildContainer } from '../api/container.js';

export async function startTestServer({ overrides = {}, env = {} } = {}) {
  process.env.NODE_ENV = 'test';
  const container = await buildContainer({ DATA_STORE: 'memory', JWT_SECRET: 'test-secret', NODE_ENV: 'test', ...env }, overrides);
  const server = createApp(container).listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (path, { method = 'GET', body, token } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
      body: body && JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };
  /** Polls GET /query/:id until the job leaves PENDING. */
  const waitDone = async (id, token) => {
    for (let i = 0; i < 200; i++) {
      const r = await call(`/query/${id}`, { token });
      if (r.body.status !== 'PENDING') return r;
      await new Promise((ok) => setTimeout(ok, 25));
    }
    throw new Error('query stayed PENDING');
  };
  const raw = (path, { method = 'POST', body, token } = {}) => fetch(base + path, {
    method, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) }, body,
  });
  return { call, raw, base, waitDone, container, close: async () => { server.close(); await container.close(); } };
}

export const officer = { name: 'Test Officer', email: 'officer@example.gov.in', password: 'password123' };
export const exactInput = { itemName: 'Laptop', itemType: 'Computers & Accessories', make: 'Dell', model: 'Latitude 5430' };

/** Registers a user and promotes them in the data store. The token still says OFFICER: the server must look at the database. */
export async function makeAdmin(call, container, email = 'admin@example.gov.in') {
  const r = await call('/auth/register', { method: 'POST', body: { ...officer, name: 'Admin', email } });
  await container.userRepo.setRole(r.body.user.id, 'ADMIN');
  return { token: r.body.token, id: r.body.user.id };
}

export async function registerOfficer(call, email = 'officer@example.gov.in') {
  return (await call('/auth/register', { method: 'POST', body: { ...officer, email } })).body;
}

/** Engine fake that counts calls and returns one real-looking (non-mock) result. */
export function countingEngine(results) {
  const engine = {
    calls: 0,
    async dispatchQuery() {
      engine.calls++;
      return results ?? [{ price: 1000, currency: 'INR', sourceUrl: 'https://www.dell.com/x', sourceName: 'Dell India', itemDetails: 'Dell Latitude 5430', vintage: new Date().toISOString(), vintageBasis: 'page', matchScore: 1, isMock: false }];
    },
  };
  return engine;
}
