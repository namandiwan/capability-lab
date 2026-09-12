import { z } from 'zod';

export const TargetId = z.enum(['memberId', 'search', 'openMember', 'prepareAccount',
  'product', 'nickname', 'review', 'balance', 'reviewStatus', 'reviewProduct',
  'continue', 'signIn', 'commit']);
export type TargetId = z.infer<typeof TargetId>;
export const State = z.enum(['search', 'results', 'detail', 'form', 'review', 'not_found',
  'validation', 'permission_denied', 'session_expired', 'interstitial', 'app_error', 'loading', 'unknown']);
export type State = z.infer<typeof State>;
export const Action = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('click'), target: TargetId }).strict(),
  z.object({ kind: z.literal('fill'), target: TargetId, input: z.enum(['memberId', 'nickname']) }).strict(),
  z.object({ kind: z.literal('select'), target: TargetId, value: z.enum(['Savings', 'Checking']) }).strict(),
]);
export type Action = z.infer<typeof Action>;
export const Inputs = z.object({ memberId: z.string().regex(/^\d{5}$/), nickname: z.string().min(1).max(30) }).strict();
export type Inputs = z.infer<typeof Inputs>;
export const Outputs = z.object({ balance: z.string().regex(/^\$\d{1,3}(,\d{3})*\.\d{2}$/),
  reviewStatus: z.literal('Ready for approval'), reviewProduct: z.enum(['Savings', 'Checking']) }).strict();
export type Outputs = z.infer<typeof Outputs>;
const Healthy = z.enum(['search', 'results', 'detail', 'form', 'review']);
export const Step = z.object({ action: Action, before: Healthy, after: Healthy }).strict();
export type Step = z.infer<typeof Step>;
export const Capability = z.object({
  schemaVersion: z.literal('1.0'), name: z.literal('prepare-subaccount-review'), version: z.literal('1.0.0'),
  description: z.literal('Look up a member, read savings balance, and prepare a sub-account review without committing.'),
  application: z.object({ family: z.literal('ledgerdesk'), bindingVersion: z.literal('1.0') }).strict(),
  inputContract: z.literal('member-review-inputs/v1'), outputContract: z.literal('member-review-outputs/v1'),
  steps: z.array(Step).min(1).max(30),
  outputs: z.tuple([z.literal('balance'), z.literal('reviewStatus'), z.literal('reviewProduct')]),
  checkpoint: z.literal('review'),
  provenance: z.object({ kind: z.enum(['llm-discovery', 'test-fixture']), runId: z.string().uuid(),
    model: z.string().max(100), createdAt: z.string().datetime() }).strict(),
}).strict().superRefine((c, ctx) => {
  if (c.steps[0]?.before !== 'search' || c.steps.at(-1)?.after !== c.checkpoint)
    ctx.addIssue({ code: 'custom', message: 'Flow must start at search and reach its checkpoint' });
  for (let i = 1; i < c.steps.length; i++) {
    if (c.steps[i - 1]?.after !== c.steps[i]?.before)
      ctx.addIssue({ code: 'custom', message: 'Discontinuous state contract' });
  }
});
export type Capability = z.infer<typeof Capability>;
export type Observation = { state: State; visible: TargetId[] };
export type Result = {
  runId: string; status: 'success'; outputs: Outputs; modelCalls: number;
} | { runId: string; status: 'business_outcome'; code: 'not_found' | 'validation' | 'permission_denied'; step: number; modelCalls: number;
} | { runId: string; status: 'failure'; code: string; step: number; expected?: State; observed?: State; modelCalls: number };

export function artifact(steps: Step[], runId: string, model: string, kind: 'llm-discovery' | 'test-fixture'): Capability {
  return Capability.parse({ schemaVersion: '1.0', name: 'prepare-subaccount-review', version: '1.0.0',
    description: 'Look up a member, read savings balance, and prepare a sub-account review without committing.',
    application: { family: 'ledgerdesk', bindingVersion: '1.0' },
    inputContract: 'member-review-inputs/v1', outputContract: 'member-review-outputs/v1', steps,
    outputs: ['balance', 'reviewStatus', 'reviewProduct'], checkpoint: 'review',
    provenance: { kind, runId, model, createdAt: new Date().toISOString() } });
}
