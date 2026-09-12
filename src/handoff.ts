import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import type { Observation, State } from './schema.js';
import type { Surface } from './surface.js';
import type { Audit } from './audit.js';
import { RuntimeFault } from './profile.js';

export type Intervention = { sessionId: string; step: number; expected?: State; observation: Observation;
  reason: string; epoch: number; signal: AbortSignal };
export type Operator = (request: Intervention, surface: Surface) => Promise<'resume' | 'abort'>;

// Epoch is a fencing token: a stale automated caller cannot act after control changes.
export class Control {
  owner: 'automation' | 'operator' | 'closed' = 'automation';
  epoch = 0;
  assert(epoch: number) {
    if (this.owner !== 'automation' || epoch !== this.epoch) throw new RuntimeFault('control_not_owned');
  }
  async handoff(surface: Surface, audit: Audit, operator: Operator | undefined,
    context: Omit<Intervention, 'epoch' | 'sessionId' | 'signal'>, timeoutMs: number) {
    await audit.event('intervention_requested', { step: context.step, state: context.observation.state, code: context.reason });
    await audit.snapshot(context.observation, context.step);
    if (!operator) throw new RuntimeFault('operator_required');
    this.owner = 'operator';
    this.epoch++;
    await audit.event('control_transferred', { owner: this.owner, epoch: this.epoch, step: context.step });
    await surface.beginHuman(audit, this.epoch);
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const choice = await Promise.race([
        operator({ ...context, epoch: this.epoch, sessionId: surface.sessionId, signal: controller.signal }, surface),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new RuntimeFault('handoff_timeout')), timeoutMs); }),
      ]);
      if (choice !== 'resume') throw new RuntimeFault('operator_aborted');
      await surface.endHuman();
      // The runner validates state again before it executes any further step.
      this.owner = 'automation'; this.epoch++;
      await audit.event('control_transferred', { owner: this.owner, epoch: this.epoch, step: context.step });
    } catch (error) { this.owner = 'closed'; this.epoch++; await surface.endHuman(); throw error; }
    finally { clearTimeout(timer); controller.abort(); }
  }
}
export const terminalOperator: Operator = async (request) => {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    stdout.write(`\nPAUSED | session ${request.sessionId} | step ${request.step} | ${request.reason}\n` +
      'Use the already-open browser. Restore the session, then return here.\n');
    const answer = await rl.question('Type resume to hand control back; anything else aborts: ', { signal: request.signal });
    return answer.trim() === 'resume' ? 'resume' : 'abort';
  } finally { rl.close(); }
};
