import { setTimeout as delay } from 'node:timers/promises';
import type { Surface } from './surface.js';
import { Action, Capability, Inputs, Outputs, artifact, type Observation, type Result, type State, type Step } from './schema.js';
import { Audit } from './audit.js';
import { RuntimeFault, Policy } from './profile.js';
import { Control, type Operator } from './handoff.js';

export type Decision = { kind: 'action'; action: Action; reason: string } | { kind: 'finish'; reason: string } | { kind: 'escalate'; reason: string };
export interface Planner {
  readonly model: string;
  decide(goal: string, observation: Observation, history: Step[], remainingMs: number): Promise<Decision>;
}
class BusinessOutcome extends Error {
  constructor(readonly code: 'not_found' | 'validation' | 'permission_denied') { super(code); }
}
export class Runtime {
  private step = 0;
  private modelCalls = 0;
  private started = Date.now();
  private observation: Observation = { state: 'unknown', visible: [] };
  private expected: State | undefined;
  private interventions = 0;
  private readonly control = new Control();
  constructor(private readonly surface: Surface, readonly audit: Audit, private readonly policy: Policy,
    private readonly options: { operator?: Operator; maxSteps?: number; timeoutMs?: number; waitMs?: number; handoffMs?: number } = {}) {}
  private remaining() {
    const remaining = (this.options.timeoutMs ?? 120000) - (Date.now() - this.started);
    if (remaining <= 0) throw new RuntimeFault('run_timeout');
    return remaining;
  }
  private async escalate(code: string) {
    if (++this.interventions > 2) throw new RuntimeFault('intervention_budget_exhausted');
    await this.control.handoff(this.surface, this.audit, this.options.operator, {
      step: this.step, expected: this.expected, observation: this.observation, reason: code,
    }, Math.min(this.remaining(), this.options.handoffMs ?? 60000));
  }
  private async settle(expected?: State): Promise<Observation> {
    this.expected = expected;
    let deadline = Date.now() + Math.min(this.remaining(), this.options.waitMs ?? 3000);
    let recoveries = 0;
    let handedBack = false;
    while (true) {
      this.remaining();
      this.observation = await this.surface.observe();
      const { state } = this.observation;
      if (['not_found', 'validation', 'permission_denied'].includes(state))
        throw new BusinessOutcome(state as 'not_found' | 'validation' | 'permission_denied');
      if (state === 'interstitial') {
        if (++recoveries > 1) throw new RuntimeFault('recovery_budget_exhausted');
        const action: Action = { kind: 'click', target: 'continue' };
        this.policy.checkAction(action);
        this.control.assert(this.control.epoch);
        await this.audit.action(action, this.step, 'known_interstitial');
        await this.surface.act(action, this.inputs!);
        continue;
      }
      if (state === 'session_expired' || state === 'app_error') {
        if (handedBack) throw new RuntimeFault('resume_state_invalid');
        await this.escalate(state); handedBack = true;
        deadline = Date.now() + Math.min(this.remaining(), this.options.waitMs ?? 3000);
        continue;
      }
      if (state !== 'loading' && state !== 'unknown' && (!expected || state === expected)) return this.observation;
      if (Date.now() >= deadline) {
        if (handedBack) throw new RuntimeFault('checkpoint_mismatch');
        await this.escalate(state === 'loading' ? 'load_timeout' : 'checkpoint_mismatch'); handedBack = true;
        deadline = Date.now() + Math.min(this.remaining(), this.options.waitMs ?? 3000);
      }
      // Bounded state polling is safe. Actions are never blindly retried after uncertain dispatch.
      await delay(Math.min(50, this.remaining()));
    }
  }
  private inputs?: Inputs;
  private async initialize(rawInputs: unknown, mode: string) {
    this.started = Date.now();
    await this.audit.event('run_started', { code: mode });
    const parsed = Inputs.safeParse(rawInputs);
    if (!parsed.success) throw new BusinessOutcome('validation');
    this.inputs = parsed.data;
    await this.settle('search');
  }
  private async perform(action: Action, reason: string, after?: State): Promise<Step> {
    this.remaining();
    this.policy.checkAction(action);
    const before = this.observation.state;
    const lease = this.control.epoch;
    this.control.assert(lease);
    if (!this.observation.visible.includes(action.target)) throw new RuntimeFault('target_not_visible');
    await this.audit.action(action, this.step, reason);
    this.control.assert(lease);
    await this.surface.act(action, this.inputs!);
    const current = await this.settle(after);
    await this.audit.event('checkpoint', { step: this.step, state: current.state });
    return { action, before, after: current.state } as Step;
  }
  private async success(): Promise<Result> {
    await this.settle('review');
    const outputs = Outputs.parse({ balance: await this.surface.read('balance'),
      reviewStatus: await this.surface.read('reviewStatus'), reviewProduct: await this.surface.read('reviewProduct') });
    const result: Result = { runId: this.audit.runId, status: 'success', outputs, modelCalls: this.modelCalls };
    await this.audit.event('run_completed', { code: 'success', modelCalls: this.modelCalls, elapsedMs: Date.now() - this.started });
    await this.audit.result(result);
    return result;
  }
  private async failure(error: unknown): Promise<Result> {
    const code = error instanceof RuntimeFault || error instanceof BusinessOutcome ? error.code : 'execution_error';
    if (!(error instanceof BusinessOutcome)) {
      await this.audit.snapshot(this.observation, this.step);
      // Action/transport failures cannot safely retry, but still offer live inspection before stopping.
      if (!['operator_required', 'operator_aborted', 'handoff_timeout', 'intervention_budget_exhausted',
        'resume_state_invalid', 'checkpoint_mismatch', 'run_timeout'].includes(code) && this.interventions === 0) {
        try { await this.escalate(code); } catch { /* Preserve original failure; never claim this repaired an uncertain action. */ }
      }
    }
    const result: Result = error instanceof BusinessOutcome
      ? { runId: this.audit.runId, status: 'business_outcome', code: error.code, step: this.step, modelCalls: this.modelCalls }
      : { runId: this.audit.runId, status: 'failure', code, step: this.step,
        expected: this.expected, observed: this.observation.state, modelCalls: this.modelCalls };
    await this.audit.event('run_completed', { code, step: this.step, modelCalls: this.modelCalls, elapsedMs: Date.now() - this.started });
    await this.audit.result(result);
    return result;
  }
  async replay(raw: unknown, inputs: unknown): Promise<Result> {
    try {
      const parsed = Capability.safeParse(raw);
      if (!parsed.success) throw new RuntimeFault('invalid_artifact');
      // Validate every action before the first UI mutation, including later steps.
      for (const step of parsed.data.steps) this.policy.checkAction(step.action);
      await this.initialize(inputs, 'replay');
      for (const [i, step] of parsed.data.steps.entries()) {
        this.step = i;
        await this.settle(step.before);
        await this.perform(step.action, 'recorded_step', step.after);
      }
      return await this.success();
    } catch (error) { return this.failure(error); }
  }
  async discover(goal: string, inputs: unknown, planner: Planner): Promise<{ result: Result; capability?: Capability }> {
    const steps: Step[] = [];
    try {
      await this.initialize(inputs, 'discovery');
      for (this.step = 0; this.step < (this.options.maxSteps ?? 20); this.step++) {
        this.remaining();
        this.modelCalls++;
        const decision = await planner.decide(goal, this.observation, steps, this.remaining());
        this.remaining();
        if (decision.kind === 'finish') {
          if (this.observation.state !== 'review') throw new RuntimeFault('premature_finish');
          const capability = artifact(steps, this.audit.runId, planner.model, 'llm-discovery');
          const result = await this.success();
          return { result, capability };
        }
        if (decision.kind === 'escalate') { await this.escalate('planner_stuck'); await this.settle(); continue; }
        steps.push(await this.perform(Action.parse(decision.action), decision.reason));
      }
      throw new RuntimeFault('step_budget_exhausted');
    } catch (error) { return { result: await this.failure(error) }; }
  }
}
