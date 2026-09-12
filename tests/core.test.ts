import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Policy } from '../src/profile.js';
import { Inputs, Capability } from '../src/schema.js';
import { fixture } from '../src/fixture.js';
import { Control } from '../src/handoff.js';
import { Audit } from '../src/audit.js';

test('policy rejects origin confusion, route escapes, credentials and arbitrary actions', () => {
  const p = new Policy('http://127.0.0.1:4173/');
  for (const url of ['https://evil.test/', 'http://127.0.0.1:4173.evil.test/', 'http://127.0.0.1:4173/admin',
    'http://user:password@127.0.0.1:4173/', 'http://127.0.0.1:4173/?token=secret', 'javascript:alert(1)'])
    assert.equal(p.permitsURL(url), false, url);
  assert.equal(p.permitsURL('http://127.0.0.1:4173/workspace'), true);
  assert.throws(() => p.checkAction({ kind: 'click', target: 'commit' }), /policy_denied/);
  assert.throws(() => p.checkAction({ kind: 'fill', target: 'memberId', input: 'nickname' }), /policy_denied/);
});
test('schemas reject literal secrets, unknown versions, incomplete paths and malformed inputs', () => {
  const c = fixture();
  assert.equal(Capability.safeParse(c).success, true);
  assert.equal(Capability.safeParse({ ...c, schemaVersion: '2.0' }).success, false);
  assert.equal(Capability.safeParse({ ...c, steps: c.steps.slice(1, -1) }).success, false);
  const leaked = structuredClone(c) as any; leaked.steps[0].action.value = 'secret';
  assert.equal(Capability.safeParse(leaked).success, false);
  assert.equal(Inputs.safeParse({ memberId: '../12345', nickname: 'a' }).success, false);
});
test('stale automation leases cannot act after handoff', () => {
  const control = new Control(); const lease = control.epoch;
  control.owner = 'operator'; control.epoch++;
  assert.throws(() => control.assert(lease), /control_not_owned/);
  control.owner = 'automation'; control.epoch++;
  assert.throws(() => control.assert(lease), /control_not_owned/);
  control.assert(control.epoch);
});
test('persisted successful results redact financial output', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'capability-audit-')); const audit = new Audit(dir);
  await audit.event('run_started');
  await audit.result({ runId: audit.runId, status: 'success', modelCalls: 0,
    outputs: { balance: '$123,456.78', reviewStatus: 'Ready for approval', reviewProduct: 'Savings' } });
  const data = await readFile(join(dir, 'result.json'), 'utf8');
  assert.ok(!data.includes('123,456')); assert.ok(data.includes('[REDACTED]'));
});
