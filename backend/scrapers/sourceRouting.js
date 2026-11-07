// Which source categories are worth searching for each item type, best first.
// Keeps us to 1-2 search calls per query instead of one per allow-listed domain.
const BY_ITEM_TYPE = {
  __service__: ['Services', 'Government', 'Marketplace'],
  'Communication Equipment': ['SDR', 'HF/VHF & Radios', 'HF/VHF & Antennas', 'Distributor'],
  'Microwave & RF Components': ['RF & Microwave', 'Antennas & Cabling', 'Distributor'],
  Antennas: ['Antennas & Cabling', 'HF/VHF & Antennas', 'RF & Microwave', 'Distributor'],
  'Test & Measurement': ['RF & Microwave', 'Distributor', 'Manufacturer'],
  'Computers & Accessories': ['Manufacturer', 'Retailer', 'Marketplace', 'Distributor'],
  'Networking Equipment': ['Manufacturer', 'Distributor', 'Retailer'],
  'Office Equipment': ['Manufacturer', 'Retailer', 'Marketplace'],
  'Electrical Equipment': ['Distributor', 'Retailer', 'Manufacturer'],
};
const TRUST = { HIGH: 0, MEDIUM: 1, LOW: 2 };

export function routeSources(sources, itemType, limit = 12) {
  const prefs = BY_ITEM_TYPE[itemType];
  const rank = (s) => (prefs ? prefs.indexOf(s.category) : 0);
  const pool = prefs ? sources.filter((s) => rank(s) !== -1) : sources;
  const chosen = (pool.length ? pool : sources)
    .slice()
    .sort((a, b) => rank(a) - rank(b) || (TRUST[a.trustLevel] ?? 3) - (TRUST[b.trustLevel] ?? 3));
  return chosen.slice(0, limit);
}
