const STALE_AFTER_MONTHS = 12;

export class ResultItem {
  constructor({ price, currency = 'INR', sourceUrl, sourceName, sourceId = null, itemDetails = '', vintage = null, vintageBasis = null, matchScore = null, isMock = false, isReplay = false }) {
    this.price = Number(price);
    this.currency = currency;
    this.sourceUrl = sourceUrl;
    this.sourceName = sourceName || ResultItem.hostOf(sourceUrl);
    this.sourceId = sourceId;           // internal; not exposed in toJSON
    this.itemDetails = itemDetails;
    this.vintage = vintage ? new Date(vintage).toISOString() : null;
    this.vintageBasis = vintageBasis;
    this.matchScore = matchScore;
    this.isMock = isMock;
    this.isReplay = isReplay;
  }

  static hostOf(url) {
    try { return new URL(url).hostname; } catch { return url; }
  }

  /** Older than 12 months, or no date at all, counts as stale. */
  isStale(now = new Date()) {
    if (!this.vintage) return true;
    const cutoff = new Date(now);
    cutoff.setMonth(cutoff.getMonth() - STALE_AFTER_MONTHS);
    return new Date(this.vintage) < cutoff;
  }

  getFormattedPrice() {
    const locale = this.currency === 'INR' ? 'en-IN' : 'en-US';
    return new Intl.NumberFormat(locale, { style: 'currency', currency: this.currency, maximumFractionDigits: 2 }).format(this.price);
  }

  toJSON() {
    return {
      price: this.price,
      formattedPrice: this.getFormattedPrice(),
      currency: this.currency,
      sourceUrl: this.sourceUrl,
      sourceName: this.sourceName,
      itemDetails: this.itemDetails,
      vintage: this.vintage,
      vintageBasis: this.vintageBasis,
      matchScore: this.matchScore,
      isStale: this.isStale(),
      // Not on the administrator's approved list (curated, sample and replayed rows are exempt).
      unlisted: this.sourceId == null && !this.isMock && !this.isReplay && this.vintageBasis !== 'curated',
      isMock: this.isMock,
      isReplay: this.isReplay,
    };
  }
}
