import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';

function run(command: string, args: string[], env: NodeJS.ProcessEnv = process.env) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', env });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)));
  });
}

console.log('\nCapability Lab reviewer path\n');
console.log('1/4 Type checking');
await run('npm', ['run', 'build']);
console.log('\n2/4 Browser tests');
await run('npm', ['test']);
console.log('\n3/4 Offline scenario matrix and stability');
const directory = `evidence/reviewer-${Date.now()}`;
await run('npm', ['run', 'demo'], { ...process.env, DEMO_OUT: directory });
console.log('\n4/4 Capability catalog');
await run('npm', ['run', 'catalog', '--', '--artifact', `${directory}/capability.json`]);
const summary = JSON.parse(await readFile(`${directory}/summary.json`, 'utf8')) as { stability: { passed: number; total: number } };
console.log(`\nPASS: ${summary.stability.passed}/${summary.stability.total} stability runs. Evidence: ${directory}`);
console.log('This command verifies replay and safety behavior. Genuine discovery is a separate local-model command: npm run discover:local');
