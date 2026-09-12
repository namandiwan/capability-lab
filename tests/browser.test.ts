import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startSandbox } from '../src/sandbox.js';
import { BrowserSurface } from '../src/surface.js';
import { Runtime, type Planner } from '../src/runtime.js';
import { Audit } from '../src/audit.js';
import { Policy } from '../src/profile.js';
import { fixture, fixtureSteps } from '../src/fixture.js';
import type { Operator } from '../src/handoff.js';

async function setup(scenario = 'normal') {
  const server = await startSandbox(0); const policy = new Policy(server.url);
  const surface = await BrowserSurface.open(server.url, { scenario, policy });
  const dir = await mkdtemp(join(tmpdir(), 'capability-test-')); const audit = new Audit(dir);
  return { server, policy, surface, audit, dir, close: async () => { await surface.close(); await server.close(); } };
}
const inputs = { memberId: '10002', nickname: 'SensitiveNickname' };

test('real browser replay uses new parameters and returns typed outputs with zero model calls', async () => {
  const s = await setup();
  try {
    const result = await new Runtime(s.surface, s.audit, s.policy).replay(fixture(), inputs);
    assert.equal(result.status, 'success');
    if (result.status === 'success') assert.deepEqual(result.outputs, { balance: '$8,240.75', reviewStatus: 'Ready for approval', reviewProduct: 'Savings' });
    assert.equal(result.modelCalls, 0);
    for (const file of await readdir(s.dir)) {
      const text = await readFile(join(s.dir, file), 'utf8');
      for (const secret of ['SensitiveNickname', '10002', '$8,240.75']) assert.ok(!text.includes(secret));
    }
  } finally { await s.close(); }
});
for (const [scenario, member, expected] of [['normal', '99999', 'not_found'], ['denied', '10001', 'permission_denied'],
  ['validation', '10001', 'validation']] as const) {
  test(`business outcome: ${expected}`, async () => {
    const s = await setup(scenario);
    try { const r = await new Runtime(s.surface, s.audit, s.policy).replay(fixture(), { ...inputs, memberId: member });
      assert.equal(r.status, 'business_outcome'); assert.equal(r.code, expected);
    } finally { await s.close(); }
  });
}
for (const scenario of ['slow', 'notice']) test(`bounded recovery: ${scenario}`, async () => {
  const s = await setup(scenario);
  try { assert.equal((await new Runtime(s.surface, s.audit, s.policy).replay(fixture(), inputs)).status, 'success'); }
  finally { await s.close(); }
});
test('handoff operates the identical live session, records manual action, resumes expected state', async () => {
  const s = await setup('expired'); let called = false;
  const operator: Operator = async (request, live) => {
    called = true; assert.equal(request.sessionId, s.surface.sessionId); assert.equal(live, s.surface);
    await s.surface.locator('signIn').click(); return 'resume';
  };
  try {
    const r = await new Runtime(s.surface, s.audit, s.policy, { operator }).replay(fixture(), inputs);
    assert.equal(r.status, 'success'); assert.ok(called);
    const events = await readFile(join(s.dir, 'events.jsonl'), 'utf8');
    assert.ok(events.includes('human_action')); assert.ok(events.includes('signIn'));
    assert.equal(events.match(/control_transferred/g)?.length, 2);
  } finally { await s.close(); }
});
test('invalid resume does not blindly continue', async () => {
  const s = await setup('expired');
  try {
    const r = await new Runtime(s.surface, s.audit, s.policy, { operator: async () => 'resume' }).replay(fixture(), inputs);
    assert.equal(r.status, 'failure'); if (r.status === 'failure') assert.equal(r.code, 'resume_state_invalid');
  } finally { await s.close(); }
});
test('missing operator produces intervention and richer redacted evidence', async () => {
  const s = await setup('app-error');
  try {
    const r = await new Runtime(s.surface, s.audit, s.policy).replay(fixture(), inputs);
    assert.equal(r.status, 'failure'); if (r.status === 'failure') assert.equal(r.code, 'operator_required');
    const snapshot = JSON.parse(await readFile(join(s.dir, 'failure-1.json'), 'utf8'));
    assert.equal(snapshot.state, 'app_error'); assert.ok(Array.isArray(snapshot.accessibleControls));
  } finally { await s.close(); }
});
test('tampered artifact is rejected before first mutation', async () => {
  const s = await setup(); const c = fixture(); c.steps.at(-1)!.action = { kind: 'click', target: 'commit' };
  try {
    const r = await new Runtime(s.surface, s.audit, s.policy).replay(c, inputs);
    assert.equal(r.status, 'failure'); if (r.status === 'failure') assert.equal(r.code, 'policy_denied');
    assert.equal(await s.surface.locator('memberId').inputValue(), '');
  } finally { await s.close(); }
});
test('duplicate accessible targets fail closed', async () => {
  const s = await setup();
  try {
    await s.surface.page.frames()[1]!.evaluate(() => {
      document.body.appendChild(document.querySelector('button')!.cloneNode(true));
    });
    const r = await new Runtime(s.surface, s.audit, s.policy).replay(fixture(), inputs);
    assert.equal(r.status, 'failure'); if (r.status === 'failure') assert.equal(r.code, 'ambiguous_target');
  } finally { await s.close(); }
});
test('discovery loop compiles actual actions; fake planner is ONLY a unit-test double', async () => {
  const s = await setup(); let i = 0;
  const planner: Planner = { model: 'test-double', decide: async () => {
    const step = fixtureSteps[i++]; return step ? { kind: 'action', action: step.action, reason: 'test' } : { kind: 'finish', reason: 'test' };
  } };
  try {
    const run = await new Runtime(s.surface, s.audit, s.policy).discover('test goal', inputs, planner);
    assert.equal(run.result.status, 'success'); assert.equal(run.capability?.steps.length, 7);
    assert.equal(run.result.modelCalls, 8);
    assert.ok(!JSON.stringify(run.capability).includes(inputs.nickname));
  } finally { await s.close(); }
});
test('premature model success is rejected', async () => {
  const s = await setup();
  try {
    const r = await new Runtime(s.surface, s.audit, s.policy).discover('test', inputs,
      { model: 'test-double', decide: async () => ({ kind: 'finish', reason: 'test' }) });
    assert.equal(r.result.status, 'failure'); assert.equal(r.capability, undefined);
  } finally { await s.close(); }
});
