import { createHash } from 'node:crypto';

const n = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Cache key = only the fields that change what the engine searches for and matches.
 * (Exact match ignores Item Name; service queries ignore the description; location is the city.)
 */
export function fingerprint(q) {
  let parts;
  if (q.queryType === 'SPECIFICATION') {
    parts = [q.queryType, n(q.itemName), n(q.itemType), ...(q.specifications || []).map((s) => `${n(s.key)}=${n(s.value)}`).sort()];
  } else if (q.queryType === 'SERVICE') {
    parts = [q.queryType, n(q.serviceType), n((q.location || '').split(',')[0])];
  } else {
    parts = ['EXACT_MATCH', n(q.itemType), n(q.make), n(q.model)];
  }
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}
