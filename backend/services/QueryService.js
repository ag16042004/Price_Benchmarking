import { HttpError, ValidationError } from '../models/errors.js';
import { ResultItem } from '../models/ResultItem.js';
import { validateExactMatch, validateSpecification, validateService } from '../models/validators.js';
import { fingerprint } from './queryFingerprint.js';
import { summaryOf } from '../models/queryLabel.js';

const PENDING_TIMEOUT_MS = 3 * 60 * 1000;
const TYPES = ['EXACT_MATCH', 'SPECIFICATION', 'SERVICE'];
const clamp = (v, lo, hi, dflt) => { const n = Number.parseInt(v, 10); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt; };

// "No data" may be a short outage, not a fact about the world, so it is remembered for minutes, not hours.
const NO_DATA_TTL_SECONDS = 600;

/**
 * Orchestrates query processing. Depends only on repositories, the queue, the cache, and the
 * scrape-engine interface (dispatchQuery), never on concrete scrapers or providers.
 */
export class QueryService {
  constructor({ queryRepo, categoryRepo, rateRepo, scrapeEngine, queue, cache, sourceRepository, cacheTtlSeconds = 6 * 3600 }) {
    Object.assign(this, { queryRepo, categoryRepo, rateRepo, scrapeEngine, queue, cache, sourceRepository, cacheTtlSeconds });
  }

