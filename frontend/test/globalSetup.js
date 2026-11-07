import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const PORT = 4031;
const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../backend');

/** Starts the REAL API (in-memory data, mock search engine) so the UI tests exercise the real contract. */
export default async function setup() {
  const proc = spawn(process.execPath, ['api/server.js'], {
    cwd: backend, stdio: 'inherit',
    env: {
      ...process.env, PORT: String(PORT), DATA_STORE: 'memory', QUEUE: 'inline', CACHE: 'memory', NODE_ENV: 'test',
      JWT_SECRET: 'ui-test', ADMIN_EMAIL: 'admin@example.gov.in', ADMIN_PASSWORD: 'supersecret1', SEARCH_PROVIDER: '', DEMO_MODE: '', DEMO_SEED: 'true', DEMO_QUICK_LOGIN: 'true',
    },
  });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/api/health`)).ok) break; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  return () => proc.kill('SIGTERM');
}
