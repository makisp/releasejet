import { readFile } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';
import type { ReleaseJetConfig } from '../types.js';
import { parseConfig } from './config.schema.js';
import { expandEnvVars } from './env-expand.js';
import { assertNoLiteralWebhookUrls } from './notification-url-validator.js';

const DEFAULT_CATEGORIES: Record<string, string> = {
  feature: 'New Features',
  bug: 'Bug Fixes',
  improvement: 'Improvements',
  'breaking-change': 'Breaking Changes',
};

export const DEFAULT_BOT_EXCLUDE: string[] = [
  'dependabot',
  'renovate',
  'gitlab-bot',
  'github-actions',
];

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
  // Reject literal webhook URLs BEFORE env-var expansion, so that a legit
  // `${SLACK_WEBHOOK_URL}` reference is not erroneously caught after expansion.
  assertNoLiteralWebhookUrls(raw);

  // Expand ${VAR} references across all string values. Unset vars → ''.
  const expanded = expandEnvVars(raw);

  return parseConfig(expanded);
}
