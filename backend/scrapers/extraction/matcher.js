export const tokens = (s) => (s || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/**
 * Product identity check for exact make/model queries.
 *  - MODEL (the real identity): every model token must be a WHOLE token in the page title or URL, so
 *    "Latitude 5430" does not match "Latitude 5430i" or "Latitude 7430".
 *  - MAKE (supporting evidence): shops often print only "HackRF One" or "Ettus", not "Great Scott Gadgets" or
 *    "Ettus Research". So it is enough that the first word of the make is in the title or URL, or that every
 *    word of the make appears somewhere on the page.
 * A wrong product's price in a benchmark is worse than a missed listing, which is why the model stays strict.
 */
export function matchesExact({ title = '', url = '', text = '' }, { make, model }) {
  const head = new Set([...tokens(title), ...tokens(url)]);
  const page = new Set([...head, ...tokens(text)]);
  const all = (list, set) => list.length > 0 && list.every((t) => set.has(t));
  const makeWords = tokens(make);
  const makeOk = makeWords.length > 0 && (head.has(makeWords[0]) || all(makeWords, page));
  const modelOk = all(tokens(model), head);
  return { matches: makeOk && modelOk, makeOk, modelOk };
}

// "16 GB" and "16GB" must compare equal, so glue digits to a following unit before tokenizing.
const UNITS = 'gb|tb|mb|kb|ghz|mhz|khz|hz|kw|w|v|ma|mah|ah|db|dbi|dbm|mm|cm|kg|g|inch';
const glue = (s) => (s || '').toLowerCase().replace(new RegExp(`(\\d)\\s+(${UNITS})\\b`, 'g'), '$1$2');
const tokenSet = (s) => new Set(tokens(glue(s)));
const coverage = (needle, hay) => {
  const t = tokens(glue(needle));
  return t.length ? t.filter((x) => hay.has(x)).length / t.length : 0;
};

/**
 * Specification query: the item name must be on the page, and enough of the requested
 * values must appear (every word of a value must be present). Score = share of specs met.
 * The score is stored with the result so an officer can see how close the match was.
 */
export function matchesSpecs({ title = '', url = '', text = '' }, { itemName, specifications = [] }, minScore = 0.6) {
  const hay = tokenSet(`${title} ${url} ${text}`);
  const nameOk = coverage(itemName, hay) === 1;
  const met = specifications.filter((s) => coverage(s.value, hay) === 1).length;
  const score = specifications.length ? met / specifications.length : 0;
  return { matches: nameOk && score >= minScore, score: Math.round(score * 100) / 100, nameOk, met };
}

const STOP = new Set(['and', 'the', 'for', 'of', 'in']);
const stem = (t) => (t.length > 3 ? t.replace(/s$/, '') : t);   // service / services

/** Service query: the service wording and the city (first part of Location) must both appear. */
export function matchesService({ title = '', url = '', text = '' }, { serviceType, location }) {
  const hay = new Set([...tokenSet(`${title} ${url} ${text}`)].map(stem));
  const sig = tokens(serviceType).filter((t) => t.length > 1 && !STOP.has(t)).map(stem);
  const svc = sig.length ? sig.filter((t) => hay.has(t)).length / sig.length : 0;
  const city = tokens((location || '').split(',')[0]).map(stem);
  const locOk = city.length > 0 && city.every((t) => hay.has(t));
  return { matches: svc >= 0.5 && locOk, score: Math.round((0.5 * svc + (locOk ? 0.5 : 0)) * 100) / 100 };
}
