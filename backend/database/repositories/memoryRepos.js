import { ITEM_TYPES, SERVICE_TYPES, SOURCES } from '../seedData.js';

/** In-memory store for tests and Postgres-free demos (DATA_STORE=memory). Same contract as the Prisma repos. */
export function createMemoryRepos() {
  const users = [], queries = [], rates = [];
  let userSeq = 1, querySeq = 1, sourceSeq = SOURCES.length + 1, rateSeq = 1;
  const lists = {
    item: ITEM_TYPES.map((t, i) => ({ id: i + 1, isActive: true, ...t })),
    service: SERVICE_TYPES.map((t, i) => ({ id: i + 1, isActive: true, ...t })),
  };
  const sources = SOURCES.map((s, i) => ({ id: i + 1, updatedAt: new Date(), ...s }));
  const copy = (o) => (o ? { ...o } : null);
  const byName = (a, b) => a.name.localeCompare(b.name);

  const userRepo = {
    async findByEmail(email) { return copy(users.find((u) => u.email === email)); },
    async findById(id) { return copy(users.find((u) => u.id === id)); },
    async create(data) { const u = { id: userSeq++, createdAt: new Date(), ...data }; users.push(u); return copy(u); },
    async setRole(id, role) { const u = users.find((x) => x.id === id); if (u) u.role = role; return copy(u); },
  };

  const queryRepo = {
    async create(d) {
      const q = {
        id: querySeq++, userId: d.userId, queryType: d.queryType, itemName: d.itemName ?? null,
        itemType: d.itemTypeName ?? null, make: d.make ?? null, model: d.model ?? null,
        specifications: (d.specifications || []).map((x) => ({ key: x.key, value: x.value })),
        serviceType: d.serviceTypeName ?? null, location: d.location ?? null, description: d.description ?? null,
        status: 'PENDING', noDataFlag: false, servedFromCache: false, createdAt: d.createdAt ?? new Date(), results: [],
      };
      queries.push(q);
      return { ...q };
    },
    async complete(id, { results, noDataFlag, fromCache = false, diagnosis = null }) {
      const q = queries.find((x) => x.id === id);
      q.diagnosis = diagnosis;
      q.results = results.map((r) => ({ ...r }));
      q.noDataFlag = noDataFlag;
      q.servedFromCache = fromCache;
      q.status = noDataFlag ? 'NO_DATA' : 'COMPLETED';
    },
    async fail(id) { queries.find((x) => x.id === id).status = 'FAILED'; },
    async findById(id) { const q = queries.find((x) => x.id === id); return q ? { ...q } : null; },
    async listByUser(userId, { page = 1, pageSize = 10, type, search } = {}) {
      const hay = (q) => [q.itemName, q.make, q.model, q.serviceType, q.location, q.description].filter(Boolean).join(' ').toLowerCase();
      const rows = queries
        .filter((q) => q.userId === userId && (!type || q.queryType === type) && (!search || hay(q).includes(search.toLowerCase())))
        .sort((a, b) => b.id - a.id);
      return {
        total: rows.length,
        items: rows.slice((page - 1) * pageSize, page * pageSize).map((q) => ({ ...q, resultCount: q.results.length })),
      };
    },
    async countsByUser(userId) {
      const mine = queries.filter((q) => q.userId === userId);
      return { total: mine.length, completed: mine.filter((q) => q.status === 'COMPLETED').length, noData: mine.filter((q) => q.status === 'NO_DATA').length };
    },
  };

  const categoryRepo = {
    async list(kind, { includeInactive = false } = {}) { return lists[kind].filter((t) => includeInactive || t.isActive).map(copy).sort(byName); },
    async findByName(kind, name) { return copy(lists[kind].find((t) => t.name.toLowerCase() === name.toLowerCase())); },
    async create(kind, data) {
      const row = { id: Math.max(0, ...lists[kind].map((t) => t.id)) + 1, isActive: true, description: null, ...data };
      lists[kind].push(row);
      return copy(row);
    },
    async update(kind, id, data) { const row = lists[kind].find((t) => t.id === id); if (row) Object.assign(row, data); return copy(row); },
    listItemTypes() { return this.list('item'); },
    listServiceTypes() { return this.list('service'); },
  };

  const sourceDataRepo = {
    async listSources() { return sources.map(copy); },
    async findSourceByDomain(domain) { return copy(sources.find((s) => s.domain === domain)); },
    async createSource(data) { const s = { id: sourceSeq++, updatedAt: new Date(), category: null, trustLevel: 'MEDIUM', ...data }; sources.push(s); return copy(s); },
    async updateSource(id, data) { const s = sources.find((x) => x.id === id); if (s) Object.assign(s, data, { updatedAt: new Date() }); return copy(s); },
  };

  const rateRepo = {
    async list() { return rates.map(copy); },
    async create(d) { const r = { id: rateSeq++, isActive: true, description: null, createdAt: new Date(), ...d }; rates.push(r); return copy(r); },
    async update(id, d) { const r = rates.find((x) => x.id === id); if (r) Object.assign(r, d); return copy(r); },
    async findMatching({ serviceType, city }) {
      const c = (city || '').toLowerCase();
      return rates.filter((r) => r.isActive && r.serviceType === serviceType && c && r.location.split(',')[0].trim().toLowerCase() === c).map(copy);
    },
  };

  return { userRepo, queryRepo, categoryRepo, sourceDataRepo, rateRepo };
}
