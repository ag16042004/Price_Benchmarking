import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { AuthService } from '../services/AuthService.js';
import { QueryService } from '../services/QueryService.js';
import { SourceRepository } from '../services/SourceRepository.js';
import { createMemoryRepos } from '../database/repositories/memoryRepos.js';
import { MemoryCache } from '../cache/MemoryCache.js';
import { NoCache } from '../cache/NoCache.js';
import { InlineQueue } from '../queue/InlineQueue.js';

const input = { itemName: 'Laptop', itemType: 'Computers & Accessories', make: 'Dell', model: 'Latitude 5430' };
const real = [{ price: 5, currency: 'INR', sourceUrl: 'https://www.dell.com/x', sourceName: 'Dell India', itemDetails: 'd', vintage: new Date().toISOString(), isMock: false }];

function makeService({ engine, queue = new InlineQueue(), cache = new NoCache(), repos = createMemoryRepos() } = {}) {
  const sourceRepository = new SourceRepository({ sourceDataRepo: repos.sourceDataRepo });
  const svc = new QueryService({ ...repos, scrapeEngine: engine ?? { dispatchQuery: async () => real }, queue, cache, sourceRepository });
  if (queue.startWorker) queue.startWorker((job) => svc.processQuery(job));   // the container does this in production
  return { svc, repos };
}

test('AuthService', async (t) => {
  const mk = (opts = {}) => new AuthService({ userRepo: createMemoryRepos().userRepo, jwtSecret: 's3cret', ...opts });

  await t.test('emails are case-insensitive and trimmed; role is OFFICER', async () => {
    const a = mk();
    const s = await a.register({ name: ' A ', email: '  Mixed@Example.GOV.in ', password: 'password123' });
    assert.deepEqual([s.user.email, s.user.name, s.user.role], ['mixed@example.gov.in', 'A', 'OFFICER']);
    assert.equal((await a.login({ email: 'MIXED@example.gov.in', password: 'password123' })).user.id, s.user.id);
  });

  await t.test('tokens: valid, tampered, wrong secret, and expired are told apart', async () => {
    const a = mk({ expiresIn: '1s' });
    const { token } = await a.register({ name: 'A', email: 'a@b.gov.in', password: 'password123' });
    assert.equal(a.verifyToken(token).role, 'OFFICER');
    assert.throws(() => a.verifyToken(`${token}x`), (e) => e.status === 401);
    assert.throws(() => a.verifyToken(jwt.sign({ sub: 1 }, 'other-secret')), (e) => e.status === 401);
    assert.throws(() => a.verifyToken(jwt.sign({ sub: 1 }, 's3cret', { expiresIn: -10 })), (e) => e.status === 401);
    assert.throws(() => a.verifyToken(jwt.sign({ sub: 1 }, 's3cret', { algorithm: 'none' })), (e) => e.status === 401);
  });

  await t.test('the password hash is never part of a session', async () => {
    const s = await mk().register({ name: 'A', email: 'a@b.gov.in', password: 'password123' });
    assert.ok(!JSON.stringify(s).includes('passwordHash'));
  });
});

test('SourceRepository.match: only the real domain or its subdomains', () => {
  const sources = [{ domain: 'dell.com', id: 1 }, { domain: 'in.mouser.com', id: 2 }, { domain: 'mouser.com', id: 3 }];
  const m = (u) => SourceRepository.match(u, sources)?.id ?? null;
  assert.equal(m('https://www.dell.com/p'), 1);
  assert.equal(m('https://dell.com/p'), 1);
  assert.equal(m('https://notdell.com/p'), null);            // look-alike suffix
  assert.equal(m('https://dell.com.evil.io/p'), null);       // look-alike prefix
  assert.equal(m('https://evil.io/dell.com'), null);         // domain only in the path
  assert.equal(m('https://in.mouser.com/p'), 2);             // longest domain wins
  assert.equal(m('https://www.mouser.com/p'), 3);
  assert.equal(m('not a url'), null);
  assert.equal(m('ftp://dell.com/x') !== undefined, true);
});

test('QueryService (unit, with fakes)', async (t) => {
  const user = { id: 1, role: 'OFFICER' };

  await t.test('queue failure -> 503 and the query is marked FAILED, not left pending', async () => {
    const queue = { kind: 'x', enqueue: async () => { throw new Error('redis down'); } };
    const { svc, repos } = makeService({ queue });
    await assert.rejects(() => svc.submitExactMatch(user, input), (e) => e.status === 503);
    assert.equal((await repos.queryRepo.findById(1)).status, 'FAILED');
  });

  await t.test('processQuery is idempotent: a finished query is never re-run', async () => {
    let calls = 0;
    const { svc } = makeService({ engine: { dispatchQuery: async () => { calls++; return real; } }, queue: { enqueue: async () => {} } });
    const { queryId } = await svc.submitExactMatch(user, input);
    await svc.processQuery({ queryId }); await svc.processQuery({ queryId }); await svc.processQuery({ queryId: 999 });
    assert.equal(calls, 1);
  });

  await t.test('an engine error marks the query FAILED and does not throw out of the worker', async () => {
    const { svc, repos } = makeService({ engine: { dispatchQuery: async () => { throw new Error('boom'); } }, queue: { enqueue: async () => {} } });
    const { queryId } = await svc.submitExactMatch(user, input);
    await svc.processQuery({ queryId });
    assert.equal((await repos.queryRepo.findById(queryId)).status, 'FAILED');
  });

  await t.test('a query stuck PENDING for over 3 minutes is reported FAILED', async () => {
    const { svc, repos } = makeService({ queue: { enqueue: async () => {} } });
    const { queryId } = await svc.submitExactMatch(user, input);
    assert.equal((await svc.getQuery(user, queryId)).status, 'PENDING');
    const orig = repos.queryRepo.findById;
    repos.queryRepo.findById = async (id) => ({ ...(await orig(id)), createdAt: new Date(Date.now() - 4 * 60_000) });
    assert.equal((await svc.getQuery(user, queryId)).status, 'FAILED');
  });

  await t.test("an admin can open anyone's query; another officer cannot", async () => {
    const { svc } = makeService();
    const { queryId } = await svc.submitExactMatch(user, input);
    assert.ok(await svc.getQuery({ id: 99, role: 'ADMIN' }, queryId));
    await assert.rejects(() => svc.getQuery({ id: 2, role: 'OFFICER' }, queryId), (e) => e.status === 404);
  });

  await t.test('a hit is stored as its own query, flagged fromCache, and the engine is not called', async () => {
    let calls = 0;
    const cache = new MemoryCache();
    const { svc } = makeService({ engine: { dispatchQuery: async () => { calls++; return real; } }, cache });
    const first = await svc.submitExactMatch(user, input);
    await new Promise((r) => setImmediate(r)); await new Promise((r) => setTimeout(r, 20));
    const second = await svc.submitExactMatch(user, input);
    assert.equal(first.status, 'PENDING');
    assert.deepEqual([second.status, second.fromCache, calls], ['COMPLETED', true, 1]);
    assert.notEqual(first.queryId, second.queryId);
  });

  await t.test('replayed and mock results are never cached', async () => {
    for (const flag of ['isMock', 'isReplay']) {
      const cache = new MemoryCache();
      const { svc } = makeService({ engine: { dispatchQuery: async () => [{ ...real[0], [flag]: true }] }, cache });
      await svc.submitExactMatch(user, input);
      await new Promise((r) => setTimeout(r, 20));
      assert.equal(cache.map.size, 0, flag);
    }
  });
});
