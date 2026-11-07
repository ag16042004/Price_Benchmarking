// Creates the demo admin, the demo government officer and their sample queries in the configured database.
// Run after the database exists:  npx prisma db push && npm run db:seed && npm run db:seed:demo
import 'dotenv/config';
import { buildContainer } from '../api/container.js';

const c = await buildContainer({ ...process.env, DEMO_SEED: 'true', QUEUE: 'inline', CACHE: 'off', DEMO_QUICK_LOGIN: '' });
await c.close();
process.exit(0);
