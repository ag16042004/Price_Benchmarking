// Usage: node scripts/smoke.js https://your-app.onrender.com [--expect-results] [--make Dell --model "Latitude 5430" --type "Computers & Accessories"]
// Checks a running deployment end to end: health, web app, register, query, results. Exit code 0 = healthy.
const args = process.argv.slice(2);
const base = (args.find((a) => a.startsWith('http')) || process.env.BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
const flag = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const expectResults = args.includes('--expect-results');
const make = flag('make', 'Dell'), model = flag('model', 'Latitude 5430'), itemType = flag('type', 'Computers & Accessories');

let failed = false;
const ok = (m) => console.log(`  ok    ${m}`);
const bad = (m) => { failed = true; console.log(`  FAIL  ${m}`); };
const json = async (path, opts = {}) => {
  const res = await fetch(base + path, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  return { status: res.status, body: await res.json().catch(() => null) };
};

console.log(`Smoke test: ${base}   (a free-tier service may take a minute to wake up)`);
let health;
for (let i = 0; i < 18 && !health; i++) {                      // up to ~90 s for a cold start
  try { const r = await json('/api/health'); if (r.status === 200) health = r.body; } catch { /* still waking */ }
  if (!health) await new Promise((r) => setTimeout(r, 5000));
}
if (!health) { bad('health check never answered'); process.exit(1); }
ok(`health ${health.status}`);

const page = await fetch(base + '/').then((r) => r.text()).catch(() => '');
page.includes('id="root"') ? ok('web app is served') : console.log('  note  no web app at / (API-only deployment?)');

const email = `smoke+${Date.now()}@example.gov.in`, password = 'smoke-test-pass-1';
const reg = await json('/api/auth/register', { method: 'POST', body: JSON.stringify({ name: 'Smoke Test', email, password }) });
reg.status === 201 ? ok('register') : bad(`register -> ${reg.status} ${JSON.stringify(reg.body)}`);
const auth = { Authorization: `Bearer ${reg.body?.token}` };

const types = await json('/api/meta/item-types', { headers: auth });
types.body?.length ? ok(`${types.body.length} item types seeded`) : bad('no item types (was the database seeded?)');

const sub = await json('/api/query/exact-match', { method: 'POST', headers: auth, body: JSON.stringify({ itemName: model, itemType, make, model, refresh: true }) });
[200, 202].includes(sub.status) ? ok(`query accepted (${sub.status})`) : bad(`query -> ${sub.status} ${JSON.stringify(sub.body)}`);

let result;
for (let i = 0; i < 45 && sub.body?.queryId; i++) {
  result = (await json(`/api/query/${sub.body.queryId}`, { headers: auth })).body;
  if (result && result.status !== 'PENDING') break;
  await new Promise((r) => setTimeout(r, 2000));
}
if (!result || result.status === 'PENDING') bad('query still pending after 90 s (is the worker running?)');
else if (result.status === 'FAILED') bad('query FAILED (search provider key or quota?)');
else {
  ok(`query ${result.status}: ${result.results.length} result(s)`);
  const mock = result.results.some((r) => r.isMock);
  if (mock) console.log('  note  results are MOCK: no search provider is configured on this deployment');
  if (expectResults && (result.results.length === 0 || mock)) bad('expected real results');
  result.results.slice(0, 3).forEach((r) => console.log(`        ${r.formattedPrice}  ${r.sourceName}  ${r.sourceUrl}`));
}
console.log(failed ? '\nSMOKE TEST FAILED' : '\nSmoke test passed');
process.exit(failed ? 1 : 0);
