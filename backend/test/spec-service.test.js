import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeEngine } from './engineHelpers.js';
import { matchesSpecs, matchesService } from '../scrapers/extraction/matcher.js';
import { extractListing } from '../scrapers/extraction/extractListing.js';
import { validateSpecification, validateService } from '../models/validators.js';

const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
const page = (n) => ({ html: fx(n), fetchedAt: '2026-10-06T10:00:00.000Z' });

const specQuery = {
  queryType: 'SPECIFICATION', itemName: 'Laptop', itemType: 'Computers & Accessories',
  specifications: [{ key: 'Processor', value: 'Intel Core i5' }, { key: 'RAM', value: '16 GB' }, { key: 'Storage', value: '512 GB SSD' }],
};
const serviceQuery = { queryType: 'SERVICE', serviceType: 'IT Support Services', location: 'Indore, Madhya Pradesh', description: 'On-site hardware support' };

test('matchesSpecs: "16 GB" equals "16GB"; score is the share of specs met', () => {
  const doc = (n) => { const l = extractListing(page(n)); return { title: l.title, url: 'https://x.com/p', text: l.text }; };
  const full = matchesSpecs(doc('spec-laptop.html'), specQuery);
  assert.deepEqual([full.matches, full.score, full.met], [true, 1, 3]);
  const weak = matchesSpecs(doc('spec-weak.html'), specQuery);
  assert.equal(weak.matches, false);
  assert.equal(weak.score, 0.33);
});

test('matchesSpecs: "i5 processor" is not glued into one word (units only)', () => {
  assert.equal(matchesSpecs({ title: 'Laptop', text: 'Intel Core i5 processor' }, { itemName: 'Laptop', specifications: [{ key: 'CPU', value: 'Intel Core i5' }] }).matches, true);
});

test('extractListing keeps adjacent table cells apart', () => {
  const l = extractListing({ html: '<html><body><table><tr><td>RAM</td><td>16GB</td></tr><tr><td>Storage</td><td>512 GB</td></tr></table></body></html>' });
  assert.equal(l, null);   // no price: sanity check that the call is safe
  const l2 = extractListing({ html: '<script type="application/ld+json">{"@type":"Product","name":"X","offers":{"price":"5","priceCurrency":"USD"}}</script><body><table><tr><td>RAM</td><td>16GB</td></tr><tr><td>Storage</td><td>512 GB</td></tr></table></body>' });
  assert.match(l2.text, /16GB\s+Storage\s+512 GB/);
});

test('matchesSpecs: wrong item name never matches, even if specs do', () => {
  const m = matchesSpecs({ title: 'Router', text: 'Intel Core i5 16GB 512 GB SSD' }, specQuery);
  assert.equal(m.matches, false);
});

test('matchesService: needs the service wording and the city', () => {
  const ok = extractListing(page('service-page.html'));
  assert.equal(matchesService({ title: ok.title, text: ok.text }, serviceQuery).matches, true);
  const wrong = extractListing(page('service-wrong-city.html'));
  assert.equal(matchesService({ title: wrong.title, text: wrong.text }, serviceQuery).matches, false);
});

test('extraction: JSON-LD Service offers are read', () => {
  const l = extractListing(page('service-page.html'));
  assert.deepEqual([l.method, l.price, l.currency], ['json-ld', 2500, 'INR']);
});

test('dates: day-first "12/09/2026" is 12 September, not 9 December', () => {
  const l = extractListing(page('service-page.html'));
  assert.equal(l.vintageBasis, 'page');
  assert.match(l.vintage, /^2026-09-1[12]/);             // timezone may shift the ISO day by one
});

test('dates: "Price updated on 20th September 2026" in page text', () => {
  const l = extractListing(page('dates-text.html'));
  assert.equal(l.vintageBasis, 'page');
  assert.match(l.vintage, /^2026-09-(19|20)/);
});

test('engine: specification query keeps the full match and drops the weak one, with matchScore', async () => {
  const routes = {
    'https://www.lenovo.com/e14': { html: fx('spec-laptop.html') },
    'https://www.hp.com/245': { html: fx('spec-weak.html') },
  };
  const { engine, search } = makeEngine(routes, Object.keys(routes));
  const out = await engine.dispatchQuery(specQuery);
  assert.equal(out.length, 1);
  assert.deepEqual([out[0].sourceName, out[0].price, out[0].matchScore], ['Lenovo India', 64990, 1]);
  assert.match(search.calls[0].text, /Laptop Intel Core i5 16 GB 512 GB SSD price/);
});

test('engine: service query routes to service sources only and rejects the wrong city', async () => {
  const sources = [
    { id: 1, domain: 'justdial.com', name: 'JustDial', category: 'Services', trustLevel: 'LOW', isActive: true },
    { id: 2, domain: 'dell.com', name: 'Dell India', category: 'Manufacturer', trustLevel: 'HIGH', isActive: true },
  ];
  // Service directories are listing-only: the price is read from the search result, and their pages are never opened.
  const hits = [
    { url: 'https://www.justdial.com/indore-it', title: 'Computer AMC and IT support services in Indore', snippet: 'IT support services in Indore. Annual maintenance from ₹ 2,400 per year' },
    { url: 'https://www.justdial.com/pune-it', title: 'IT support services in Pune', snippet: '₹ 2,100 per month' },
  ];
  const { engine, search, requested } = makeEngine({}, hits, [], { perDomain: 5 }, { sources });
  const out = await engine.dispatchQuery(serviceQuery);
  assert.equal(out.length, 1);
  assert.match(out[0].sourceUrl, /indore/);
  assert.equal(requested.length, 0, 'no directory page was opened');
  const sited = search.calls.find((c) => c.domains?.length).domains;
  assert.ok(sited.includes('justdial.com') && !sited.includes('dell.com'), 'only service portals are searched for a service');
});

test('validateSpecification: per-row errors, duplicates, and limits', () => {
  assert.throws(() => validateSpecification({ itemName: 'Laptop', itemType: 'A', specs: [] }, ['A']),
    (e) => e.status === 400 && !!e.details.specs);
  assert.throws(() => validateSpecification({ itemName: 'L', itemType: 'A', specs: [{ key: 'RAM', value: '' }, { key: 'ram', value: '8 GB' }] }, ['A']),
    (e) => !!(e.details['specs.0.value'] && e.details['specs.1.key']));
  const ok = validateSpecification({ itemName: ' Laptop ', itemType: 'A', specs: [{ key: ' RAM ', value: ' 16 GB ' }] }, ['A']);
  assert.deepEqual(ok.specs, [{ key: 'RAM', value: '16 GB' }]);
});

test('validateService: all three fields are required; description max 700', () => {
  assert.throws(() => validateService({}, ['X']), (e) => !!(e.details.serviceType && e.details.location && e.details.description));
  assert.throws(() => validateService({ serviceType: 'X', location: 'Indore', description: 'a'.repeat(701) }, ['X']), (e) => !!e.details.description);
});
