/**
 * Stand-in used when no search provider is configured. Same contract as the real engine:
 * dispatchQuery(query) -> array of raw results ([] = no data). Everything it returns is
 * flagged isMock so the UI can never pass it off as real.
 * Tip: use "nodata" as the Make, Item name, or Location to exercise the no-data path.
 */
const isNoData = (v) => (v || '').toLowerCase() === 'nodata';

import { summaryOf } from '../models/queryLabel.js';

export class StubScrapeEngine {
  async dispatchQuery(query) {
    if ([query.make, query.itemName, query.location].some(isNoData)) return [];
    const label = summaryOf(query);
    return [{
      price: query.queryType === 'SERVICE' ? 2500 : 76999,
      currency: 'INR',
      sourceUrl: 'https://mock.casper.local/listing/1',
      itemDetails: `${label} (MOCK DATA)`,
      vintage: new Date().toISOString(),
      matchScore: 1,
      isMock: true,
    }];
  }
}
