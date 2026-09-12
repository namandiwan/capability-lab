import { readFile } from 'node:fs/promises';
import { z } from 'zod';

const Registry = z.object({
  capabilities: z.array(z.object({
    name: z.string().min(1),
    artifact: z.string().min(1),
  }).strict()).min(1),
}).strict();

export async function resolveCapability(name: string, registryPath = 'capabilities/registry.json') {
  const registry = Registry.parse(JSON.parse(await readFile(registryPath, 'utf8')));
  const matches = registry.capabilities.filter((entry) => entry.name === name);
  if (matches.length !== 1) throw new Error(matches.length ? 'ambiguous_capability' : 'unknown_capability');
  return matches[0]!.artifact;
}

export async function listCapabilities(registryPath = 'capabilities/registry.json') {
  return Registry.parse(JSON.parse(await readFile(registryPath, 'utf8'))).capabilities;
}
