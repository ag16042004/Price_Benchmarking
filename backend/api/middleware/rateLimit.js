import { HttpError } from '../../models/errors.js';

/** Sliding-window limiter, in memory. Protects login from brute force and the paid search quota from runaway use. */
export function createRateLimiter({ windowMs, max, keyFn, now = () => Date.now() }) {
  const hits = new Map();
  return (req, res, next) => {
    const t = now(), key = keyFn(req);
    if (hits.size > 5000) for (const [k, v] of hits) if (v.every((x) => t - x >= windowMs)) hits.delete(k);
    const recent = (hits.get(key) || []).filter((x) => t - x < windowMs);
    if (recent.length >= max) {
      res.set('Retry-After', String(Math.ceil((windowMs - (t - recent[0])) / 1000)));
      return next(new HttpError(429, 'Too many requests. Please wait a little and try again.'));
    }
    recent.push(t);
    hits.set(key, recent);
    next();
  };
}
