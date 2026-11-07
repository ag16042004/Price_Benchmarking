import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryRepos } from '../database/repositories/memoryRepos.js';
import { ITEM_TYPES, SERVICE_TYPES } from '../database/seedData.js';

/**
 * One suite, two implementations. The in-memory store always runs. The Prisma store runs when DATABASE_URL is set
 * (CI starts a real Postgres), so both are held to exactly the same behaviour.
 */
const stores = [['memory', async () => ({ repos: createMemoryRepos(), done: async () => {} })]];

if (process.env.DATABASE_URL) {
  stores.push(['prisma (real Postgres)', async () => {
    const { PrismaClient } = await import('@prisma/client');
    const { createPrismaRepos } = await import('../database/repositories/prismaRepos.js');
    const prisma = new PrismaClient();
    for (const t of ITEM_TYPES) await prisma.itemType.upsert({ where: { name: t.name }, update: {}, create: t });
    for (const t of SERVICE_TYPES) await prisma.serviceType.upsert({ where: { name: t.name }, update: {}, create: t });
    return { repos: createPrismaRepos(prisma), done: () => prisma.$disconnect() };
  }]);
}

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const result = (o = {}) => ({ price: 1234.5, currency: 'INR', sourceUrl: 'https://www.dell.com/x', itemDetails: 'Dell Latitude', vintage: '2026-09-20T00:00:00.000Z', vintageBasis: 'page', matchScore: 0.67, isMock: false, isReplay: false, ...o });

