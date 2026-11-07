import test from 'node:test';
import assert from 'node:assert/strict';
import { BullQueue } from '../queue/BullQueue.js';
import { startTestServer, officer, exactInput } from './helpers.js';

const skip = process.env.REDIS_URL ? false : 'set REDIS_URL to run the BullMQ tests';

test('BullQueue delivers a job to a worker', { skip }, async () => {
  const q = new BullQueue({ redisUrl: process.env.REDIS_URL, name: `casper-test-${Date.now()}` });
  const got = new Promise((res) => q.startWorker(async (job) => res(job)));
  await q.enqueue({ queryId: 42 });
  assert.deepEqual(await got, { queryId: 42 });
  await q.close();
});

test('full API flow through Redis/BullMQ', { skip }, async (t) => {
  const { call, waitDone, container, close } = await startTestServer({
    env: { QUEUE: 'bull', REDIS_URL: process.env.REDIS_URL },
  });
  t.after(close);
  container.startWorker();
  const { body: { token } } = await call('/auth/register', { method: 'POST', body: officer });
  const r = await call('/query/exact-match', { method: 'POST', token, body: exactInput });
  assert.equal(r.status, 202);
  assert.equal((await waitDone(r.body.queryId, token)).body.status, 'COMPLETED');
});
