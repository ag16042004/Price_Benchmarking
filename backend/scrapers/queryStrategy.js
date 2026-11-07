import { matchesExact, matchesSpecs, matchesService, tokens } from './extraction/matcher.js';

// A model like "HackRF One" or "Latitude 5430" identifies a product on its own; "5430" or "Pro" does not.
const distinctive = (model) => { const t = tokens(model); return t.length >= 3 || t.some((x) => x.length >= 5 || (/\d/.test(x) && /[a-z]/.test(x))); };

/** Per query type: how to route sources, what to search for, and how to decide a page is a match. */
export function strategyFor(query) {
  switch (query.queryType) {
    case 'SPECIFICATION': {
      const values = (query.specifications || []).map((s) => s.value);
      return {
        routeKey: query.itemType,
        searchText: `${query.itemName} ${values.slice(0, 5).join(' ')} price`,
        match: (doc) => matchesSpecs(doc, query),
      };
    }
    case 'SERVICE':
      return {
        routeKey: '__service__',
        searchText: `${query.serviceType} in ${(query.location || '').split(',')[0]} price rate`,
        match: (doc) => matchesService(doc, query),
      };
    default:
      return {
        routeKey: query.itemType,
        searchText: `${query.make} ${query.model} price`,
        match: (doc) => { const m = matchesExact(doc, query); return { matches: m.matches, score: m.matches ? 1 : 0 }; },
        // Search results and shopping listings rarely print the full maker name. The exact model is what identifies the
        // product, so a listing with a distinctive model is accepted without the maker, at a lower score.
        matchListing: (doc) => {
          const m = matchesExact(doc, query);
          if (m.matches) return { matches: true, score: 1 };
          return m.modelOk && distinctive(query.model) ? { matches: true, score: 0.7 } : { matches: false, score: 0 };
        },
      };
  }
}
