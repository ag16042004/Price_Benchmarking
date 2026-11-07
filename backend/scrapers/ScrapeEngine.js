import { SourceRepository } from '../services/SourceRepository.js';
import { routeSources } from './sourceRouting.js';
import { extractListing } from './extraction/extractListing.js';
import { strategyFor } from './queryStrategy.js';
import { dedupe } from './extraction/dedupe.js';
import { bestPrice, leadingDate } from './extraction/textPrice.js';

const DEFAULTS = { maxDomains: 32, domainsPerSearch: 8, siteGroups: 2, maxCandidates: 12, perDomain: 2, maxListings: 120, maxResults: 40, overallMs: 45_000 };

// Sources in these categories are used through search listings and shopping data only: their pages are never opened,
// because retailers', marketplaces' and portals' terms usually forbid automated access.
const NO_FETCH_CATEGORIES = new Set(['Retailer', 'Marketplace', 'Government', 'Services']);

const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const urlKey = (u) => { try { const x = new URL(u); return `${x.host}${x.pathname.replace(/\/+$/, '')}`.toLowerCase(); } catch { return String(u); } };

/**
 * The only component allowed to talk to the outside world (TRD §1).
 * dispatchQuery(query, { trace }) -> raw results ([] means "no reliable data"); throws only if every search failed.
 *
 * Where a price can come from (cheapest and most reliable first):
 *   1. SHOPPING listings from the search provider (merchant, title and price already structured), when it has them.
 *   2. The search RESULT itself: its title and snippet name the item and often print the price. No page visit,
 *      so sites that refuse robots (HTTP 403) or draw prices with JavaScript cannot block it.
 *   3. The PAGE, only for approved sources whose listing showed no price (fetched politely: robots.txt, rate limit).
 * Sources outside the administrator's approved list are used for 1 and 2 only (we never fetch their pages) and are
 * flagged "unlisted" so an officer sees it. Set allowUnlisted=false to keep to approved sources only.
 *
 * Every call logs one summary line showing where candidates dropped out and fills `trace` (if given).
 */
export class ScrapeEngine {
  constructor({ searchProvider, scraper, sourceRepository, logger = console, limits = {}, allowUnlisted = true }) {
    Object.assign(this, { search: searchProvider, scraper, sources: sourceRepository, logger, allowUnlisted });
    this.limits = { ...DEFAULTS, ...limits };
  }

