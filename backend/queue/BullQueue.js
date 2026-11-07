import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';

/** BullMQ on Redis. The API process only enqueues; a worker process (worker.js) consumes. */
export class BullQueue {
  kind = 'bull';

  constructor({ redisUrl, name = 'casper-scrape' }) {
    Object.assign(this, { redisUrl, name });
    this.producerConn = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    this.queue = new Queue(name, {
      connection: this.producerConn,
      defaultJobOptions: { attempts: 1, removeOnComplete: 100, removeOnFail: 200 }, // a retry would re-hit the sources
    });
  }

  async enqueue(job) { await this.queue.add('scrape', job); }

  startWorker(handler, { concurrency = 2 } = {}) {
    this.workerConn = new IORedis(this.redisUrl, { maxRetriesPerRequest: null });
    this.worker = new Worker(this.name, (j) => handler(j.data), { connection: this.workerConn, concurrency });
    this.worker.on('failed', (j, err) => console.error(`[queue] job ${j?.id} failed: ${err.message}`));
  }

  async close() {
    await this.worker?.close();
    await this.queue.close();
    this.producerConn.disconnect();
    this.workerConn?.disconnect();
  }
}
