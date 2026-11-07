// Measures the live engine for the Methodology paper: coverage, response time, and a sheet for manual precision checks.
//   DATA_STORE=memory SEARCH_PROVIDER=brave BRAVE_API_KEY=... npm run evaluate -- demo/queries.json evaluation.csv
// Then open the CSV and fill the last column by checking each source link by hand (correct product and price?).
import 'dotenv/config';
import { summaryOf } from '../models/queryLabel.js';
import fs from 'node:fs';
import { buildContainer } from '../api/container.js';

const [queriesFile = 'demo/queries.json', outFile = 'evaluation.csv'] = process.argv.slice(2);
const queries = JSON.parse(fs.readFileSync(queriesFile, 'utf8'));
const container = await buildContainer({ ...process.env, DEMO_MODE: '', QUEUE: 'inline', CACHE: 'off' });
if (container.scrapeEngine.constructor.name === 'StubScrapeEngine') {
  console.error('No live search provider is configured (SEARCH_PROVIDER + key). Refusing to run: this would measure the MOCK engine and report meaningless coverage.');
  process.exit(1);
}
const csv = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const label = summaryOf;

const rows = [['query', 'type', 'found', 'result_count', 'ms', 'price', 'currency', 'source', 'source_url', 'vintage', 'vintage_basis', 'match_score', 'correct_manual_check']];
const times = []; let found = 0;
for (const q of queries) {
  const t0 = Date.now(); let results = [], error = '';
  try { results = await container.scrapeEngine.dispatchQuery(q); } catch (e) { error = e.message; }
  const ms = Date.now() - t0; times.push(ms); if (results.length) found++;
  console.log(`${results.length ? 'found  ' : error ? 'ERROR  ' : 'no data'}  ${String(ms).padStart(6)} ms  ${label(q)} ${error}`);
  if (!results.length) rows.push([label(q), q.queryType, error ? `error: ${error}` : 'no', 0, ms]);
  for (const r of results) rows.push([label(q), q.queryType, 'yes', results.length, ms, r.price, r.currency, r.sourceName, r.sourceUrl, r.vintage, r.vintageBasis, r.matchScore, '']);
}
fs.writeFileSync(outFile, `${rows.map((r) => r.map(csv).join(',')).join('\n')}\n`);
times.sort((a, b) => a - b);
console.log(`\nCoverage: ${found}/${queries.length} queries returned data (${Math.round((100 * found) / queries.length)}%)`);
console.log(`Response time: median ${times[Math.floor(times.length / 2)]} ms, max ${times.at(-1)} ms`);
console.log(`Wrote ${outFile}. Fill in "correct_manual_check" to compute precision.`);
await container.close();
process.exit(0);
