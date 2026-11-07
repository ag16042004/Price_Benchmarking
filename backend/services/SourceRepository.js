/**
 * Anti-corruption layer over the trusted-source data (FR-9, FR-12).
 * Everything the Scrape Engine knows about "who may be scraped" comes through here.
 */
export class SourceRepository {
  constructor({ sourceDataRepo }) { this.data = sourceDataRepo; }

  async listActive() { return (await this.data.listSources()).filter((s) => s.isActive); }

  /** The active source that owns this URL (exact host or subdomain), or null. Longest domain wins. */
  static match(url, sources) {
    let host;
    try { host = new URL(url).hostname.toLowerCase(); } catch { return null; }
    return sources
      .filter((s) => host === s.domain || host.endsWith(`.${s.domain}`))
      .sort((a, b) => b.domain.length - a.domain.length)[0] || null;
  }
}
