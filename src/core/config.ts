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
  const providerRaw = raw.provider as Record<string, unknown> | undefined;
  const gitlabRaw = raw.gitlab as Record<string, unknown> | undefined;
  const source = raw.source as string | undefined;
  const uncategorized = raw.uncategorized as string | undefined;
  const clientsRaw = raw.clients as unknown;
  const categoriesRaw = raw.categories as unknown;

  // Provider
  let provider: { type: 'gitlab' | 'github'; url: string };
  if (providerRaw) {
    const pType = providerRaw.type as string | undefined;
    if (pType !== undefined && pType !== 'gitlab' && pType !== 'github') {
      throw new Error(
        `Invalid config in .releasejet.yml\n\n  provider.type: "${pType}" is not valid. Expected "gitlab" or "github".`,
      );
    }
    const pUrl = (providerRaw.url as string) ?? '';
    if (pUrl && !pUrl.startsWith('http://') && !pUrl.startsWith('https://')) {
      throw new Error(
        `Invalid config in .releasejet.yml\n\n  provider.url: "${pUrl}" is not valid. Must start with http:// or https://.`,
      );
    }
    provider = {
      type: (pType as 'gitlab' | 'github') ?? 'gitlab',
      url: pUrl,
    };
  } else if (gitlabRaw) {
    provider = {
      type: 'gitlab',
      url: (gitlabRaw.url as string) ?? '',
    };
  } else {
    provider = { type: 'gitlab', url: '' };
  }

  // Source
  if (source !== undefined && source !== 'issues' && source !== 'pull_requests') {
    throw new Error(
      `Invalid config in .releasejet.yml\n\n  source: "${source}" is not valid. Expected "issues" or "pull_requests".`,
    );
  }

  // Uncategorized
  if (uncategorized !== undefined && uncategorized !== 'lenient' && uncategorized !== 'strict') {
    throw new Error(
      `Invalid config in .releasejet.yml\n\n  uncategorized: "${uncategorized}" is not valid. Expected "lenient" or "strict".`,
    );
  }

  // Clients
  const clients: Array<{ prefix: string; label: string }> = [];
  if (Array.isArray(clientsRaw)) {
    for (let i = 0; i < clientsRaw.length; i++) {
      const entry = clientsRaw[i] as Record<string, unknown>;
      if (!entry?.prefix || !entry?.label) {
        throw new Error(
          `Invalid config in .releasejet.yml\n\n  clients[${i}]: "prefix" and "label" are required.`,
        );
      }
      clients.push({ prefix: entry.prefix as string, label: entry.label as string });
    }
  }

  // Categories
  let categories: Record<string, string>;
  if (categoriesRaw !== undefined) {
    if (
      typeof categoriesRaw !== 'object' ||
      categoriesRaw === null ||
      Array.isArray(categoriesRaw)
    ) {
      throw new Error(
        'Invalid config in .releasejet.yml\n\n  categories: expected an object mapping labels to headings.',
      );
    }
    categories = categoriesRaw as Record<string, string>;
  } else {
    categories = { ...DEFAULT_CATEGORIES };
  }

  return {
    provider,
    source: (source as 'issues' | 'pull_requests') ?? 'issues',
    clients,
    categories,
    uncategorized: (uncategorized as 'lenient' | 'strict') ?? 'lenient',
  };
}
