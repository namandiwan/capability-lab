import { startSandbox } from './sandbox.js';
import { BrowserSurface } from './surface.js';
import { Policy } from './profile.js';
import { Runtime } from './runtime.js';
import { Audit } from './audit.js';
import { writeFile } from 'node:fs/promises';

// Run with: node --env-file=.env --import tsx src/live-demo.ts
// A fresh directory preserves unsuccessful attempts and prevents mixed evidence.
const directory = 'evidence/discovery-' + Date.now();
const server = await startSandbox(0);
let surface: BrowserSurface | undefined;
try {
  const policy = new Policy(server.url);
  surface = await BrowserSurface.open(server.url, { policy });
  const audit = new Audit(directory);
  const planner = process.env.MODEL_PROVIDER === 'openai'
    ? new (await import('./planner.js')).OpenAIPlanner(process.env.OPENAI_MODEL || 'gpt-4.1-mini', process.env.OPENAI_API_KEY || '', audit)
    : new (await import('./ollama-planner.js')).OllamaPlanner(process.env.OLLAMA_MODEL || 'qwen3:4b', audit);
  const run = await new Runtime(surface, audit, policy, { timeoutMs: process.env.MODEL_PROVIDER === 'openai' ? 120_000 : 600_000 }).discover(
    'Look up the supplied member, read their savings balance, and prepare a Savings sub-account using the supplied nickname. Stop at review.',
    { memberId: '10001', nickname: 'Rainy day' }, planner);
  if (run.capability) {
    await writeFile(directory + '/capability.json', JSON.stringify(run.capability, null, 2));
    await writeFile('evidence/latest-discovery.json', JSON.stringify({ directory, artifact: directory + '/capability.json', runId: run.result.runId }, null, 2));
  }
  console.log(JSON.stringify({ directory, result: run.result }, null, 2));
  if (run.result.status !== 'success') process.exitCode = 1;
} catch {
  console.error('Live discovery setup failed; sensitive error details suppressed.'); process.exitCode = 1;
} finally { if (surface) await surface.close(); await server.close(); }
