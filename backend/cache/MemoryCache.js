/** In-process cache with TTL. Fine for one process; use RedisCache when the API and worker are separate. */
export class MemoryCache {
  kind = 'memory';
  constructor({ now = () => Date.now() } = {}) { this.now = now; this.map = new Map(); }
  async get(key) {
    const e = this.map.get(key);
    if (!e) return null;
    if (e.expires <= this.now()) { this.map.delete(key); return null; }
    return e.value;
  }
  async set(key, value, ttlSeconds) { this.map.set(key, { value, expires: this.now() + ttlSeconds * 1000 }); }
  async clear() { this.map.clear(); }
  async close() {}
}