  // ------------------------------------------------------------ submit
  async submitExactMatch(user, input, opts) {
    const v = validateExactMatch(input, await this.#names(this.categoryRepo.listItemTypes()));   // 400 before anything is persisted
    return this.#submit(user, { queryType: 'EXACT_MATCH', itemName: v.itemName, itemTypeName: v.itemType, make: v.make, model: v.model }, opts);
  }

  async submitSpecification(user, input, opts) {
    const v = validateSpecification(input, await this.#names(this.categoryRepo.listItemTypes()));
    return this.#submit(user, { queryType: 'SPECIFICATION', itemName: v.itemName, itemTypeName: v.itemType, specifications: v.specs }, opts);
  }

  async submitService(user, input, opts) {
    const v = validateService(input, await this.#names(this.categoryRepo.listServiceTypes()));
    return this.#submit(user, { queryType: 'SERVICE', serviceTypeName: v.serviceType, location: v.location, description: v.description }, opts);
  }

  async #names(listPromise) { return (await listPromise).map((t) => t.name); }

  #key(q) { return `q:${fingerprint({ ...q, itemType: q.itemType ?? q.itemTypeName, serviceType: q.serviceType ?? q.serviceTypeName })}`; }
  async #cacheGet(key) { try { return await this.cache.get(key); } catch { return null; } }       // a cache outage never breaks a query
  async #cacheSet(key, v, ttl = this.cacheTtlSeconds) { try { await this.cache.set(key, v, ttl); } catch { /* ignore */ } }

  /** Cache hit: finished immediately, no job. Miss (or refresh): persist PENDING, enqueue, client polls. */
  async #submit(user, fields, { refresh = false } = {}) {
    const query = await this.queryRepo.create({ userId: user.id, ...fields });
    if (!refresh) {
      const hit = await this.#cacheGet(this.#key(fields));
      if (hit) {
        await this.queryRepo.complete(query.id, { results: hit.results.map((r) => new ResultItem(r)), noDataFlag: hit.noDataFlag, fromCache: true });
        return { queryId: query.id, status: hit.noDataFlag ? 'NO_DATA' : 'COMPLETED', fromCache: true };
      }
    }
    try {
      await this.queue.enqueue({ queryId: query.id });
    } catch {
      await this.queryRepo.fail(query.id);
      throw new HttpError(503, 'The search service is unavailable right now. Please try again shortly.');
    }
    return { queryId: query.id, status: 'PENDING' };
  }

  // ------------------------------------------------------------ worker
  /** Worker entry point. Never throws: a failure becomes status FAILED. */
  async processQuery({ queryId }) {
    const q = await this.queryRepo.findById(queryId);
    if (!q || q.status !== 'PENDING') return;
    try {
      let raw = [], engineError = null;
      try { raw = await this.scrapeEngine.dispatchQuery(q); } catch (e) { engineError = e; }
      const diagnosis = raw?.diagnosis ?? null;

      // Admin-curated rates answer service queries even when scraping finds nothing (or the search provider is down).
      const curated = q.queryType === 'SERVICE'
        ? (await this.rateRepo.findMatching({ serviceType: q.serviceType, city: (q.location || '').split(',')[0].trim() })).map((r) => ({
          price: r.price, currency: r.currency, sourceUrl: r.sourceUrl, sourceName: `${r.sourceName} (curated)`,
          itemDetails: r.description || `${q.serviceType} in ${r.location}`, vintage: r.vintage, vintageBasis: 'curated', matchScore: 1, isMock: false,
        }))
        : [];
      if (engineError && curated.length === 0) throw engineError;

      const results = [...curated, ...raw].map((r) => new ResultItem(r));
      const noDataFlag = results.length === 0;
      await this.queryRepo.complete(q.id, { results, noDataFlag, diagnosis: noDataFlag ? diagnosis : null });
      if (!results.some((r) => r.isMock || r.isReplay)) await this.#cacheSet(this.#key(q), { results: results.map((r) => ({ ...r })), noDataFlag }, noDataFlag ? NO_DATA_TTL_SECONDS : undefined); // mock and replayed data are never cached
    } catch (err) {
      console.error(`[query ${q.id}] failed: ${err.message}`);
      await this.queryRepo.fail(q.id);
    }
  }

  // ------------------------------------------------------------ read
  async getQuery(user, id) {
    const n = Number(id);
    const q = Number.isInteger(n) && n > 0 ? await this.queryRepo.findById(n) : null;
    // 404 (not 403) for other people's queries so ids are not probeable.
    if (!q || (q.userId !== user.id && user.role !== 'ADMIN')) throw new HttpError(404, 'Query not found');
    if (q.status === 'PENDING' && Date.now() - new Date(q.createdAt) > PENDING_TIMEOUT_MS) {
      await this.queryRepo.fail(q.id);                   // worker died or Redis lost the job
      q.status = 'FAILED';
    }
    return {
      queryId: q.id,
      status: q.status,
      noDataFlag: q.noDataFlag,
      diagnosis: q.noDataFlag ? q.diagnosis ?? null : null,
      fromCache: !!q.servedFromCache,
      query: {
        queryType: q.queryType, itemName: q.itemName, itemType: q.itemType, make: q.make, model: q.model,
        specifications: q.specifications || [], serviceType: q.serviceType ?? null, location: q.location ?? null,
        description: q.description ?? null, createdAt: q.createdAt,
      },
      results: q.results.map((r) => new ResultItem(r).toJSON()),
    };
  }

  /** FR-8: the user's own past queries, newest first. Re-opening one shows the stored results (no re-scrape). */
  async listHistory(user, params = {}) {
    const type = params.type ? String(params.type).toUpperCase() : undefined;
    if (type && !TYPES.includes(type)) throw new ValidationError({ type: 'Unknown query type' });
    const page = clamp(params.page, 1, 100000, 1), pageSize = clamp(params.pageSize, 1, 50, 10);
    const search = typeof params.search === 'string' ? params.search.trim().slice(0, 100) : '';
    const { items, total } = await this.queryRepo.listByUser(user.id, { page, pageSize, type, search: search || undefined });
    return {
      page, pageSize, total,
      items: items.map((q) => ({
        queryId: q.id, queryType: q.queryType, summary: summaryOf(q), status: q.status, noDataFlag: q.noDataFlag,
        resultCount: q.resultCount ?? 0, fromCache: !!q.servedFromCache, createdAt: q.createdAt,
      })),
    };
  }

  /** Dashboard numbers. Only things we can count honestly. */
  async stats(user) {
    const [counts, recent, active] = await Promise.all([
      this.queryRepo.countsByUser(user.id), this.listHistory(user, { page: 1, pageSize: 5 }), this.sourceRepository.listActive(),
    ]);
    return { ...counts, activeSources: active.length, recent: recent.items };
  }
}
