import { HttpError, ValidationError } from '../models/errors.js';
import { validateCategory, validateRate, validateSource } from '../models/validators.js';

const KINDS = { 'item-types': 'item', 'service-types': 'service' };

export function parseId(raw) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) throw new HttpError(404, 'Not found');
  return n;
}

/**
 * Admin-managed configuration (FR-9, FR-10, curated rates). Nothing is hard-deleted:
 * "deactivate" keeps history intact because past results reference these rows.
 * Every write clears the result cache so a stale answer is never served after a change (NFR-8).
 */
export class AdminService {
  constructor({ sourceDataRepo, categoryRepo, rateRepo, cache }) {
    Object.assign(this, { sources: sourceDataRepo, categories: categoryRepo, rates: rateRepo, cache });
  }

  async #changed() {
    try { await this.cache.clear(); } catch (e) { console.error(`[cache] clear failed: ${e.message}`); }
  }
  static #nonEmpty(v) { if (!Object.keys(v).length) throw new ValidationError({ _: 'Nothing to update' }); }

  // ---- sources
  listSources() { return this.sources.listSources(); }

  async createSource(input) {
    const v = validateSource(input);
    if (await this.sources.findSourceByDomain(v.domain)) throw new HttpError(409, 'That domain is already on the list');
    const s = await this.sources.createSource(v);
    await this.#changed();
    return s;
  }

  async updateSource(rawId, input) {
    const id = parseId(rawId), v = validateSource(input, { partial: true });
    AdminService.#nonEmpty(v);
    if (v.domain) {
      const clash = await this.sources.findSourceByDomain(v.domain);
      if (clash && clash.id !== id) throw new HttpError(409, 'That domain is already on the list');
    }
    const s = await this.sources.updateSource(id, v);
    if (!s) throw new HttpError(404, 'Source not found');
    await this.#changed();
    return s;
  }

  // ---- categories (kind = 'item-types' | 'service-types')
  #kind(k) { if (!KINDS[k]) throw new HttpError(404, 'Not found'); return KINDS[k]; }
  listCategories(k) { return this.categories.list(this.#kind(k), { includeInactive: true }); }

  async createCategory(k, input) {
    const kind = this.#kind(k), v = validateCategory(input);
    if (await this.categories.findByName(kind, v.name)) throw new HttpError(409, 'A category with that name already exists');
    const row = await this.categories.create(kind, v);
    await this.#changed();
    return row;
  }

  async updateCategory(k, rawId, input) {
    const kind = this.#kind(k), id = parseId(rawId), v = validateCategory(input, { partial: true });
    AdminService.#nonEmpty(v);
    if (v.name) {
      const clash = await this.categories.findByName(kind, v.name);
      if (clash && clash.id !== id) throw new HttpError(409, 'A category with that name already exists');
    }
    const row = await this.categories.update(kind, id, v);
    if (!row) throw new HttpError(404, 'Category not found');
    await this.#changed();
    return row;
  }

  // ---- curated service rates
  listRates() { return this.rates.list(); }
  async #serviceTypeNames() { return (await this.categories.list('service', { includeInactive: false })).map((t) => t.name); }

  async createRate(input) {
    const v = validateRate(input, {}, await this.#serviceTypeNames());
    const r = await this.rates.create(v);
    await this.#changed();
    return r;
  }

  async updateRate(rawId, input) {
    const id = parseId(rawId), v = validateRate(input, { partial: true }, await this.#serviceTypeNames());
    AdminService.#nonEmpty(v);
    const r = await this.rates.update(id, v);
    if (!r) throw new HttpError(404, 'Rate not found');
    await this.#changed();
    return r;
  }
}
