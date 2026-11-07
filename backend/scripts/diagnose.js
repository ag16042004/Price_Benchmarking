// Runs ONE search through the real engine and prints where candidates drop out. Use it when every search says "No reliable data found".
//   npm run diagnose -- exact "Great Scott Gadgets" "HackRF One" "Communication Equipment"
//   npm run diagnose -- specs "Desktop Computer" "Computers & Accessories" "RAM=16 GB" "Storage=512 GB SSD"
//   npm run diagnose -- service "IT Support Services" "Indore, Madhya Pradesh"
import 'dotenv/config';
import { buildContainer } from '../api/container.js';

const [mode, ...a] = process.argv.slice(2);
const queries = {
  exact: () => ({ queryType: 'EXACT_MATCH', make: a[0], model: a[1], itemName: `${a[0]} ${a[1]}`, itemType: a[2] || 'Communication Equipment' }),
  specs: () => ({ queryType: 'SPECIFICATION', itemName: a[0], itemType: a[1], specifications: a.slice(2).map((p) => { const [key, ...v] = p.split('='); return { key, value: v.join('=') }; }) }),
  service: () => ({ queryType: 'SERVICE', serviceType: a[0], location: a[1] || 'Indore', description: 'price' }),
};
if (!queries[mode] || !a[0]) {
  console.log('Usage:\n  npm run diagnose -- exact "<make>" "<model>" "<item type>"\n  npm run diagnose -- specs "<item name>" "<item type>" "RAM=16 GB" ...\n  npm run diagnose -- service "<service type>" "<city>"');
  process.exit(1);
}

const c = await buildContainer({ ...process.env, DEMO_MODE: '', CACHE: 'off' });
const engine = c.scrapeEngine;
if (!engine.search) {
  console.log('No live search is configured, so searches return flagged sample data. Set SEARCH_PROVIDER (and its key / URL) in backend/.env first, then run: npm run doctor');
  await c.close(); process.exit(1);
}

const q = queries[mode]();
const trace = {};
const t0 = Date.now();
let results = [], failed = null;
try { results = await engine.dispatchQuery(q, { trace }); } catch (e) { failed = e; }

const line = (s = '') => console.log(s);
line(`\nQuery: ${JSON.stringify(q)}`);
line(`Took ${((Date.now() - t0) / 1000).toFixed(1)} s\n`);
line(`1. Sources     ${trace.activeSources ?? 0} active sources; ${trace.routed?.length ?? 0} routed for this item type`);
line(`   text sent to the search engine: "${trace.searchText}"`);
if (failed) {
  line(`2. Search      FAILED: ${failed.message}`);
  (trace.searches || []).forEach((s) => s.error && line(`   - ${s.error}`));
  line('\n=> The search service itself is failing, so the app would show "The search could not be completed". Run: npm run doctor');
} else {
  (trace.searches || []).forEach((s, i) => line(`2. Search ${i + 1}  (${s.kind})  ${s.error ? `FAILED: ${s.error}` : `${s.hits} results`}`));
  line(`3. Listings    ${trace.looked ?? 0} of the results looked like the item; ${trace.fromListings ?? 0} had a price you can read in the listing`);
  line(`   ${trace.approved ?? 0} pages are on approved sources; ${trace.picked ?? 0} needed a page visit`);
  (trace.dropped || []).slice(0, 8).forEach((d) => line(`   - ${d.url} -> ${d.why}`));
  line(`4. Pages       ${(trace.pages || []).length} opened:`);
  (trace.pages || []).forEach((p) => line(`   - ${p.url}\n       ${p.outcome}`));
  line(`5. Result      ${results.length} matched`);
  results.forEach((r) => line(`   - ${r.price} ${r.currency}  ${r.sourceName}  ${r.sourceUrl}  [${r.vintageBasis}${r.sourceId ? '' : ', unlisted'}]`));
  line('\nWhat this means:');
  const found = (trace.hits ?? 0) + (trace.shopping ?? 0);
  if (!found) line('=> The search service answered but found NOTHING. With SearXNG its engines may be blocked or slow: open http://localhost:8080 and try the same words in your browser; try again in a minute, or use Serper (it also returns shopping prices).');
  else if (!trace.looked) line('=> The search found pages, but none looked like the exact item. Check the make and model spelling, or search with the model only.');
  else if (!results.length) line('=> Some results looked like the item but none showed a price you can read. Read the reasons above. Serper (free, no card) adds Google Shopping prices, which solves this for most products.');
  else line('=> The search works end to end.');
}
await c.close();
process.exit(0);
