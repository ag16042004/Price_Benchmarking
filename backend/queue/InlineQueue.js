/** In-process queue for dev, tests and Redis-free demos. Same interface as BullQueue. */
export class InlineQueue {
  kind = 'inline';
  startWorker(handler) { this.handler = handler; }
  async enqueue(job) {
    setImmediate(() => Promise.resolve(this.handler(job)).catch((e) => console.error('[queue] job failed', e)));
  }
  async close() {}
}
