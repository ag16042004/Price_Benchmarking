/** One short, human label for a query. Used by history, the demo scripts and the mock engine (one copy, not five). */
export const summaryOf = (q) => (q.queryType === 'SERVICE' ? `${q.serviceType} in ${q.location}`
  : q.queryType === 'SPECIFICATION' ? `${q.itemName} (${(q.specifications || []).length} specs)`
  : `${q.make} ${q.model}`);
