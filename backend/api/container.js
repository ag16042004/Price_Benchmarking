import { AuthService } from '../services/AuthService.js';
import { QueryService } from '../services/QueryService.js';
import { SourceRepository } from '../services/SourceRepository.js';
import { AdminService } from '../services/AdminService.js';
import { createRateLimiter } from './middleware/rateLimit.js';
import { MemoryCache } from '../cache/MemoryCache.js';
import { NoCache } from '../cache/NoCache.js';
import { RedisCache } from '../cache/RedisCache.js';
import { buildScrapeEngine } from '../scrapers/buildEngine.js';
import { InlineQueue } from '../queue/InlineQueue.js';
import { BullQueue } from '../queue/BullQueue.js';
import { RecordingEngine, ReplayEngine } from '../scrapers/demo/DemoEngines.js';
import { createMemoryRepos } from '../database/repositories/memoryRepos.js';
import { fileURLToPath } from 'node:url';
import { demoAccounts, ensureUser, seedDemo } from '../services/DemoSeeder.js';

/**
 * Composition root: the only place concrete classes are chosen.
 * `overrides` ({ scrapeEngine, queue, cache }) lets tests inject fakes.
 */
export async function buildContainer(env = process.env, overrides = {}) {
  let repos;
  if ((env.DATA_STORE || 'prisma') === 'memory') {
    repos = createMemoryRepos();
  } else {
    // The default store is the real database. Without a connection string every sign-up would die with an unreadable 500.
    if (!env.DATABASE_URL) {
      throw new Error('DATA_STORE is "prisma" (the default) but DATABASE_URL is not set, so there is no database to use.\n'
        + '  For the no-database demo: copy .env.demo.example to backend/.env (it sets DATA_STORE=memory), then restart.\n'
        + '  For PostgreSQL: set DATABASE_URL in backend/.env (see docs/RUN_GUIDE.md, section 12).');
    }
    const { PrismaClient } = await import('@prisma/client'); // lazy: memory mode needs no generated client
    const { createPrismaRepos } = await import('../database/repositories/prismaRepos.js');
    repos = createPrismaRepos(new PrismaClient());
  }

  let jwtSecret = env.JWT_SECRET;
  // Anyone who knows the secret can forge a login for any user, so production refuses a short or placeholder one.
  if (env.NODE_ENV === 'production' && (jwtSecret || '').length < 32) throw new Error('JWT_SECRET must be set in production (at least 32 characters)');
  if (!jwtSecret) {
    jwtSecret = 'dev-only-secret';
    console.warn('JWT_SECRET not set: using an insecure development secret');
  }

  const sourceRepository = new SourceRepository({ sourceDataRepo: repos.sourceDataRepo });
  let scrapeEngine = overrides.scrapeEngine || buildScrapeEngine(env, sourceRepository);
  // Demo safety net. record: live searches are saved to a file. replay: that file answers instead of the internet.
  const snapshotFile = env.DEMO_SNAPSHOTS || fileURLToPath(new URL('../demo/snapshots.json', import.meta.url));
  if (env.DEMO_MODE === 'record') scrapeEngine = new RecordingEngine({ engine: scrapeEngine, file: snapshotFile });
  else if (env.DEMO_MODE === 'replay') scrapeEngine = new ReplayEngine({ file: snapshotFile });
  const queue = overrides.queue || ((env.QUEUE || 'inline') === 'bull'
    ? new BullQueue({ redisUrl: env.REDIS_URL || 'redis://localhost:6379' })
    : new InlineQueue());

  // The API and a separate worker only share a cache if it lives in Redis, so QUEUE=bull implies CACHE=redis.
  const cacheMode = env.CACHE || ((env.QUEUE || 'inline') === 'bull' ? 'redis' : 'memory');
  const cache = overrides.cache || (cacheMode === 'redis' ? new RedisCache({ redisUrl: env.REDIS_URL || 'redis://localhost:6379' })
    : cacheMode === 'off' ? new NoCache() : new MemoryCache());

  const limiters = {
    auth: createRateLimiter({ windowMs: 15 * 60_000, max: Number(env.AUTH_RATE_LIMIT || 30), keyFn: (req) => req.ip }),
    query: createRateLimiter({ windowMs: 3_600_000, max: Number(env.QUERY_RATE_LIMIT_PER_HOUR || 30), keyFn: (req) => `u${req.user.id}` }),
  };

  const registrationCode = env.REGISTRATION_CODE || '';
  const authService = new AuthService({ userRepo: repos.userRepo, jwtSecret, registrationCode });
  const queryService = new QueryService({ ...repos, scrapeEngine, queue, cache, sourceRepository, cacheTtlSeconds: Number(env.CACHE_TTL_SECONDS || 6 * 3600) });
  const adminService = new AdminService({ ...repos, cache });

  // Demo mode: a one-click sign-in for the seeded admin and officer. Never leave this on for a public deployment.
  const demo = { quickLogin: env.DEMO_QUICK_LOGIN === 'true', accounts: demoAccounts(env) };
  if (demo.quickLogin && env.NODE_ENV === 'production' && env.ALLOW_DEMO_LOGIN_IN_PRODUCTION !== 'true') {
    throw new Error('DEMO_QUICK_LOGIN lets anyone sign in as admin. It is refused in production unless ALLOW_DEMO_LOGIN_IN_PRODUCTION=true');
  }
  if (demo.quickLogin) console.warn('[demo] DEMO_QUICK_LOGIN is ON: anyone who can reach this server can sign in as the demo admin.');

  if (env.DEMO_SEED === 'true') {
    const r = await seedDemo({ userRepo: repos.userRepo, queryRepo: repos.queryRepo, env });
    console.log(`[demo] seeded accounts ${r.accounts.admin.email} and ${r.accounts.officer.email}; ${r.sampleQueriesCreated} sample queries created`);
  } else if ((env.DATA_STORE || 'prisma') === 'memory' && env.ADMIN_EMAIL && env.ADMIN_PASSWORD) {
    // Memory mode has no seed script, so it can create the first admin from the environment.
    await ensureUser(repos.userRepo, { name: 'Administrator', email: env.ADMIN_EMAIL.toLowerCase(), password: env.ADMIN_PASSWORD, role: 'ADMIN' });
  }

  const startWorker = () => queue.startWorker((job) => queryService.processQuery(job));
  if (queue.kind === 'inline') startWorker();           // inline mode always processes in-process

  const close = async () => { await queue.close(); await cache.close(); };
  return { ...repos, authService, registrationCode, demo, queryService, adminService, sourceRepository, scrapeEngine, queue, cache, limiters, startWorker, close };
}
