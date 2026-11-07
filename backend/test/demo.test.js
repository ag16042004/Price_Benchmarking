import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RecordingEngine, ReplayEngine } from '../scrapers/demo/DemoEngines.js';
import { StubScrapeEngine } from '../scrapers/StubScrapeEngine.js';
import { startTestServer, registerOfficer, exactInput } from './helpers.js';

const q = { queryType: 'EXACT_MATCH', itemType: 'Antennas', make: 'Acme', model: 'X1' };
const real = [{ price: 99, currency: 'USD', sourceUrl: 'https://www.pasternack.com/x', sourceName: 'Pasternack', itemDetails: 'Acme X1', vintage: '2026-09-01T00:00:00.000Z', vintageBasis: 'page', matchScore: 1, isMock: false }];
const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'casper-')), 'snaps.json');
const quiet = { warn() {} };

test('record then replay: real results come back flagged isReplay, with their original source and date', async () => {
  const file = tmp();
  const rec = new RecordingEngine({ engine: { dispatchQuery: async () => real }, file, logger: quiet });
  await rec.dispatchQuery(q);
  const out = await new ReplayEngine({ file }).dispatchQuery({ ...q, make: ' ACME ', model: 'x1' });   // fingerprint ignores case/spacing
  assert.deepEqual([out.length, out[0].isReplay, out[0].isMock, out[0].price, out[0].vintage], [1, true, false, 99, '2026-09-01T00:00:00.000Z']);
  assert.equal(out[0].sourceUrl, 'https://www.pasternack.com/x');
});

test('nothing is invented: unrecorded queries replay as no data; mock and empty results are never recorded', async () => {
  const file = tmp();
  const rec = new RecordingEngine({ engine: new StubScrapeEngine(), file, logger: quiet });
  await rec.dispatchQuery(q);
  assert.equal(fs.existsSync(file), false);
  await new RecordingEngine({ engine: { dispatchQuery: async () => [] }, file, logger: quiet }).dispatchQuery(q);
  assert.equal(fs.existsSync(file), false);
  assert.deepEqual(await new ReplayEngine({ file }).dispatchQuery(q), []);
});

test('API in replay mode: results are labelled isReplay and are not cached', async (t) => {
  const file = tmp();
  fs.writeFileSync(file, JSON.stringify({}));
  await new RecordingEngine({ engine: { dispatchQuery: async () => real }, file, logger: quiet }).dispatchQuery({ queryType: 'EXACT_MATCH', itemType: exactInput.itemType, make: exactInput.make, model: exactInput.model });
  const { call, waitDone, close } = await startTestServer({ env: { DEMO_MODE: 'replay', DEMO_SNAPSHOTS: file } });
  t.after(close);
  const me = await registerOfficer(call);
  for (let i = 0; i < 2; i++) {
    const r = await call('/query/exact-match', { method: 'POST', token: me.token, body: exactInput });
    assert.equal(r.status, 202);                                                     // second time is still 202: not cached
    const done = await waitDone(r.body.queryId, me.token);
    assert.deepEqual([done.body.results[0].isReplay, done.body.results[0].isMock, done.body.results[0].price], [true, false, 99]);
  }
  const other = await call('/query/exact-match', { method: 'POST', token: me.token, body: { ...exactInput, model: 'Never Recorded' } });
  assert.equal((await waitDone(other.body.queryId, me.token)).body.noDataFlag, true);
});
