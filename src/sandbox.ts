import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export async function startSandbox(port = 4173) {
  const files: Record<string, [string, string]> = { '/': ['index.html', 'text/html'],
    '/workspace': ['workspace.html', 'text/html'], '/style.css': ['style.css', 'text/css'], '/app.js': ['app.js', 'text/javascript'] };
  const server = createServer(async (req, res) => {
    const file = files[req.url ?? ''];
    if (!file || req.method !== 'GET') { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', file[1]);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'self'; connect-src 'none'; form-action 'none'; base-uri 'none'");
    res.end(await readFile(new URL(`../sandbox/${file[0]}`, import.meta.url)));
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  const address = server.address();
  return { url: `http://127.0.0.1:${typeof address === 'object' && address ? address.port : port}/`,
    close: () => new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())) };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = await startSandbox(Number(process.env.PORT ?? 4173));
  console.log(`LedgerDesk sandbox: ${server.url}\nSynthetic data only. No banking APIs or real credentials.`);
}
