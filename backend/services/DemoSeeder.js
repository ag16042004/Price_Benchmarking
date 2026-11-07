import bcrypt from 'bcryptjs';
import { ResultItem } from '../models/ResultItem.js';

/** The two demo accounts. The admin reuses ADMIN_EMAIL / ADMIN_PASSWORD when they are set. */
export function demoAccounts(env = process.env) {
  return {
    admin: { name: 'Demo Administrator', email: (env.ADMIN_EMAIL || 'admin@demo.gov.in').toLowerCase(), password: env.ADMIN_PASSWORD || 'Admin@demo123', role: 'ADMIN' },
    officer: { name: 'Demo Officer', email: (env.DEMO_OFFICER_EMAIL || 'officer@demo.gov.in').toLowerCase(), password: env.DEMO_OFFICER_PASSWORD || 'Officer@demo123', role: 'OFFICER' },
  };
}

/** Creates the user if missing, or fixes the role. Goes straight to the repository, so the @gov.in and invite-code rules (which guard public sign-up) do not apply to seeded accounts. */
export async function ensureUser(userRepo, { name, email, password, role }) {
  const found = await userRepo.findByEmail(email);
  if (found) { if (found.role !== role) await userRepo.setRole(found.id, role); return found; }
  return userRepo.create({ name, email, passwordHash: await bcrypt.hash(password, 10), role });
}

const daysAgo = (n) => new Date(Date.now() - n * 86_400_000);

// SAMPLE DATA. Every row is flagged isMock, so the app shows its "sample data" banner and nobody can mistake it for a
// real price. Source names and links are deliberately generic: no real vendor is credited with an invented price.
const sample = (n, price, ageDays, extra = {}) => ({
  price, currency: 'INR', sourceUrl: `https://sample-${n}.example.com/listing`, sourceName: `Sample source ${n}`,
  vintage: daysAgo(ageDays), vintageBasis: 'page', matchScore: 1, isMock: true, ...extra,
});
const SAMPLES = [
  { daysAgo: 6, query: { queryType: 'EXACT_MATCH', itemName: 'Laptop', itemTypeName: 'Computers & Accessories', make: 'Dell', model: 'Latitude 5430' },
    results: (d) => [sample(1, 71200, 20, { itemDetails: `${d} (SAMPLE DATA)` }), sample(2, 73450, 45, { itemDetails: `${d} (SAMPLE DATA)` }), sample(3, 76990, 90, { itemDetails: `${d} (SAMPLE DATA)` }), sample(4, 79300, 520, { itemDetails: `${d} (SAMPLE DATA)` })] },
  { daysAgo: 4, query: { queryType: 'SPECIFICATION', itemName: 'Desktop Computer', itemTypeName: 'Computers & Accessories', specifications: [{ key: 'Processor', value: 'Intel i5' }, { key: 'RAM', value: '16 GB' }, { key: 'Storage', value: '512 GB SSD' }] },
    results: (d) => [sample(5, 48900, 30, { matchScore: 1, itemDetails: `${d}: i5, 16 GB, 512 GB SSD (SAMPLE DATA)` }), sample(6, 52400, 75, { matchScore: 1, itemDetails: `${d}: i5, 16 GB, 512 GB SSD (SAMPLE DATA)` }), sample(7, 45500, 40, { matchScore: 0.67, itemDetails: `${d}: i5, 16 GB (SAMPLE DATA)` })] },
  { daysAgo: 2, query: { queryType: 'SERVICE', serviceTypeName: 'IT Support Services', location: 'Indore, Madhya Pradesh', description: 'On-site hardware support for 50 desktop computers' },
    results: (d) => [sample(8, 2400, 25, { itemDetails: `${d} (SAMPLE DATA)` }), sample(9, 2750, 60, { itemDetails: `${d} (SAMPLE DATA)` }), sample(10, 3100, 110, { itemDetails: `${d} (SAMPLE DATA)` })] },
  { daysAgo: 1, query: { queryType: 'EXACT_MATCH', itemName: 'Software Defined Radio', itemTypeName: 'Communication Equipment', make: 'Ettus Research', model: 'USRP B200mini' },
    results: (d) => [sample(11, 118000, 35, { itemDetails: `${d} (SAMPLE DATA)` }), sample(12, 124500, 80, { itemDetails: `${d} (SAMPLE DATA)` })] },
];
const labelOf = (q) => (q.queryType === 'SERVICE' ? `${q.serviceTypeName} in ${q.location}` : q.queryType === 'SPECIFICATION' ? q.itemName : `${q.make} ${q.model}`);

/**
 * Creates the demo admin and officer accounts and a few finished sample queries for the officer.
 * Safe to run again: it never duplicates users, and it adds queries only to an account that has none.
 */
export async function seedDemo({ userRepo, queryRepo, env = process.env }) {
  const acc = demoAccounts(env);
  const admin = await ensureUser(userRepo, acc.admin);
  const officer = await ensureUser(userRepo, acc.officer);
  let created = 0;
  for (const [owner, items] of [[officer, SAMPLES], [admin, SAMPLES.slice(0, 1)]]) {
    if ((await queryRepo.listByUser(owner.id, { pageSize: 1 })).total > 0) continue;
    for (const s of items) {
      const q = await queryRepo.create({ userId: owner.id, createdAt: daysAgo(s.daysAgo), ...s.query });
      await queryRepo.complete(q.id, { results: s.results(labelOf(s.query)).map((r) => new ResultItem(r)), noDataFlag: false });
      created++;
    }
  }
  return { accounts: acc, sampleQueriesCreated: created };
}
