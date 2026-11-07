import { ISearchProvider } from '../ISearchProvider.js';

/**
 * Tries several search providers in order (SEARCH_PROVIDER=serper,searxng) and uses the first that answers with results.
 * A provider that throws (key rejected, container down, every engine timed out) is skipped with a warning; one that
 * answers with nothing is also skipped, because "nothing" from a half-working service is not an answer.
 * If every provider threw, the last error is thrown, so a dead search service is reported as such and never as "no data".
 */
export class FallbackSearchProvider extends ISearchProvider {
  constructor(providers, logger = console) {
    super();
    this.providers = providers;
    this.logger = logger;
    if (providers.some((p) => typeof p.searchProducts === 'function')) {
      this.searchProducts = (text, opts) => this.#first('searchProducts', text, opts);
    }
  }

  search(text, opts) { return this.#first('search', text, opts); }

  async #first(method, text, opts) {
    let lastError = null, answered = false;
    for (const p of this.providers) {
      if (typeof p[method] !== 'function') continue;
      try {
        const out = await p[method](text, opts);
        answered = true;
        if (out.length) return out;
      } catch (e) {
        lastError = e;
        this.logger.warn(`[engine] ${p.constructor.name}: ${e.message}`);
      }
    }
    if (answered) return [];
    throw lastError ?? new Error('No search provider is available');
  }
}
