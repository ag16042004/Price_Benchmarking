import { ISearchProvider } from '../ISearchProvider.js';

/** Tavily (https://tavily.com): search built for AI agents. The key (tvly-...) goes in a Bearer header; sites are limited with include_domains. */
export class TavilySearchProvider extends ISearchProvider {
  constructor({ apiKey, fetchImpl = fetch, endpoint = 'https://api.tavily.com/search' }) {
    super();
    if (!apiKey) throw new Error('TAVILY_API_KEY is required');
    Object.assign(this, { apiKey, fetchImpl, endpoint });
  }

  async search(text, { domains = [], count = 10, signal } = {}) {
    const res = await this.fetchImpl(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ query: text, max_results: count, search_depth: 'basic', ...(domains.length && { include_domains: domains }) }),
      signal,
    });
    if (!res.ok) throw new Error(`Tavily search failed: HTTP ${res.status}`);
    const data = await res.json();
    return (data.results || []).map((r) => ({ url: r.url, title: r.title, snippet: r.content }));
  }
}
