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

const LEGACY_KEYS = new Set(['gitlab', 'github']);

function classifyKey(key: string): EntryKind {
  if (LEGACY_KEYS.has(key)) return 'legacy';
  if (key.includes('/')) return 'repo';
  return 'host';
}

async function loadRawYaml(): Promise<Record<string, unknown> | null> {
  try {
    const content = await readFile(credYamlPath(), 'utf-8');
    const parsed = parseYaml(content);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw new Error(
      `Could not read credentials at ${credYamlPath()}: ${(err as Error).message}. ` +
      `Fix or remove the file and try again.`,
    );
  }
}

async function loadRawYamlForWrite(): Promise<Record<string, unknown>> {
  try {
    const content = await readFile(credYamlPath(), 'utf-8');
    const parsed = parseYaml(content);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return {};
    }
    throw new Error(
      `Could not read existing credentials at ${credYamlPath()}: ${(err as Error).message}. ` +
      `Refusing to overwrite to avoid data loss. Fix or remove the file and try again.`,
    );
  }
}

export async function writeEntry(key: string, token: string): Promise<void> {
  await mkdir(credDir(), { recursive: true });
  const existing = await loadRawYamlForWrite();
  existing[key.toLowerCase()] = token;
  await writeFile(credYamlPath(), stringifyYaml(existing), { mode: 0o600 });
}

export async function readEntries(): Promise<ReadResult> {
  const raw = await loadRawYaml();
  if (!raw) return { entries: [], malformed: [] };

  const entries: Entry[] = [];
  const malformed: string[] = [];

  for (const [rawKey, rawValue] of Object.entries(raw)) {
    if (typeof rawValue !== 'string') {
      malformed.push(rawKey);
      continue;
    }
    if (rawValue.length === 0) {
      continue;
    }
    const key = rawKey.toLowerCase();
    entries.push({ key, kind: classifyKey(key), token: rawValue });
  }

  return { entries, malformed };
}
