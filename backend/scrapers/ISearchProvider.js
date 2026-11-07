/**
 * Strategy interface for candidate-URL discovery (FR-11).
 * search(text, { domains, count, signal }) -> [{ url, title, snippet }]
 * `domains` restricts results to those sites (the engine passes allow-listed ones).
 */
export class ISearchProvider {
  // eslint-disable-next-line no-unused-vars
  async search(text, { domains = [], count = 10, signal } = {}) {
    throw new Error('ISearchProvider.search() not implemented');
  }
}

export const withSiteOperators = (text, domains) =>
  domains.length ? `${text} (${domains.map((d) => `site:${d}`).join(' OR ')})` : text;