  async dispatchQuery(query, { trace = {} } = {}) {
    const L = this.limits;
    const active = await this.sources.listActive();
    Object.assign(trace, { activeSources: active.length, searches: [], dropped: [], pages: [], hits: 0, approved: 0, looked: 0, shopping: 0, fromListings: 0 });

    const signal = AbortSignal.timeout(L.overallMs);               // NFR-1: bounded wait
    const strategy = strategyFor(query);
    const routed = routeSources(active, strategy.routeKey, L.maxDomains);
    const text = strategy.searchText;
    Object.assign(trace, { searchText: text, routed: routed.map((s) => s.domain) });

    // 1. Discovery (FR-11): the search API finds candidates; we never crawl blindly.
    const jobs = [];
    if (this.allowUnlisted) jobs.push({ kind: 'web', run: () => this.search.search(text, { count: 20, signal }) });
    // Approved sites in groups of domainsPerSearch (best-ranked first), at most siteGroups searches.
    for (let g = 0; g < L.siteGroups; g++) {
      const group = routed.slice(g * L.domainsPerSearch, (g + 1) * L.domainsPerSearch);
      if (group.length) jobs.push({ kind: 'approved sites', run: () => this.search.search(text, { domains: group.map((s) => s.domain), count: 20, signal }) });
    }
    if (typeof this.search.searchProducts === 'function' && query.queryType !== 'SERVICE') jobs.push({ kind: 'shopping', run: () => this.search.searchProducts(text, { count: 30, signal }) });
    if (!jobs.length) { this.#summarize(trace); return this.#withDiagnosis([], trace); }

    const settled = await Promise.allSettled(jobs.map((j) => j.run()));
    settled.forEach((r, i) => trace.searches.push({ kind: jobs[i].kind, hits: r.status === 'fulfilled' ? r.value.length : 0, error: r.status === 'rejected' ? r.reason?.message : null }));
    settled.filter((r) => r.status === 'rejected').forEach((r) => this.logger.warn(`[engine] search failed: ${r.reason?.message}`));
    if (settled.every((r) => r.status === 'rejected')) throw new Error('Search provider failed');
    const got = (kind) => settled.flatMap((r, i) => (r.status === 'fulfilled' && jobs[i].kind === kind ? r.value : []));
    const organic = [...got('web'), ...got('approved sites')];
    const offers = got('shopping');
    trace.shopping = offers.length;

    const results = [];
    const now = new Date();
    const matchListing = strategy.matchListing || strategy.match;
    const listingResult = ({ price, url, name, src, title, vintage, score }) => ({
      price: price.amount, currency: price.currency, sourceUrl: url, sourceName: name, sourceId: src?.id ?? null,
      itemDetails: title, vintage, vintageBasis: 'listing', matchScore: score ?? 1, isMock: false,
    });

    // 2a. Shopping listings: structured, so the price is trusted as given; the title must still be the item asked for.
    for (const o of offers) {
      const price = bestPrice(String(o.price ?? ''));
      const verdict = matchListing({ title: o.title || '', url: o.url || '', text: o.merchant || '' });
      if (verdict.matches) trace.looked++;
      if (!price || !verdict.matches || !o.url) continue;
      const src = SourceRepository.match(o.url, active);
      if (!src && !this.allowUnlisted) continue;
      results.push(listingResult({ price, url: o.url, name: o.merchant || hostOf(o.url), src, title: o.title, vintage: now, score: verdict.score }));
    }

    // 2b. Search results: read the price from the listing; remember approved pages that still need a visit.
    const seen = new Set(), perHost = new Map(), pageCandidates = [];
    for (const h of organic) {
      if (!h?.url) continue;
      const key = urlKey(h.url);
      if (seen.has(key)) continue;
      seen.add(key);
      if (seen.size > L.maxListings) break;
      trace.hits++;
      const src = SourceRepository.match(h.url, active);
      if (src) trace.approved++;
      if (!src && !this.allowUnlisted) { trace.dropped.push({ url: h.url, why: 'not on an approved source' }); continue; }

      const doc = { title: h.title || '', url: h.url, text: h.snippet || '' };
      const verdict = matchListing(doc);
      if (verdict.matches) trace.looked++;
      const price = verdict.matches ? bestPrice(`${doc.title} . ${doc.text}`) : null;
      if (price) {
        results.push(listingResult({ price, url: h.url, name: src?.name || hostOf(h.url), src, title: h.title, vintage: leadingDate(h.snippet, now) || now, score: verdict.score }));
        continue;
      }
      if (src && !NO_FETCH_CATEGORIES.has(src.category) && pageCandidates.length < L.maxCandidates && (perHost.get(src.domain) || 0) < L.perDomain) {
        perHost.set(src.domain, (perHost.get(src.domain) || 0) + 1);
        pageCandidates.push({ ...h, source: src });
      } else {
        trace.dropped.push({ url: h.url, why: verdict.matches ? 'looks like the item, but the listing shows no price' : 'not the item asked for' });
      }
    }
    trace.fromListings = results.length;

    // 3. Fork / join (NFR-4): approved pages that need a visit run concurrently; one failure never aborts the others.
    const notes = new Map();
    const pageSettled = await Promise.allSettled(pageCandidates.map((c) => this.#scrapeOne(c, strategy, active, signal, notes)));
    pageSettled.forEach((r, i) => {
      if (r.status === 'rejected') this.logger.warn(`[engine] skipped ${pageCandidates[i].url}: ${r.reason?.message}`);
      trace.pages.push({ url: pageCandidates[i].url, outcome: r.status === 'rejected' ? `skipped: ${r.reason?.message}` : r.value.length ? 'matched' : notes.get(pageCandidates[i].url) || 'no result' });
    });
    trace.picked = pageCandidates.length;

    // 4. Page-verified results first, then listing prices; one row per page, capped per site.
    const pageResults = pageSettled.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
    const final = dedupe([...pageResults, ...results], { perDomain: 4 }).slice(0, L.maxResults);
    trace.results = final.length;
    this.#summarize(trace);
    return this.#withDiagnosis(final, trace);
  }

  /** A short, user-safe summary of where candidates dropped out, carried on the array (not enumerable, so it never leaks into results). */
  #withDiagnosis(results, t) {
    const pages = t.pages || [];
    const refused = pages.filter((p) => /HTTP (403|429)/.test(p.outcome));
    const diagnosis = {
      searched: t.hits ?? 0,
      shopping: t.shopping ?? 0,
      looked: t.looked ?? 0,
      fromListings: t.fromListings ?? 0,
      approved: t.approved ?? 0,
      refused: refused.length,
      refusedSites: [...new Set(refused.map((p) => hostOf(p.url)))].filter(Boolean).slice(0, 4),
      opened: pages.filter((p) => !p.outcome.startsWith('skipped')).length,
      withPrice: pages.filter((p) => p.outcome === 'matched' || p.outcome.startsWith('price found')).length,
    };
    Object.defineProperty(results, 'diagnosis', { value: diagnosis, enumerable: false });
    return results;
  }

  #summarize(t) {
    const pages = t.pages || [];
    const opened = pages.filter((p) => !p.outcome.startsWith('skipped')).length;
    const priced = pages.filter((p) => p.outcome === 'matched' || p.outcome.startsWith('price found')).length;
    if (!t.results) {
      (t.dropped || []).slice(0, 5).forEach((d) => this.logger.info?.(`[engine]   - ${d.url} -> ${d.why}`));
      pages.slice(0, 6).forEach((p) => this.logger.info?.(`[engine]   - ${p.url} -> ${p.outcome}`));
    }
    this.logger.info?.(`[engine] ${t.searchText ?? '(no search)'} | search: ${t.hits} pages (${t.approved} approved)${t.shopping ? `, ${t.shopping} shopping listings` : ''} | ${t.looked} looked like the item, ${t.fromListings} with a price in the listing | pages opened ${opened}, ${priced} with a price | ${t.results ?? 0} results`);
  }

  async #scrapeOne(candidate, strategy, active, signal, notes) {
    const page = await this.scraper.scrape(candidate.url, { signal, isAllowed: (u) => !!SourceRepository.match(u, active) });
    const owner = SourceRepository.match(page.finalUrl, active);   // a redirect must not leave the allow-list
    if (!owner) throw new Error(`redirected off the allow-list (${page.finalUrl})`);

    const listing = extractListing(page);
    if (!listing) { notes.set(candidate.url, 'opened, but no price recognised (the price may load with JavaScript)'); return []; }
    const verdict = strategy.match({ title: listing.title || candidate.title, url: page.finalUrl, text: listing.text });
    if (!verdict.matches) { notes.set(candidate.url, `price found, but the page is not the item asked for ("${(listing.title || '').slice(0, 60)}")`); return []; }

    return [{
      price: listing.price, currency: listing.currency,
      sourceUrl: page.finalUrl, sourceName: owner.name, sourceId: owner.id,
      itemDetails: listing.title, vintage: listing.vintage, vintageBasis: listing.vintageBasis, matchScore: verdict.score, isMock: false,
    }];
  }
}
