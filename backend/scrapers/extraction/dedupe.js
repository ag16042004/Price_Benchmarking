/** Drops repeat URLs (ignoring query string) and identical price+title listings; caps results per host. */
export function dedupe(results, { perDomain = 3 } = {}) {
  const seen = new Set(), perHost = new Map(), out = [];
  for (const r of results) {
    const u = new URL(r.sourceUrl);
    // A shopping aggregator (google.*) links many merchants through one host, so there the merchant is the identity.
    const host = /(^|\.)google\./.test(u.host) ? `${u.host}|${r.sourceName}` : u.host;
    const byUrl = `${host}${u.pathname.replace(/\/+$/, '')}`.toLowerCase();
    const byContent = `${host}|${r.price}|${r.currency}|${(r.itemDetails || '').toLowerCase().replace(/\s+/g, ' ')}`;
    if (seen.has(byUrl) || seen.has(byContent)) continue;
    seen.add(byUrl); seen.add(byContent);
    const n = perHost.get(host) || 0;
    if (n >= perDomain) continue;
    perHost.set(host, n + 1);
    out.push(r);
  }
  return out;
}
