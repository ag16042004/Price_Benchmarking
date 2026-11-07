import robotsParser from 'robots-parser';

/**
 * NFR-7: robots.txt is honoured. 404 means "no rules" (allowed). If robots.txt
 * cannot be read at all (5xx, network error), we err on the side of NOT scraping.
 */
export class RobotsGuard {
  constructor({ userAgent, fetchImpl = fetch, ttlMs = 60 * 60 * 1000, timeoutMs = 5000 }) {
    Object.assign(this, { userAgent, fetchImpl, ttlMs, timeoutMs, cache: new Map() });
  }

  async isAllowed(url) {
    const origin = new URL(url).origin;
    let entry = this.cache.get(origin);
    if (!entry || Date.now() - entry.at > this.ttlMs) {
      entry = { at: Date.now(), parser: await this.#load(origin) };
      this.cache.set(origin, entry);
    }
    return entry.parser ? entry.parser.isAllowed(url, this.userAgent) !== false : false;
  }

  async #load(origin) {
    const robotsUrl = `${origin}/robots.txt`;
    try {
      const res = await this.fetchImpl(robotsUrl, {
        headers: { 'User-Agent': this.userAgent }, redirect: 'follow', signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (res.status >= 500) return null;
      if (res.status >= 400) return robotsParser(robotsUrl, '');
      return robotsParser(robotsUrl, await res.text());
    } catch {
      return null;
    }
  }
}
