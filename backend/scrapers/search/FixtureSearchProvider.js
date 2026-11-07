import { ISearchProvider } from '../ISearchProvider.js';

/** Returns a fixed candidate list. For tests and offline demos. */
export class FixtureSearchProvider extends ISearchProvider {
  constructor(candidates) { super(); this.candidates = candidates; this.calls = []; }
  async search(text, opts = {}) {
    this.calls.push({ text, ...opts });
    return this.candidates;
  }
}
