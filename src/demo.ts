import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { startSandbox } from './sandbox.js';
import { BrowserSurface } from './surface.js';
import { Runtime } from './runtime.js';
import { Audit } from './audit.js';
import { Policy } from './profile.js';
import { fixture } from './fixture.js';
import type { Operator } from './handoff.js';

// Reproducible offline demo. A generated fixture is explicitly labeled; it is NOT LLM evidence.
const directory = process.env.DEMO_OUT ?? 'evidence/offline';
await mkdir(directory, { recursive: true });
const source = process.env.CAPABILITY_PATH;
const capability = source ? JSON.parse(await readFile(source, 'utf8')) : fixture();
await writeFile(join(directory, 'capability.json'), JSON.stringify(capability, null, 2));
const server = await startSandbox(0);
const summary: unknown[] = [];
try {
  for (const [name, scenario, member] of [
    ['normal', 'normal', '10001'], ['other-input', 'normal', '10002'], ['not-found', 'normal', '99999'],
    ['validation', 'validation', '10001'], ['permission-denied', 'denied', '10001'], ['slow-load', 'slow', '10001'],
    ['known-notice', 'notice', '10001'], ['handoff', 'expired', '10001'], ['app-error', 'app-error', '10001'],
  ]) {
    const audit = new Audit(join(directory, name!));
    const policy = new Policy(server.url);
    const surface = await BrowserSurface.open(server.url, { scenario, policy });
    const operator: Operator = async (_request, live) => {
      // Integration harness acts as the operator. The CLI exposes the real headed manual path.
      await audit.event('operator_harness', { code: 'simulated_operator' });
      await (live as BrowserSurface).locator('signIn').click();
      return 'resume';
    };
    try {
      const result = await new Runtime(surface, audit, policy, { operator: scenario === 'expired' ? operator : undefined })
        .replay(capability, { memberId: member, nickname: 'Rainy day' });
      summary.push({ name, status: result.status, code: result.status === 'success' ? undefined : result.code, modelCalls: result.modelCalls });
      console.log(`${name}: ${result.status}${result.status !== 'success' ? ` (${result.code})` : ''}`);
    } finally { await surface.close(); }
  }
  let passed = 0;
  const n = 5;
  for (let i = 0; i < n; i++) {
    const audit = new Audit(join(directory, `stability-${i + 1}`));
    const policy = new Policy(server.url);
    const surface = await BrowserSurface.open(server.url, { policy });
    try {
      const result = await new Runtime(surface, audit, policy).replay(capability, { memberId: '10002', nickname: 'Reserve' });
      if (result.status === 'success') passed++;
    } finally { await surface.close(); }
  }
  await writeFile(join(directory, 'summary.json'), JSON.stringify({ artifactSource: source ?? 'hand-authored test fixture',
    operator: 'simulated integration-test operator; same browser session', runs: summary,
    stability: { passed, total: n, rate: passed / n, scope: 'local Chromium, same sandbox version; not a production reliability estimate' } }, null, 2));
  console.log(`Stability: ${passed}/${n}. Evidence: ${directory}`);
} finally { await server.close(); }
