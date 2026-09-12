import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Observation, Result, Action } from './schema.js';

// Projection, not regex redaction: arbitrary exception messages, goals, values, DOM and model text never enter logs.
export class Audit {
  readonly runId = randomUUID();
  private sequence = 0;
  constructor(readonly directory: string) {}
  async event(event: string, data: { step?: number; state?: string; target?: string; kind?: string;
    code?: string; owner?: string; epoch?: number; model?: string; modelCalls?: number; elapsedMs?: number;
    requestId?: string; inputTokens?: number; outputTokens?: number; reason?: string } = {}) {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await appendFile(join(this.directory, 'events.jsonl'), JSON.stringify({ time: new Date().toISOString(),
      runId: this.runId, sequence: ++this.sequence, event, ...data }) + '\n', { mode: 0o600 });
  }
  async action(action: Action, step: number, reason: string) {
    await this.event('action', { step, target: action.target, kind: action.kind, reason });
  }
  async snapshot(observation: Observation, step: number) {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await writeFile(join(this.directory, `failure-${step}.json`), JSON.stringify({
      runId: this.runId, step, state: observation.state,
      accessibleControls: observation.visible.map(target => ({ target, visible: true })),
      redaction: 'Allowlisted semantic projection; no page text, field values, URLs or pixels stored.',
    }, null, 2), { mode: 0o600 });
  }
  async result(result: Result) {
    // Outputs can contain regulated data: return to caller, do not persist their values.
    const persisted = result.status === 'success' ? { ...result, outputs: Object.fromEntries(
      Object.keys(result.outputs).map(k => [k, '[REDACTED]'])) } : result;
    await writeFile(join(this.directory, 'result.json'), JSON.stringify(persisted, null, 2), { mode: 0o600 });
  }
}
