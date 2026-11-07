import 'dotenv/config';
import { buildContainer } from './api/container.js';

// Scrape-engine process: consumes BullMQ jobs (QUEUE=bull).
const container = await buildContainer();
if (container.queue.kind !== 'bull') {
  console.log('QUEUE is not "bull": nothing to do (inline mode runs inside the API process).');
  process.exit(0);
}
container.startWorker();
console.log('CASPER worker started');
