import { ISearchProvider, withSiteOperators } from '../ISearchProvider.js';

/** Brave Search API (own index). Key goes in X-Subscription-Token. */
export class BraveSearchProvider extends ISearchProvider {
  constructor({ apiKey, fetchImpl = fetch, endpoint = 'https://api.search.brave.com/res/v1/web/search' }) {
    super();
    if (!apiKey) throw new Error('BRAVE_API_KEY is required');
    Object.assign(this, { apiKey, fetchImpl, endpoint });
  }

  async search(text, { domains = [], count = 10, signal } = {}) {
    const params = new URLSearchParams({ q: withSiteOperators(text, domains), count: String(count) });
    const res = await this.fetchImpl(`${this.endpoint}?${params}`, {
      headers: { Accept: 'application/json', 'X-Subscription-Token': this.apiKey },
      signal,
    });
    if (!res.ok) throw new Error(`Brave search failed: HTTP ${res.status}`);
    const data = await res.json();
    return (data.web?.results || []).map((r) => ({ url: r.url, title: r.title, snippet: r.description }));
  }
}
