import { readFile } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';
import type { ReleaseJetConfig } from '../types.js';

const DEFAULT_CATEGORIES: Record<string, string> = {
  feature: 'New Features',
  bug: 'Bug Fixes',
  improvement: 'Improvements',
  'breaking-change': 'Breaking Changes',
};

export const DEFAULT_CONFIG: ReleaseJetConfig = {
  provider: { type: 'gitlab', url: '' },
  source: 'issues',
  clients: [],
  categories: { ...DEFAULT_CATEGORIES },
  uncategorized: 'lenient',
};

export async function loadConfig(configPath = '.releasejet.yml'): Promise<ReleaseJetConfig> {
  let raw: Record<string, unknown>;
  try {
    const content = await readFile(configPath, 'utf-8');
    raw = parseYaml(content) ?? {};
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return {
        ...DEFAULT_CONFIG,
        clients: [],
        categories: { ...DEFAULT_CONFIG.categories },
      };
    }
    throw err;
  }
  return mergeWithDefaults(raw);
}

function mergeWithDefaults(raw: Record<string, unknown>): ReleaseJetConfig {
  const clients = raw.clients as Array<{ prefix: string; label: string }> | undefined;
  const categories = raw.categories as Record<string, string> | undefined;
  const uncategorized = raw.uncategorized as string | undefined;
  const source = raw.source as string | undefined;

  const providerRaw = raw.provider as Record<string, unknown> | undefined;
  const gitlabRaw = raw.gitlab as Record<string, unknown> | undefined;

  let provider: { type: 'gitlab' | 'github'; url: string };
  if (providerRaw) {
    provider = {
      type: (providerRaw.type as string) === 'github' ? 'github' : 'gitlab',
      url: (providerRaw.url as string) ?? '',
    };
  } else if (gitlabRaw) {
    provider = {
      type: 'gitlab',
      url: (gitlabRaw.url as string) ?? '',
    };
  } else {
    provider = { type: 'gitlab', url: '' };
  }

  return {
    provider,
    source: source === 'pull_requests' ? 'pull_requests' : 'issues',
    clients: Array.isArray(clients) ? clients : [],
    categories: categories ?? { ...DEFAULT_CATEGORIES },
    uncategorized: uncategorized === 'strict' ? 'strict' : 'lenient',
  };
}
