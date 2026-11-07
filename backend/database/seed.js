import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { ITEM_TYPES, SERVICE_TYPES, SOURCES } from './seedData.js';

const prisma = new PrismaClient();

for (const t of ITEM_TYPES) await prisma.itemType.upsert({ where: { name: t.name }, update: {}, create: t });
for (const t of SERVICE_TYPES) await prisma.serviceType.upsert({ where: { name: t.name }, update: {}, create: t });
for (const s of SOURCES) await prisma.source.upsert({ where: { domain: s.domain }, update: {}, create: s });

if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
  await prisma.user.upsert({
    where: { email: process.env.ADMIN_EMAIL.toLowerCase() },
    update: {},
    create: {
      name: 'Administrator', email: process.env.ADMIN_EMAIL.toLowerCase(), role: 'ADMIN',
      passwordHash: await bcrypt.hash(process.env.ADMIN_PASSWORD, 10),
    },
  });
}
console.log('Seeded item types, service types, sources' + (process.env.ADMIN_EMAIL ? ', admin user' : ''));
await prisma.$disconnect();
