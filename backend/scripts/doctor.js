// Checks that the whole setup is connected: settings, search key, database, Redis, and every API endpoint.
//   npm run doctor                  settings + database + endpoints (the server must be running for the endpoint part)
//   npm run doctor -- --live-search also makes ONE real Brave request to prove the key works (uses 1 request of your quota; SearXNG is always tested)
//   npm run doctor -- --url http://localhost:4000
import 'dotenv/config';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const arg = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const base = (arg('--url', `http://localhost:${process.env.PORT || 4000}`)).replace(/\/$/, '');
const env = process.env;

let failures = 0, warnings = 0;
const out = (mark, label, detail = '') => console.log(`  ${mark}  ${label}${detail ? `  ${detail}` : ''}`);
const pass = (l, d) => out('PASS', l, d);
const warn = (l, d) => { warnings++; out('WARN', l, d); };
const fail = (l, d) => { failures++; out('FAIL', l, d); };
const section = (t) => console.log(`\n${t}`);

// ---------------------------------------------------------------- settings
section('1. Settings (backend/.env)');
{
  const { existsSync } = await import('node:fs');
  const file = new URL('../.env', import.meta.url);
  existsSync(file) ? pass('Settings file found', 'backend/.env') : fail('There is no backend/.env file', 'copy .env.demo.example to backend/.env (the file must be named exactly .env, not .env.txt)');
}
const major = Number(process.versions.node.split('.')[0]);
major >= 20 ? pass('Node.js', process.versions.node) : fail('Node.js 20 or newer is required', process.versions.node);

const store = env.DATA_STORE || 'prisma';
if (store !== 'memory' && !env.DATABASE_URL) fail('DATA_STORE is prisma but DATABASE_URL is not set', 'for the no-database demo set DATA_STORE=memory');
else pass('Data store', store === 'memory' ? 'memory (in-process; data is lost when the server stops)' : 'prisma (PostgreSQL)');
pass('Queue / cache', `${env.QUEUE || 'inline'} / ${env.CACHE || ((env.QUEUE || 'inline') === 'bull' ? 'redis' : 'memory')}`);

const secret = env.JWT_SECRET || '';
if (!secret) warn('JWT_SECRET is not set', 'a weak development secret is used; set a long random value');
else if (secret.length < 32 || /change-me|secret|password/i.test(secret)) warn('JWT_SECRET is short or looks like a placeholder', 'production refuses anything under 32 characters');
else pass('JWT_SECRET', `${secret.length} characters`);

const providers = (env.SEARCH_PROVIDER || '').toLowerCase().split(',').map((p) => p.trim()).filter(Boolean);
const placeholder = (v) => !v || /paste|your[-_ ]?key|xxx|changeme/i.test(v);
let searchReady = false;
const KEYED = { brave: 'BRAVE_API_KEY', serper: 'SERPER_API_KEY', tavily: 'TAVILY_API_KEY' };
for (const p of providers) {
  if (KEYED[p]) {
    if (placeholder(env[KEYED[p]])) providers.length > 1 ? warn(`${KEYED[p]} is empty`, `${p} will be skipped; the next provider in the list is used`) : fail(`${KEYED[p]} is missing or still the placeholder`, 'paste your real key into backend/.env');
    else { pass('Search provider', `${p}, key present`); searchReady = true; }
  } else if (p === 'searxng') {
    if (!env.SEARXNG_URL) fail('SEARXNG_URL is missing');
    else { pass('Search provider', `searxng at ${env.SEARXNG_URL}`); searchReady = true; }
  } else fail(`SEARCH_PROVIDER contains "${p}", which is not one of: searxng, serper, tavily, brave`);
}
if (!providers.length) warn('No search provider configured', 'results will be flagged sample/mock data. Set SEARCH_PROVIDER (and its key) for live prices.');
if (!env.SCRAPER_USER_AGENT || /your-?email|your\.name/i.test(env.SCRAPER_USER_AGENT)) warn('SCRAPER_USER_AGENT has no real contact address', 'sites you scrape should be able to reach you');
else pass('SCRAPER_USER_AGENT', env.SCRAPER_USER_AGENT);

pass('Registration rule', `@${(env.REGISTRATION_EMAIL_DOMAIN ?? 'gov.in') || 'any domain'}${env.REGISTRATION_CODE ? ' + invite code' : ''}`);
if (env.DEMO_QUICK_LOGIN === 'true') warn('DEMO_QUICK_LOGIN is on', 'anyone who can reach the server can sign in as admin. Fine on your laptop, never on a public server.');
if (env.DEMO_SEED === 'true') pass('Demo seeding', 'on (demo accounts and sample queries are created at start-up)');

