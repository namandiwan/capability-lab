import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { Audit } from './audit.js';
import { BrowserSurface } from './surface.js';
import { Runtime } from './runtime.js';
import { Policy } from './profile.js';
import { terminalOperator } from './handoff.js';
import { Inputs, Outputs, Capability } from './schema.js';

async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    url: { type: 'string', default: 'http://127.0.0.1:4173/' }, goal: { type: 'string' },
    artifact: { type: 'string', default: 'evidence/discovery/capability.json' },
    member: { type: 'string', default: '10001' }, nickname: { type: 'string', default: 'Rainy day' },
    out: { type: 'string' }, scenario: { type: 'string', default: 'normal' },
    headed: { type: 'boolean', default: false }, operator: { type: 'boolean', default: false },
  } });
  const command = positionals[0];
  if (command === 'catalog') {
    const capability = Capability.parse(JSON.parse(await readFile(values.artifact!, 'utf8')));
    console.log(JSON.stringify({ type: 'function', name: capability.name, description: capability.description,
      parameters: z.toJSONSchema(Inputs), returns: z.toJSONSchema(Outputs), artifact: values.artifact,
      invocation: 'npm run replay -- --artifact <path> --member <memberId> --nickname <nickname>' }, null, 2));
    return;
  }
  if (!['discover', 'replay'].includes(command ?? '')) throw new Error('usage');
  if (values.operator && !values.headed) throw new Error('operator_requires_headed');
  const directory = values.out ?? join('runs', `${command}-${Date.now()}`);
  const audit = new Audit(directory);
  const policy = new Policy(values.url!);
  const surface = await BrowserSurface.open(values.url!, { headed: values.headed, scenario: values.scenario, policy });
  try {
    const runtime = new Runtime(surface, audit, policy, { operator: values.operator ? terminalOperator : undefined });
    const inputs = { memberId: values.member, nickname: values.nickname };
    if (command === 'discover') {
      // Replay has no provider import and works without a model or credentials.
      const planner = process.env.MODEL_PROVIDER === 'openai'
        ? new (await import('./planner.js')).OpenAIPlanner(process.env.OPENAI_MODEL ?? 'gpt-4.1-mini', process.env.OPENAI_API_KEY ?? '', audit)
        : new (await import('./ollama-planner.js')).OllamaPlanner(process.env.OLLAMA_MODEL ?? 'qwen3:4b', audit);
      const run = await runtime.discover(values.goal ??
        'Look up the supplied member, read their current savings balance, and prepare a Savings sub-account using the supplied nickname. Stop at the review screen.', inputs, planner);
      if (run.capability) {
        await mkdir(directory, { recursive: true });
        await writeFile(join(directory, 'capability.json'), JSON.stringify(run.capability, null, 2));
      }
      console.log(JSON.stringify(run.result, null, 2));
      if (run.result.status === 'failure') process.exitCode = 1;
    } else {
      const raw = JSON.parse(await readFile(values.artifact!, 'utf8'));
      const result = await runtime.replay(raw, inputs);
      console.log(JSON.stringify(result, null, 2));
      if (result.status === 'failure') process.exitCode = 1;
    }
    console.error(`Evidence: ${directory}`);
  } finally { await surface.close(); }
}
main().catch(() => { console.error('Command failed. Check arguments, local sandbox, browser installation and model key. Raw errors are suppressed to protect sensitive values.'); process.exitCode = 1; });
