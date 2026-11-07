import { ScrapeEngine } from '../scrapers/ScrapeEngine.js';
import { CheerioScraper } from '../scrapers/CheerioScraper.js';
import { RobotsGuard } from '../scrapers/net/RobotsGuard.js';
import { DomainRateLimiter } from '../scrapers/net/DomainRateLimiter.js';
import { FixtureSearchProvider } from '../scrapers/search/FixtureSearchProvider.js';
import { SourceRepository } from '../services/SourceRepository.js';
import { createMemoryRepos } from '../database/repositories/memoryRepos.js';

/** Fake internet: URL -> {html}|{status}|{throws}|{redirectTo}. robots.txt can be set per origin. Every URL asked for is recorded in `.requested`. */
export function fakeInternet(routes) {
  const fetchImpl = async (url) => {
    fetchImpl.requested.push(url);
    const r = routes[url];
    if (url.endsWith('/robots.txt')) return new Response(r || '', { status: r ? 200 : 404 });
    if (!r) return new Response('not found', { status: 404 });
    if (r.throws) throw new Error(r.throws);
    if (r.status) return new Response('err', { status: r.status });
    if (r.redirectTo) return new Response(null, { status: 302, headers: { location: r.redirectTo } });
    return new Response(r.html, { status: 200, headers: { 'content-type': 'text/html', ...(r.headers || {}) } });
  };
  fetchImpl.requested = [];
  return fetchImpl;
}

export function makeEngine(routes, candidates, logs = [], limits = {}, { sources } = {}) {
  const fetchImpl = fakeInternet(routes);
  const search = new FixtureSearchProvider(candidates.map((c) => (typeof c === 'string' ? { url: c, title: '' } : c)));
  const scraper = new CheerioScraper({
    userAgent: 'CASPERBot', fetchImpl,
    robots: new RobotsGuard({ userAgent: 'CASPERBot', fetchImpl }),
    limiter: new DomainRateLimiter({ minIntervalMs: 0 }),
  });
  const sourceDataRepo = sources ? { listSources: async () => sources } : createMemoryRepos().sourceDataRepo;
  const sourceRepository = new SourceRepository({ sourceDataRepo });
  const logger = { warn: (m) => logs.push(m), info() {} };
  return { engine: new ScrapeEngine({ searchProvider: search, scraper, sourceRepository, logger, limits }), search, requested: fetchImpl.requested };
}