// ---------------------------------------------------------------- search (SearXNG is free so it is always tested; a Brave key is tested only with --live-search)
section('2. Search');
if (!searchReady) out('SKIP', 'no search provider configured');
else {
  const { buildScrapeEngine } = await import('../scrapers/buildEngine.js');
  const built = buildScrapeEngine(env, { listActive: async () => [] });
  const live = built.search;
  // Test each configured provider on its own, so the message says WHICH one is broken. Free ones always; hosted ones only with --live-search (uses 1 request of the allowance).
  const parts = live?.providers || (live ? [live] : []);
  for (const part of parts) {
    const name = part.constructor.name.replace('SearchProvider', '').replace('Provider', '');
    if (!(part.constructor.name === 'SearxngProvider') && !flag('--live-search')) { out('SKIP', `${name}: not tested`, 'add --live-search to make one real request (uses 1 request of your allowance)'); continue; }
    try {
      const hits = await part.search('software defined radio price', { count: 5, signal: AbortSignal.timeout(30000) });
      hits.length ? pass(`${name}: live search`, `${hits.length} result(s), first: ${hits[0].url}`) : warn(`${name}: answered with no results`, 'try again in a minute');
    } catch (e) {
      const code = /HTTP (\d+)/.exec(e.message)?.[1];
      const why = part.constructor.name === 'SearxngProvider'
        ? ({ 403: 'SearXNG refused the JSON format: check searxng/settings.yml lists json under search.formats, then recreate it' }[code] || (/fetch failed|ECONNREFUSED/.test(e.message) ? 'SearXNG is not running: docker compose -f docker-compose.search.yml up -d' : ''))
        : { 400: 'the request was rejected', 401: 'the key is wrong', 403: 'the key is not allowed: check the account is active', 422: 'the request was rejected', 429: 'rate or credit limit reached' }[code];
      fail(`${name}: live search failed`, `${e.message}${why ? ` (${why})` : ''}`);
    }
  }
}

// ---------------------------------------------------------------- database + redis
section('3. Database and Redis');
if (store === 'memory') pass('Database', 'in-memory store, nothing to connect');
else {
  try {
    const { PrismaClient } = await import('@prisma/client');
    const p = new PrismaClient();
    const [users, items, services, sources, queries] = await Promise.all([p.user.count(), p.itemType.count(), p.serviceType.count(), p.source.count(), p.query.count()]);
    pass('PostgreSQL reachable', `${users} users, ${items} item types, ${services} service types, ${sources} sources, ${queries} queries`);
    if (!items || !sources) fail('The database is empty', 'run: npx prisma db push && npm run db:seed && npm run db:seed:demo');
    await p.$disconnect();
  } catch (e) { fail('PostgreSQL is not reachable', `${e.message.split('\n').pop()}. Is "docker compose up -d" running and DATABASE_URL correct?`); }
}
if ((env.QUEUE || 'inline') === 'bull' || env.CACHE === 'redis') {
  try {
    const { RedisCache } = await import('../cache/RedisCache.js');
    const c = new RedisCache({ redisUrl: env.REDIS_URL || 'redis://localhost:6379', prefix: 'casper:doctor:' });
    await c.set('ping', { ok: true }, 5);
    (await c.get('ping'))?.ok ? pass('Redis reachable') : fail('Redis answered but did not return the test value');
    await c.close();
  } catch (e) { fail('Redis is not reachable', e.message); }
} else out('SKIP', 'Redis not used', '(QUEUE=inline)');

// ---------------------------------------------------------------- endpoints
section(`4. API endpoints at ${base}`);
const call = async (method, path, { token, body } = {}) => {
  try {
    const res = await fetch(`${base}/api${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) }, body: body && JSON.stringify(body), signal: AbortSignal.timeout(10000) });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  } catch (e) { return { status: 0, error: e.message }; }
};
const check = async (label, method, path, expect, opts) => {
  const r = await call(method, path, opts);
  r.status === expect ? pass(`${method} /api${path}`, `${label} -> ${r.status}`) : fail(`${method} /api${path}`, `${label}: expected ${expect}, got ${r.status || r.error}`);
  return r;
};

const health = await call('GET', '/health');
if (health.status !== 200) {
  fail('The server is not answering', `${base}/api/health -> ${health.status || health.error}. Start it in another terminal with "npm run dev", then run this again.`);
} else {
  pass('GET /api/health', 'server is up');
  const cfg = (await check('public sign-up settings', 'GET', '/auth/config', 200)).body;
  const sessions = {};
  if (cfg.demoLogin) {
    for (const role of ['admin', 'officer']) {
      const r = await check(`one-click ${role} sign-in`, 'POST', '/auth/demo', 200, { body: { role } });
      sessions[role] = r.body?.token;
    }
  } else if (env.ADMIN_EMAIL && env.ADMIN_PASSWORD) {
    const r = await check('admin sign-in with ADMIN_EMAIL', 'POST', '/auth/login', 200, { body: { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD } });
    sessions.admin = r.body?.token;
  } else warn('No demo sign-in and no ADMIN_EMAIL/ADMIN_PASSWORD', 'signed-in endpoints cannot be checked');

  const t = sessions.admin;
  if (t) {
    for (const [label, path] of [['item types for the forms', '/meta/item-types'], ['service types for the forms', '/meta/service-types'], ['home-page numbers', '/query/stats'], ['saved queries', '/query/history'],
      ['allow-listed sources', '/admin/sources'], ['item-type admin', '/admin/item-types'], ['service-type admin', '/admin/service-types'], ['curated rates', '/admin/rates']]) {
      await check(label, 'GET', path, 200, { token: t });
    }
    const hist = (await call('GET', '/query/history', { token: t })).body;
    hist?.items?.[0] && await check('open a saved query', 'GET', `/query/${hist.items[0].queryId}`, 200, { token: t });
  }
  if (sessions.officer) {
    await check('officer reads own history', 'GET', '/query/history', 200, { token: sessions.officer });
    await check('officer is kept out of admin', 'GET', '/admin/sources', 403, { token: sessions.officer });
  }
  await check('no token is refused', 'GET', '/query/history', 401);
}

console.log(`\n${failures ? `${failures} check(s) FAILED` : 'All checks passed'}${warnings ? `, ${warnings} warning(s)` : ''}.`);
process.exit(failures ? 1 : 0);
