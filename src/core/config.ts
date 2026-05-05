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

  // Detach `notifications[*].template` strings before env-var expansion so
  // literal `${...}` and `{{...}}` round-trip untouched. Reattach afterwards.
  const detachedTemplates = detachNotificationTemplates(raw);

  // Expand ${VAR} references across all string values. Unset vars → ''.
  const expanded = expandEnvVars(raw) as Record<string, unknown>;

  reattachNotificationTemplates(expanded, detachedTemplates);

  return parseConfig(expanded);
}

/**
 * Walks `raw.notifications` (when present and an array) and removes the
 * `template` string from each entry, returning a sparse `(string | undefined)[]`
 * keyed by index. Non-string `template` values are left in place so the
 * downstream schema can reject them with a clear error.
 */
function detachNotificationTemplates(raw: unknown): Array<string | undefined> {
  const captured: Array<string | undefined> = [];
  if (!raw || typeof raw !== 'object') return captured;
  const obj = raw as Record<string, unknown>;
  const list = obj.notifications;
  if (!Array.isArray(list)) return captured;
  for (let i = 0; i < list.length; i++) {
    const entry = list[i];
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      const e = entry as Record<string, unknown>;
      if (typeof e.template === 'string') {
        captured[i] = e.template;
        delete e.template;
      }
    }
  }
  return captured;
}

function reattachNotificationTemplates(
  expanded: Record<string, unknown>,
  templates: Array<string | undefined>,
): void {
  if (templates.length === 0) return;
  const list = expanded.notifications;
  if (!Array.isArray(list)) return;
  for (let i = 0; i < list.length; i++) {
    if (templates[i] === undefined) continue;
    const entry = list[i];
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      (entry as Record<string, unknown>).template = templates[i];
    }
  }
}

/**
 * Returns a shallow clone of `config` safe for logging/debug output.
 * Redacts `notifications[*].webhookUrl` (non-empty values) to `***` so
 * resolved webhook secrets don't leak via `--debug`. Empty strings pass
 * through so users can still see the "env var unset" state.
 */
export function redactConfigForLogging(config: ReleaseJetConfig): ReleaseJetConfig {
  if (!config.notifications || config.notifications.length === 0) {
    return { ...config };
  }
  return {
    ...config,
    notifications: config.notifications.map((ch) => {
      if (ch.type === 'webhook') {
        return {
          ...ch,
          url: ch.url === '' ? '' : '***',
          ...(ch.secret !== undefined ? { secret: '***' } : {}),
        };
      }
      return {
        ...ch,
        webhookUrl: ch.webhookUrl === '' ? '' : '***',
      };
    }),
  };
}
