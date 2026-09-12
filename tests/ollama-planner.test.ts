import test from 'node:test';
import assert from 'node:assert/strict';
import { OllamaPlanner } from '../src/ollama-planner.js';
import { Audit } from '../src/audit.js';

test('local planner sends a schema and validates its response', async () => {
  const original = globalThis.fetch;
  let request: Record<string, unknown> | undefined;
  globalThis.fetch = async (_url, init) => {
    request = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({
      message: { content: JSON.stringify({ kind: 'action', action: { kind: 'fill', target: 'memberId', input: 'memberId' }, reason: 'locate_member' }) },
      prompt_eval_count: 10,
      eval_count: 5,
    }));
  };
  try {
    const planner = new OllamaPlanner('test-model', new Audit('/tmp/capability-lab-ollama-test'));
    const decision = await planner.decide('test', { state: 'search', visible: ['memberId', 'search'] }, [], 1000);
    assert.equal(planner.model, 'ollama/test-model');
    assert.equal(decision.kind, 'action');
    assert.equal(typeof request?.format, 'object');
    assert.deepEqual(request?.options, { temperature: 0 });
    assert.equal(request?.think, false);
  } finally { globalThis.fetch = original; }
});
