import fs from 'node:fs';
import path from 'node:path';
import 'dotenv/config';
import { createApp } from './app.js';
import { buildContainer } from './container.js';
import { allowedEmailDomain } from '../models/validators.js';

const port = process.env.PORT || 4000;

// Say which settings file is in use. A missing or misplaced backend/.env is the most common reason for a confusing start.
const envFile = path.resolve(process.cwd(), '.env');
console.log(fs.existsSync(envFile)
  ? `[config] settings read from ${envFile}`
  : `[config] NO .env FILE at ${envFile}: built-in defaults are in use. Copy .env.demo.example to backend/.env and restart (see docs/RUN_GUIDE.md, step 3).`);

const container = await buildContainer();
const e = process.env;
console.log(`[config] data: ${e.DATA_STORE || 'prisma'} | search: ${e.SEARCH_PROVIDER || 'none (sample data only)'} | demo seed: ${e.DEMO_SEED === 'true' ? 'on' : 'off'} | one-click sign-in: ${container.demo.quickLogin ? 'on' : 'off'} | sign-up: ${allowedEmailDomain() ? `@${allowedEmailDomain()} only` : 'any email'}`);

// With QUEUE=bull the worker normally runs as its own process (npm run worker);
// set EMBEDDED_WORKER=true to run it inside the API process for local dev.
if (container.queue.kind === 'bull' && process.env.EMBEDDED_WORKER === 'true') container.startWorker();
createApp(container).listen(port, () => console.log(`CASPER API listening on :${port} (store: ${process.env.DATA_STORE || 'prisma'}, queue: ${container.queue.kind})`));
