import { spawn } from 'node:child_process';

// Chapter 4: the API Server and the Scrape Engine are two processes in one container.
// This supervisor starts both and stops everything if either dies, so the platform restarts the container.
const names = [['api', 'api/server.js']];
if ((process.env.QUEUE || 'inline') === 'bull') names.push(['worker', 'worker.js']);   // inline mode needs no worker

let stopping = false;
const procs = names.map(([name, file]) => {
  const p = spawn(process.execPath, [file], { stdio: 'inherit', env: process.env });
  p.on('exit', (code) => { console.error(`[start] ${name} exited with code ${code}`); shutdown(code || 1); });
  return p;
});

function shutdown(code) {
  if (stopping) return;
  stopping = true;
  procs.forEach((p) => p.kill('SIGTERM'));
  setTimeout(() => process.exit(code), 3000).unref();
}
['SIGINT', 'SIGTERM'].forEach((sig) => process.on(sig, () => shutdown(0)));
