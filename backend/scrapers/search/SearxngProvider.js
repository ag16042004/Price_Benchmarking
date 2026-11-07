import { ISearchProvider, withSiteOperators } from '../ISearchProvider.js';

/** Self-hosted SearXNG (no API key). The instance must have the JSON format enabled. */
export class SearxngProvider extends ISearchProvider {
  constructor({ baseUrl, fetchImpl = fetch }) {
    super();
    if (!baseUrl) throw new Error('SEARXNG_URL is required');
    Object.assign(this, { baseUrl: baseUrl.replace(/\/+$/, ''), fetchImpl });
  }

  async search(text, { domains = [], count = 10, signal } = {}) {
    const params = new URLSearchParams({ q: withSiteOperators(text, domains), format: 'json' });
    const res = await this.fetchImpl(`${this.baseUrl}/search?${params}`, { headers: { Accept: 'application/json' }, signal });
    if (!res.ok) throw new Error(`SearXNG search failed: HTTP ${res.status}`);
    const data = await res.json();
    const results = (data.results || []).slice(0, count).map((r) => ({ url: r.url, title: r.title, snippet: r.content }));
    // SearXNG answers 200 with an empty list when every engine timed out. That is a broken search service, not "no data".
    const down = data.unresponsive_engines || [];
    if (!results.length && down.length) {
      const names = down.map((e) => (Array.isArray(e) ? `${e[0]}: ${e[1]}` : String(e))).slice(0, 5).join(', ');
      const timedOut = down.some((e) => /timeout|connect|dns|network/i.test(Array.isArray(e) ? e[1] : String(e)));
      throw new Error(timedOut
        ? `SearXNG is running, but none of its search engines answered (${names}). Its container cannot reach the internet quickly enough: see docs/RUN_GUIDE.md, "SearXNG engines time out"`
        : `SearXNG is running and online, but every search engine it asked is refusing it (${names}). Public search engines block automated use from home connections. Wait a few minutes, or use Serper: see docs/RUN_GUIDE.md, "SearXNG shows CAPTCHA or too many requests"`);
    }
    return results;
  }
}
