import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { stringify as stringifyYaml, parse as parseYaml } from 'yaml';

export type EntryKind = 'repo' | 'host' | 'legacy';

export type Entry = {
  key: string;
  kind: EntryKind;
  token: string;
};

export type ChainSource =
  | 'env-universal'
  | 'env-provider'
  | 'repo'
  | 'host'
  | 'legacy'
  | 'legacy-file';

export type ChainStep = {
  source: ChainSource;
  key?: string;
  status: 'hit' | 'miss' | 'skipped';
  value?: string;
};

export type ReadResult = {
  entries: Entry[];
  malformed: string[];
};

export const REDACTED_MASK = '••••••••';

export function redactToken(_token: string): string {
  return REDACTED_MASK;
}

const DEFAULT_PORTS: Record<string, string> = { 'http:': '80', 'https:': '443' };

export function deriveHost(hostUrl: string): string {
  const trimmed = (hostUrl ?? '').trim();
  if (!trimmed) {
    throw new Error(`Cannot derive host from empty value: "${hostUrl}"`);
  }

  let hostname: string;
  let port: string;
  try {
    const withScheme = /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const parsed = new URL(withScheme);
    hostname = parsed.hostname;
    port = parsed.port;
    if (port && DEFAULT_PORTS[parsed.protocol] === port) {
      port = '';
    }
  } catch {
    throw new Error(`Cannot derive host from invalid value: "${hostUrl}"`);
  }

  if (!hostname) {
    throw new Error(`Cannot derive host from invalid value: "${hostUrl}"`);
  }

  const result = port ? `${hostname}:${port}` : hostname;
  return result.toLowerCase();
}

export function deriveRepoKey(host: string, projectPath: string): string {
  const path = (projectPath ?? '').trim().replace(/^\/+|\/+$/g, '');
  if (!path) {
    throw new Error(`Cannot derive repo key from empty project path`);
  }
  return `${host}/${path}`.toLowerCase();
}

const credDir = (): string => join(homedir(), '.releasejet');
const credYamlPath = (): string => join(credDir(), 'credentials.yml');
const credLegacyPath = (): string => join(credDir(), 'credentials');

export const PATHS = { credDir, credYamlPath, credLegacyPath };
