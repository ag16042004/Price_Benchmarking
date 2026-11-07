import fs from 'node:fs';
import path from 'node:path';
import { fingerprint } from '../../services/queryFingerprint.js';
import { summaryOf } from '../../models/queryLabel.js';

const load = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; } };

/**
 * DEMO_MODE=record: wraps the live engine and saves every non-empty, non-mock answer to a JSON file.
 * Only REAL results are recorded, with their real source links and dates. Nothing is invented.
 */
export class RecordingEngine {
  constructor({ engine, file, logger = console }) { Object.assign(this, { engine, file, logger, snaps: load(file) }); }

  async dispatchQuery(query) {
    const results = await this.engine.dispatchQuery(query);
    if (results.some((r) => r.isMock)) { this.logger.warn('[demo] mock results are never recorded (no live search provider configured)'); return results; }
    if (results.length) {
      this.snaps[fingerprint(query)] = {
        recordedAt: new Date().toISOString(),
        label: summaryOf(query),
        results,
      };
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, `${JSON.stringify(this.snaps, null, 2)}\n`);
    }
    return results;
  }
}

/**
 * DEMO_MODE=replay: answers from the recording, with no network at all. Rows are flagged isReplay so the UI
 * says so. A query that was never recorded gets an honest "no data", never a made-up answer.
 */
export class ReplayEngine {
  constructor({ file }) { this.file = file; }

  async dispatchQuery(query) {
    const snap = load(this.file)[fingerprint(query)];
    return snap ? snap.results.map((r) => ({ ...r, isMock: false, isReplay: true })) : [];
  }
}
