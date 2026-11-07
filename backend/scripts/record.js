// Records REAL results for the demo queries so they can be replayed if a live search fails during the viva.
// Run on a machine with internet and a configured search provider:
//   DATA_STORE=memory SEARCH_PROVIDER=brave BRAVE_API_KEY=... npm run demo:record
// Edit demo/queries.json first: put the 2-3 items you will actually demonstrate.
import 'dotenv/config';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildContainer } from '../api/container.js';
import { summaryOf } from '../models/queryLabel.js';

const file = process.argv[2] || fileURLToPath(new URL('../demo/queries.json', import.meta.url));
const queries = JSON.parse(fs.readFileSync(file, 'utf8'));
const container = await buildContainer({ ...process.env, DEMO_MODE: 'record', QUEUE: 'inline', CACHE: 'off' });

if (container.scrapeEngine.engine?.constructor.name === 'StubScrapeEngine') {
  console.error('No live search provider is configured (SEARCH_PROVIDER + key). Nothing can be recorded: mock results are never saved.');
  process.exit(1);
}

let recorded = 0;
for (const q of queries) {
  const label = summaryOf(q);
  try {
    const results = (await container.scrapeEngine.dispatchQuery(q)).filter((r) => !r.isMock);
    console.log(`${results.length ? 'recorded' : 'NO DATA '}  ${label}  (${results.length} result${results.length === 1 ? '' : 's'})`);
    if (results.length) recorded++;
  } catch (e) { console.log(`FAILED    ${label}: ${e.message}`); }
}
console.log(`\n${recorded} of ${queries.length} queries recorded. Commit backend/demo/snapshots.json, then run the app with DEMO_MODE=replay as the backup.`);
await container.close();
process.exit(0);
