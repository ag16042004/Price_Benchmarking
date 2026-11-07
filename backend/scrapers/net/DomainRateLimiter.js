/** NFR-7: at most one request per `minIntervalMs` to any single host, even under concurrency. */
export class DomainRateLimiter {
  constructor({ minIntervalMs = 1500, now = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
    Object.assign(this, { minIntervalMs, now, sleep, last: new Map(), chains: new Map() });
  }

  wait(host) {
    const prev = this.chains.get(host) || Promise.resolve();
    const next = prev.then(async () => {
      const ms = (this.last.get(host) ?? -Infinity) + this.minIntervalMs - this.now();
      if (ms > 0) await this.sleep(ms);
      this.last.set(host, this.now());
    });
    this.chains.set(host, next.catch(() => {}));
    return next;
  }
}
