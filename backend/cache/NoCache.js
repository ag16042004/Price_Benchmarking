export class NoCache {
  kind = 'off';
  async get() { return null; }
  async set() {}
  async clear() {}
  async close() {}
}
