import { readFile, writeFile } from 'node:fs/promises';
import { startSandbox } from './sandbox.js';
import { BrowserSurface } from './surface.js';
import { Policy } from './profile.js';
import { Runtime } from './runtime.js';
import { Audit } from './audit.js';

const latest = JSON.parse(await readFile('evidence/latest-discovery.json', 'utf8')) as {
  directory: string; artifact: string; runId: string;
};
const capability = JSON.parse(await readFile(latest.artifact, 'utf8'));
const root = `evidence/replay-${Date.now()}`;
const server = await startSandbox(0);
const results: unknown[] = [];
try {
  for (const run of [
    { name: 'success-new-input', memberId: '10002', nickname: 'Emergency savings', expected: 'success' },
    { name: 'not-found', memberId: '99999', nickname: 'Emergency savings', expected: 'business_outcome' },
  ]) {
    const policy = new Policy(server.url);
    const surface = await BrowserSurface.open(server.url, { policy });
    const audit = new Audit(`${root}/${run.name}`);
    try {
      const result = await new Runtime(surface, audit, policy).replay(capability, {
        memberId: run.memberId, nickname: run.nickname,
      });
      if (result.status !== run.expected || result.modelCalls !== 0) throw new Error(`Unexpected ${run.name} result`);
      if (run.name === 'not-found' && (result.status !== 'business_outcome' || result.code !== 'not_found')) {
        throw new Error('Expected not_found business outcome');
      }
      results.push({ name: run.name, result });
      console.log(`${run.name}: ${result.status}, modelCalls=${result.modelCalls}`);
    } finally { await surface.close(); }
  }
  const manifest = {
    discoveryRunId: latest.runId,
    discoveredArtifact: latest.artifact,
    discoveryProvider: capability.provenance?.model,
    replayRoot: root,
    results,
  };
  await writeFile(`${root}/manifest.json`, JSON.stringify(manifest, null, 2));
  await writeFile('evidence/latest-replay.json', JSON.stringify({ root, manifest: `${root}/manifest.json` }, null, 2));
  console.log(`Verified discovered artifact. Evidence: ${root}`);
} finally { await server.close(); }