for (const [name, make] of stores) {
  test(`repositories: ${name}`, async (t) => {
    const { repos, done } = await make();
    t.after(done);
    const { userRepo, queryRepo, categoryRepo, sourceDataRepo, rateRepo } = repos;
    const tag = uid();

    await t.test('users: create, find by email and id, change role', async () => {
      const u = await userRepo.create({ name: 'U', email: `${tag}@x.in`, passwordHash: 'h', role: 'OFFICER' });
      assert.equal((await userRepo.findByEmail(`${tag}@x.in`)).id, u.id);
      assert.equal((await userRepo.findById(u.id)).email, `${tag}@x.in`);
      assert.equal(await userRepo.findByEmail(`nobody-${tag}@x.in`), null);
      await userRepo.setRole(u.id, 'ADMIN');
      assert.equal((await userRepo.findById(u.id)).role, 'ADMIN');
    });

    await t.test('categories: create, case-insensitive lookup, deactivate, include inactive', async () => {
      const row = await categoryRepo.create('item', { name: `Type ${tag}`, description: 'd' });
      assert.equal(row.isActive, true);
      assert.equal((await categoryRepo.findByName('item', `TYPE ${tag}`)).id, row.id);
      assert.ok((await categoryRepo.list('item')).some((x) => x.id === row.id));
      await categoryRepo.update('item', row.id, { isActive: false });
      assert.ok(!(await categoryRepo.list('item')).some((x) => x.id === row.id));
      assert.ok((await categoryRepo.list('item', { includeInactive: true })).some((x) => x.id === row.id && x.isActive === false));
      assert.equal(await categoryRepo.update('item', 99999999, { name: 'x' }), null);
      assert.ok((await categoryRepo.listItemTypes()).some((x) => x.name === 'Antennas'));
      assert.ok((await categoryRepo.listServiceTypes()).some((x) => x.name === 'IT Support Services'));
    });

    await t.test('sources: create, find by domain, update, missing id returns null', async () => {
      const s = await sourceDataRepo.createSource({ domain: `${tag}.example.com`, name: 'S', category: 'Retailer', trustLevel: 'LOW', isActive: true });
      assert.equal((await sourceDataRepo.findSourceByDomain(`${tag}.example.com`)).id, s.id);
      assert.equal((await sourceDataRepo.updateSource(s.id, { isActive: false })).isActive, false);
      assert.ok((await sourceDataRepo.listSources()).some((x) => x.id === s.id));
      assert.equal(await sourceDataRepo.updateSource(99999999, { name: 'x' }), null);
      assert.equal(await sourceDataRepo.findSourceByDomain(`none-${tag}.example.com`), null);
    });

    await t.test('queries: all three types round-trip, results keep every field', async () => {
      const u = await userRepo.create({ name: 'Q', email: `q${tag}@x.in`, passwordHash: 'h', role: 'OFFICER' });
      const exact = await queryRepo.create({ userId: u.id, queryType: 'EXACT_MATCH', itemName: 'Laptop', itemTypeName: 'Computers & Accessories', make: 'Dell', model: 'Latitude 5430' });
      assert.deepEqual([exact.status, exact.itemType, exact.noDataFlag], ['PENDING', 'Computers & Accessories', false]);
      await queryRepo.complete(exact.id, { results: [result(), result({ sourceUrl: 'https://digikey.in/y', price: 10, currency: 'USD', isReplay: true })], noDataFlag: false });
      const got = await queryRepo.findById(exact.id);
      assert.deepEqual([got.status, got.results.length, got.servedFromCache], ['COMPLETED', 2, false]);
      const r = got.results.find((x) => x.sourceUrl.includes('dell.com'));
      assert.deepEqual([r.price, r.currency, r.vintageBasis, r.matchScore, r.isReplay], [1234.5, 'INR', 'page', 0.67, false]);
      assert.equal(new Date(r.vintage).toISOString(), '2026-09-20T00:00:00.000Z');
      assert.equal(got.results.find((x) => x.sourceUrl.includes('digikey')).isReplay, true);

      const spec = await queryRepo.create({ userId: u.id, queryType: 'SPECIFICATION', itemName: 'Laptop', itemTypeName: 'Computers & Accessories', specifications: [{ key: 'RAM', value: '16 GB' }, { key: 'SSD', value: '512 GB' }] });
      assert.deepEqual((await queryRepo.findById(spec.id)).specifications.map((x) => `${x.key}=${x.value}`).sort(), ['RAM=16 GB', 'SSD=512 GB']);

      const svc = await queryRepo.create({ userId: u.id, queryType: 'SERVICE', serviceTypeName: 'IT Support Services', location: 'Indore, MP', description: 'on-site' });
      const s = await queryRepo.findById(svc.id);
      assert.deepEqual([s.serviceType, s.location, s.description], ['IT Support Services', 'Indore, MP', 'on-site']);

      await queryRepo.complete(svc.id, { results: [], noDataFlag: true, fromCache: true });
      const none = await queryRepo.findById(svc.id);
      assert.deepEqual([none.status, none.noDataFlag, none.servedFromCache, none.results.length], ['NO_DATA', true, true, 0]);

      await queryRepo.fail(spec.id);
      assert.equal((await queryRepo.findById(spec.id)).status, 'FAILED');
      assert.equal(await queryRepo.findById(99999999), null);
    });

    await t.test('history: newest first, pagination, type filter, search, counts, isolation between users', async () => {
      const a = await userRepo.create({ name: 'A', email: `a${tag}@x.in`, passwordHash: 'h', role: 'OFFICER' });
      const b = await userRepo.create({ name: 'B', email: `b${tag}@x.in`, passwordHash: 'h', role: 'OFFICER' });
      const mk = (u, model, type = 'EXACT_MATCH') => queryRepo.create(type === 'EXACT_MATCH'
        ? { userId: u.id, queryType: type, itemName: 'n', itemTypeName: 'Antennas', make: 'Acme', model }
        : { userId: u.id, queryType: type, serviceTypeName: 'AMC / Maintenance', location: 'Pune', description: 'd' });
      const q1 = await mk(a, 'Alpha'); const q2 = await mk(a, 'Bravo'); const q3 = await mk(a, 'x', 'SERVICE'); await mk(b, 'Zulu');
      await queryRepo.complete(q1.id, { results: [result()], noDataFlag: false });
      await queryRepo.complete(q2.id, { results: [], noDataFlag: true });

      const all = await queryRepo.listByUser(a.id, { page: 1, pageSize: 10 });
      assert.equal(all.total, 3);
      assert.deepEqual(all.items.map((x) => x.id), [q3.id, q2.id, q1.id]);
      assert.equal(all.items.find((x) => x.id === q1.id).resultCount, 1);
      assert.deepEqual((await queryRepo.listByUser(a.id, { page: 2, pageSize: 2 })).items.map((x) => x.id), [q1.id]);
      assert.equal((await queryRepo.listByUser(a.id, { type: 'SERVICE' })).total, 1);
      assert.deepEqual((await queryRepo.listByUser(a.id, { search: 'BRAVO' })).items.map((x) => x.id), [q2.id]);
      assert.equal((await queryRepo.listByUser(b.id)).total, 1);
      assert.deepEqual(await queryRepo.countsByUser(a.id), { total: 3, completed: 1, noData: 1 });
      assert.deepEqual(await queryRepo.countsByUser(99999999), { total: 0, completed: 0, noData: 0 });
    });

    await t.test('curated rates: create, match by service type + city, deactivate', async () => {
      const r = await rateRepo.create({ serviceType: 'IT Support Services', location: `Indore ${tag}`, price: 2500, currency: 'INR', sourceName: 'Contract', sourceUrl: 'https://example.gov.in/r', vintage: '2026-08-01T00:00:00.000Z' });
      assert.deepEqual([r.price, r.serviceType, r.isActive], [2500, 'IT Support Services', true]);
      assert.equal((await rateRepo.findMatching({ serviceType: 'IT Support Services', city: `indore ${tag}` })).length, 1);
      assert.equal((await rateRepo.findMatching({ serviceType: 'AMC / Maintenance', city: `Indore ${tag}` })).length, 0);
      assert.equal((await rateRepo.findMatching({ serviceType: 'IT Support Services', city: '' })).length, 0);
      await rateRepo.update(r.id, { isActive: false });
      assert.equal((await rateRepo.findMatching({ serviceType: 'IT Support Services', city: `Indore ${tag}` })).length, 0);
      assert.ok((await rateRepo.list()).some((x) => x.id === r.id));
      assert.equal(await rateRepo.update(99999999, { price: 1 }), null);
    });
  });
}
