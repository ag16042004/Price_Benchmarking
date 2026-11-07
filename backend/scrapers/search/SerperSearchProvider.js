import { ISearchProvider, withSiteOperators } from '../ISearchProvider.js';

/** Serper (https://serper.dev): Google results as JSON. The key goes in the X-API-KEY header. `site:` operators work because the results are Google's. */
export class SerperSearchProvider extends ISearchProvider {
  constructor({ apiKey, fetchImpl = fetch, endpoint = 'https://google.serper.dev/search', shoppingEndpoint = 'https://google.serper.dev/shopping', country = 'in' }) {
    super();
    if (!apiKey) throw new Error('SERPER_API_KEY is required');
    Object.assign(this, { apiKey, fetchImpl, endpoint, shoppingEndpoint, country });
  }

  async search(text, { domains = [], count = 10, signal } = {}) {
    const res = await this.fetchImpl(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-KEY': this.apiKey },
      body: JSON.stringify({ q: withSiteOperators(text, domains), num: count, gl: this.country }),
      signal,
    });
    if (!res.ok) throw new Error(`Serper search failed: HTTP ${res.status}`);
    const data = await res.json();
    return (data.organic || []).map((r) => ({ url: r.link, title: r.title, snippet: r.snippet }));
  }

  /** Google Shopping: [{ title, url, merchant, price }] with price as printed (e.g. "₹86,990.00"). Costs one request, like a search. */
  async searchProducts(text, { count = 20, signal } = {}) {
    const res = await this.fetchImpl(this.shoppingEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-KEY': this.apiKey },
      body: JSON.stringify({ q: text, num: count, gl: this.country }),
      signal,
    });
    if (!res.ok) throw new Error(`Serper shopping failed: HTTP ${res.status}`);
    const data = await res.json();
    return (data.shopping || data.shopping_results || []).map((r) => ({ title: r.title, url: r.link || r.url, merchant: r.source || r.seller, price: r.price }));
  }
}
