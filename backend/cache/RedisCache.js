import IORedis from 'ioredis';

/** Shared cache so a worker process can fill it and the API process can read it. */
export class RedisCache {
  kind = 'redis';
  constructor({ redisUrl, prefix = 'casper:cache:' }) {
    this.prefix = prefix;
    // Commands wait for the connection (so the first request after boot still works) but fail fast if Redis is down:
    // a slow cache must never make a query slower than having no cache.
    this.redis = new IORedis(redisUrl, { maxRetriesPerRequest: 1, connectTimeout: 2000, commandTimeout: 1500 });
    this.redis.on('error', () => {});   // callers handle failures; avoid unhandled 'error' events
  }
  async get(key) {
    const raw = await this.redis.get(this.prefix + key);
    return raw ? JSON.parse(raw) : null;
  }
  async set(key, value, ttlSeconds) { await this.redis.set(this.prefix + key, JSON.stringify(value), 'EX', ttlSeconds); }
  async clear() {
    const keys = [];
    for await (const batch of this.redis.scanStream({ match: `${this.prefix}*`, count: 200 })) keys.push(...batch);
    if (keys.length) await this.redis.del(...keys);
  }
  async close() { this.redis.disconnect(); }
}
