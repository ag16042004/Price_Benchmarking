import { ScrapeEngine } from './ScrapeEngine.js';
import { StubScrapeEngine } from './StubScrapeEngine.js';
import { CheerioScraper } from './CheerioScraper.js';
import { RobotsGuard } from './net/RobotsGuard.js';
import { DomainRateLimiter } from './net/DomainRateLimiter.js';
import { BraveSearchProvider } from './search/BraveSearchProvider.js';
import { SearxngProvider } from './search/SearxngProvider.js';
import { SerperSearchProvider } from './search/SerperSearchProvider.js';
import { TavilySearchProvider } from './search/TavilySearchProvider.js';
import { FallbackSearchProvider } from './search/FallbackSearchProvider.js';

/** Picks the live engine when a search provider is configured; otherwise the flagged mock engine. */
export function buildScrapeEngine(env, sourceRepository, logger = console) {
  // SEARCH_PROVIDER may list several, e.g. "serper,searxng": tried in that order, skipping any that is not configured.
  const names = (env.SEARCH_PROVIDER || '').toLowerCase().split(',').map((n) => n.trim()).filter(Boolean);
  const make = {
    brave: () => env.BRAVE_API_KEY && new BraveSearchProvider({ apiKey: env.BRAVE_API_KEY }),
    serper: () => env.SERPER_API_KEY && new SerperSearchProvider({ apiKey: env.SERPER_API_KEY, country: env.SEARCH_COUNTRY || 'in' }),
    tavily: () => env.TAVILY_API_KEY && new TavilySearchProvider({ apiKey: env.TAVILY_API_KEY }),
    searxng: () => env.SEARXNG_URL && new SearxngProvider({ baseUrl: env.SEARXNG_URL }),
  };
  const providers = names.map((n) => make[n]?.()).filter(Boolean);
  const search = providers.length > 1 ? new FallbackSearchProvider(providers, logger) : providers[0] || null;

  if (!search) {
    if (env.NODE_ENV !== 'test') logger.warn('[engine] No search provider configured (SEARCH_PROVIDER + key). Using the MOCK engine; results are flagged mock.');
    return new StubScrapeEngine();
  }
  const userAgent = env.SCRAPER_USER_AGENT || 'CASPERBot/1.0 (academic price-benchmarking project)';
  const scraper = new CheerioScraper({
    userAgent,
    robots: new RobotsGuard({ userAgent }),
    limiter: new DomainRateLimiter({ minIntervalMs: Number(env.SCRAPE_MIN_INTERVAL_MS || 1500) }),
  });
  return new ScrapeEngine({ searchProvider: search, scraper, sourceRepository, logger, allowUnlisted: env.ALLOW_UNLISTED_SOURCES !== 'false', limits: { ...(env.SEARCH_SITE_GROUPS && { siteGroups: Number(env.SEARCH_SITE_GROUPS) }), ...(env.MAX_RESULTS && { maxResults: Number(env.MAX_RESULTS) }) } });
}
