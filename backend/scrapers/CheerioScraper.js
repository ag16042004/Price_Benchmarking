export class ScrapeError extends Error {
  constructor(reason, message) { super(message); this.reason = reason; }
}

const MAX_REDIRECTS = 4;

/** Reads at most `max` bytes of the body, then stops downloading (the rest is never held in memory). */
async function readCapped(res, max) {
  if (!res.body?.getReader) return (await res.text()).slice(0, max);
  const reader = res.body.getReader(), decoder = new TextDecoder();
  let text = '', bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = value.length > max - bytes ? value.subarray(0, max - bytes) : value;   // never keep more than `max`
    bytes += chunk.length;
    text += decoder.decode(chunk, { stream: true });
    if (bytes >= max) { await reader.cancel(); break; }
  }
  return text + decoder.decode();
}

/**
 * Static-HTML scraper (JS-rendered pages need a Puppeteer strategy, added later).
 * Redirects are followed by hand: every hop is checked against the allow-list and robots.txt
 * BEFORE it is requested, so a page on an allowed site cannot make us send a request elsewhere.
 */
export class CheerioScraper {
  constructor({ robots, limiter, userAgent, timeoutMs = 10000, maxBytes = 2_000_000, fetchImpl = fetch }) {
    Object.assign(this, { robots, limiter, userAgent, timeoutMs, maxBytes, fetchImpl });
  }

  async #guard(url) {
    if (!(await this.robots.isAllowed(url))) throw new ScrapeError('robots', 'Disallowed by robots.txt');
    await this.limiter.wait(new URL(url).host);
  }

  async scrape(url, { signal, isAllowed = () => true } = {}) {
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const sig = signal ? AbortSignal.any([signal, timeout]) : timeout;
    const init = {
      headers: { 'User-Agent': this.userAgent, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'en-IN,en;q=0.8' },
      redirect: 'manual',
      signal: sig,
    };

    let current = url, res;
    await this.#guard(current);
    for (let hops = 0; ; hops++) {
      res = await this.fetchImpl(current, init);
      const location = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
      if (!location) break;
      await res.body?.cancel?.();
      if (hops >= MAX_REDIRECTS) throw new ScrapeError('redirect', 'Too many redirects');
      const next = new URL(location, current).toString();
      if (!/^https?:\/\//i.test(next) || !isAllowed(next)) throw new ScrapeError('redirect', `Redirect leaves the allow-list (${next})`);
      current = next;
      await this.#guard(current);
    }

    if (!res.ok) throw new ScrapeError('http', `HTTP ${res.status}`);
    if (!(res.headers.get('content-type') || 'text/html').includes('html')) throw new ScrapeError('type', 'Not an HTML page');
    if (Number(res.headers.get('content-length')) > this.maxBytes) throw new ScrapeError('size', 'Page too large');

    return {
      url,
      finalUrl: current,                  // the engine re-checks this against the allow-list (second guard)
      html: await readCapped(res, this.maxBytes),
      lastModified: res.headers.get('last-modified'),
      fetchedAt: new Date().toISOString(),
    };
  }
}
