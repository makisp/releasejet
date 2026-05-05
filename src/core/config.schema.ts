import { z } from 'zod';
import type { ReleaseJetConfig } from '../types.js';
import {
  findReservedHeaderKeys as findReservedHeaderKeysImported,
  findLiteralTokenInHeaderValue as findLiteralTokenInHeaderValueImported,
} from './notification-header-validator.js';

const DEFAULT_CATEGORIES = {
  feature: 'New Features',
  bug: 'Bug Fixes',
  improvement: 'Improvements',
  'breaking-change': 'Breaking Changes',
} as const;

const DEFAULT_BOT_EXCLUDE = [
  'dependabot',
  'renovate',
  'gitlab-bot',
  'github-actions',
] as const;

const ProviderTypeSchema = z.enum(['gitlab', 'github']).describe(
  'Git hosting provider. "gitlab" or "github".',
);

const ProviderSchema = z
  .object({
    type: ProviderTypeSchema.optional().default('gitlab'),
    url: z
      .string()
      .describe('Base URL of the provider (e.g., https://gitlab.com).')
      .optional()
      .default(''),
  })
  .describe('Provider configuration.');

const ClientSchema = z
  .object({
    prefix: z.string().describe('Tag prefix that identifies this client (e.g., "mobile").'),
    label: z.string().describe('Provider label that scopes issues to this client.'),
  })
  .describe('Client entry for multi-client repos.');

const ContributorsSchema = z
  .object({
    enabled: z.boolean().optional().default(true),
    exclude: z
      .array(z.string())
      .default([...DEFAULT_BOT_EXCLUDE])
      .describe('Usernames to omit from the contributors section.'),
  })
  .describe('Contributors section configuration.');

const SlackDiscordTeamsChannelSchema = z
  .object({
    type: z.enum(['slack', 'discord', 'teams']).describe('Channel type.'),
    enabled: z.boolean().describe('Whether this channel should fire.'),
    webhookUrl: z
      .string()
      .describe('Webhook URL. Must be an ${ENV_VAR} reference; literal URLs are rejected before this layer.'),
    template: z
      .string()
      .optional()
      .describe('Optional Handlebars template for the message body. Empty string treated as absent.'),
  })
  .describe('Slack / Discord / Teams notification channel.');

const WebhookEventEnum = z.enum(['release.generated', 'release.published']);

const WebhookChannelSchema = z
  .object({
    type: z.literal('webhook').describe('Channel type.'),
    enabled: z.boolean().describe('Whether this channel should fire.'),
    url: z
      .string()
      .describe('Arbitrary http(s) endpoint URL. ${VAR} expansion supported.'),
    secret: z
      .string()
      .min(1, { message: 'secret must be a non-empty string when present (post-expansion).' })
      .optional()
      .describe('Optional HMAC-SHA256 secret. If present, signs the body and sends X-ReleaseJet-Signature.'),
    events: z
      .array(WebhookEventEnum)
      .min(1, { message: 'events: must be a non-empty array; subscribe to at least one event.' })
      .describe('Required, non-empty list of events this channel subscribes to.'),
    headers: z
      .record(z.string(), z.string())
      .optional()
      .describe('Optional custom HTTP headers. ${VAR} expansion supported on values.'),
  })
  .strict()
  .describe('Generic outbound webhook channel (M4).');

const NotificationChannelSchema = z
  .discriminatedUnion('type', [SlackDiscordTeamsChannelSchema, WebhookChannelSchema])
  .describe('One notification channel entry.');

function suggestClosest(input: string, candidates: string[]): string | null {
  if (!input) return null;
  let best: string | null = null;
  let bestDist = Infinity;
  for (const c of candidates) {
    const d = levenshtein(input, c);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return bestDist <= 3 ? best : null;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

const JiraSchema = z
  .object({
    baseUrl: z.string().describe('Jira instance root URL (e.g., https://acme.atlassian.net).'),
    projects: z
      .array(z.string())
      .describe('Allowlist of Jira project keys (uppercase, e.g., ["PROJ", "BUG"]).'),
  })
  .describe('Jira ticket linking configuration (F3).');

export const ReleaseJetConfigSchema = z
  .object({
    provider: ProviderSchema.optional(),
    gitlab: z
      .object({ url: z.string().optional() })
      .optional()
      .describe('DEPRECATED: use `provider` instead. Kept for backward compatibility.'),
    source: z
      .enum(['issues', 'pull_requests'])
      .optional()
      .default('issues')
      .describe('Source for release notes: closed issues or merged pull requests.'),
    clients: z.array(ClientSchema).optional().default([]),
    categories: z
      .record(z.string(), z.string())
      .default({ ...DEFAULT_CATEGORIES })
      .describe('Map of issue label → section heading.'),
    uncategorized: z
      .enum(['lenient', 'strict'])
      .optional()
      .default('lenient')
      .describe('How to handle issues without a known category label.'),
    contributors: ContributorsSchema.optional(),
    template: z
      .string()
      .optional()
      .describe('Template name ("default", a Pro template, or a path to a .hbs file).'),
    tagFormat: z
      .string()
      .optional()
      .describe('Tag format pattern (e.g., "v{version}" or "{prefix}-v{version}").'),
    notifications: z
      .array(NotificationChannelSchema)
      .optional()
      .describe('Webhook notification channels (Pro feature).'),
    description: z
      .enum(['none', 'extract', 'ai'])
      .optional()
      .default('none')
      .describe(
        'Issue/PR description rendering: "none" (off, default), "extract" (cleaned first paragraph), "ai" (Pro M3a; treated as "none" in core).',
      ),
    projectName: z
      .string()
      .min(1, { message: 'projectName must be a non-empty string' })
      .optional()
      .describe('Human-readable project name shown in notification cards.'),
    jira: JiraSchema.optional().describe('Jira ticket linking (F3).'),
  })
  .describe('ReleaseJet configuration (.releasejet.yml).');

export type ReleaseJetConfigInput = z.input<typeof ReleaseJetConfigSchema>;

export function parseConfig(raw: unknown): ReleaseJetConfig {
  // Pre-validation checks that match the legacy error format exactly.
  let data = (raw ?? {}) as Record<string, unknown>;

  // Legacy tolerance: clients: null (from empty YAML value) → treat as omitted.
  if (data.clients === null) {
    data = { ...data, clients: undefined };
  }

  // Provider migration (legacy gitlab: key)
  const providerRaw = data.provider as Record<string, unknown> | undefined;
  const gitlabRaw = data.gitlab as Record<string, unknown> | undefined;

  if (providerRaw?.type !== undefined && providerRaw.type !== 'gitlab' && providerRaw.type !== 'github') {
    throw new Error(
      `Invalid config in .releasejet.yml\n\n  provider.type: "${String(providerRaw.type)}" is not valid. Expected "gitlab" or "github".`,
    );
  }
  if (providerRaw?.url && typeof providerRaw.url === 'string') {
    const u = providerRaw.url;
    if (!u.startsWith('http://') && !u.startsWith('https://')) {
      throw new Error(
        `Invalid config in .releasejet.yml\n\n  provider.url: "${u}" is not valid. Must start with http:// or https://.`,
      );
    }
  }
  if (data.source !== undefined && data.source !== 'issues' && data.source !== 'pull_requests') {
    throw new Error(
      `Invalid config in .releasejet.yml\n\n  source: "${String(data.source)}" is not valid. Expected "issues" or "pull_requests".`,
    );
  }
  if (data.uncategorized !== undefined && data.uncategorized !== 'lenient' && data.uncategorized !== 'strict') {
    throw new Error(
      `Invalid config in .releasejet.yml\n\n  uncategorized: "${String(data.uncategorized)}" is not valid. Expected "lenient" or "strict".`,
    );
  }
  if (data.tagFormat !== undefined) {
    if (typeof data.tagFormat !== 'string') {
      throw new Error(
        'Invalid config in .releasejet.yml\n\n  tagFormat: expected a string (e.g., "v{version}").',
      );
    }
    if (!data.tagFormat.includes('{version}')) {
      throw new Error(
        'Invalid config in .releasejet.yml\n\n  tagFormat: must contain the {version} placeholder.',
      );
    }
  }

  if (Array.isArray(data.clients)) {
    for (let i = 0; i < data.clients.length; i++) {
      const c = data.clients[i] as Record<string, unknown> | null;
      if (!c?.prefix || !c?.label) {
        throw new Error(
          `Invalid config in .releasejet.yml\n\n  clients[${i}]: "prefix" and "label" are required.`,
        );
      }
    }
  }

  if (data.categories !== undefined) {
    if (typeof data.categories !== 'object' || data.categories === null || Array.isArray(data.categories)) {
      throw new Error(
        'Invalid config in .releasejet.yml\n\n  categories: expected an object mapping labels to headings.',
      );
    }
  }

  if (data.contributors !== undefined) {
    const c = data.contributors;
    if (typeof c !== 'object' || c === null || Array.isArray(c)) {
      throw new Error(
        'Invalid config in .releasejet.yml\n\n  contributors: expected an object with "enabled" and/or "exclude" fields.',
      );
    }
    const cRec = c as Record<string, unknown>;
    if (cRec.enabled !== undefined && typeof cRec.enabled !== 'boolean') {
      throw new Error(
        'Invalid config in .releasejet.yml\n\n  contributors.enabled: expected a boolean (true or false).',
      );
    }
    if (cRec.exclude !== undefined && !Array.isArray(cRec.exclude)) {
      throw new Error(
        'Invalid config in .releasejet.yml\n\n  contributors.exclude: expected an array of usernames to exclude.',
      );
    }
  }

  if (data.notifications !== undefined) {
    if (!Array.isArray(data.notifications)) {
      throw new Error(
        'Invalid config in .releasejet.yml\n\n  notifications: expected an array of channel entries.',
      );
    }
    for (let i = 0; i < data.notifications.length; i++) {
      const n = data.notifications[i] as Record<string, unknown> | null;
      if (!n || typeof n !== 'object' || Array.isArray(n)) {
        throw new Error(
          `Invalid config in .releasejet.yml\n\n  notifications[${i}]: expected an object.`,
        );
      }
      if (n.type === undefined) {
        throw new Error(
          `Invalid config in .releasejet.yml\n\n  notifications[${i}].type: required. Valid: slack, discord, teams, webhook.`,
        );
      }
      if (n.type !== 'slack' && n.type !== 'discord' && n.type !== 'teams' && n.type !== 'webhook') {
        throw new Error(
          `Invalid config in .releasejet.yml\n\n  notifications[${i}].type: "${String(n.type)}" is not supported. Valid: slack, discord, teams, webhook.`,
        );
      }
      if (n.enabled === undefined) {
        throw new Error(
          `Invalid config in .releasejet.yml\n\n  notifications[${i}].enabled: required. Expected true or false.`,
        );
      }
      if (typeof n.enabled !== 'boolean') {
        throw new Error(
          `Invalid config in .releasejet.yml\n\n  notifications[${i}].enabled: expected a boolean (true or false).`,
        );
      }

      if (n.type === 'webhook') {
        // Webhook-specific pre-validation
        if (n.url === undefined) {
          throw new Error(
            `Invalid config in .releasejet.yml\n\n  notifications[${i}].url: required.`,
          );
        }
        if (typeof n.url !== 'string') {
          throw new Error(
            `Invalid config in .releasejet.yml\n\n  notifications[${i}].url: expected a string.`,
          );
        }
        if (!n.url.includes('${')) {
          if (!/^https?:\/\//i.test(n.url)) {
            throw new Error(
              `Invalid config in .releasejet.yml\n\n  notifications[${i}].url: "${n.url}" must be an http:// or https:// URL.`,
            );
          }
        }
        if (n.events === undefined) {
          throw new Error(
            `Invalid config in .releasejet.yml\n\n  notifications[${i}].events: required. Subscribe to at least one of: release.generated, release.published.`,
          );
        }
        if (!Array.isArray(n.events) || n.events.length === 0) {
          throw new Error(
            `Invalid config in .releasejet.yml\n\n  notifications[${i}].events: expected a non-empty array.`,
          );
        }
        for (let j = 0; j < n.events.length; j++) {
          const ev = n.events[j];
          if (ev !== 'release.generated' && ev !== 'release.published') {
            const closest = suggestClosest(String(ev), ['release.generated', 'release.published']);
            const hint = closest ? ` Did you mean "${closest}"?` : '';
            throw new Error(
              `Invalid config in .releasejet.yml\n\n  notifications[${i}].events[${j}]: "${String(ev)}" is not a valid event name. Valid: release.generated, release.published.${hint}`,
            );
          }
        }
        if ('template' in n) {
          throw new Error(
            `Invalid config in .releasejet.yml\n\n  notifications[${i}].template: not supported on type: webhook. ` +
              `Templates apply to human-readable messages (slack/discord/teams). Webhooks send the structured JSON envelope; receivers render their own output.`,
          );
        }
        if (n.headers !== undefined) {
          if (typeof n.headers !== 'object' || n.headers === null || Array.isArray(n.headers)) {
            throw new Error(
              `Invalid config in .releasejet.yml\n\n  notifications[${i}].headers: expected an object mapping header name to value.`,
            );
          }
          const headersRec = n.headers as Record<string, unknown>;
          const reserved = findReservedHeaderKeysImported(headersRec as Record<string, string>);
          if (reserved.length > 0) {
            throw new Error(
              `Invalid config in .releasejet.yml\n\n  notifications[${i}].headers: cannot set reserved header(s): ${reserved.join(', ')}. ` +
                `X-ReleaseJet-* and Content-Type are managed by ReleaseJet.`,
            );
          }
          for (const [hk, hv] of Object.entries(headersRec)) {
            if (typeof hv !== 'string') {
              throw new Error(
                `Invalid config in .releasejet.yml\n\n  notifications[${i}].headers["${hk}"]: expected a string.`,
              );
            }
            const tokenMatch = findLiteralTokenInHeaderValueImported(hv);
            if (tokenMatch.matched) {
              throw new Error(
                `Invalid config in .releasejet.yml\n\n  notifications[${i}].headers["${hk}"] contains a literal credential ` +
                  `(${tokenMatch.kind}). Move it to an environment variable and reference it as \${YOUR_VAR_NAME}.`,
              );
            }
          }
        }
        if (n.secret !== undefined && typeof n.secret !== 'string') {
          throw new Error(
            `Invalid config in .releasejet.yml\n\n  notifications[${i}].secret: expected a string.`,
          );
        }
      } else {
        // Existing M2 (slack/discord/teams) pre-validation
        if (n.webhookUrl === undefined) {
          throw new Error(
            `Invalid config in .releasejet.yml\n\n  notifications[${i}].webhookUrl: required.`,
          );
        }
        if (typeof n.webhookUrl !== 'string') {
          throw new Error(
            `Invalid config in .releasejet.yml\n\n  notifications[${i}].webhookUrl: expected a string.`,
          );
        }
        if (n.template !== undefined && typeof n.template !== 'string') {
          throw new Error(
            `Invalid config in .releasejet.yml\n\n  notifications[${i}].template: expected a string.`,
          );
        }
      }
    }
  }

  if (data.jira !== undefined) {
    if (typeof data.jira !== 'object' || data.jira === null || Array.isArray(data.jira)) {
      throw new Error(
        'Invalid config in .releasejet.yml\n\n  jira: expected an object with "baseUrl" and "projects" fields.',
      );
    }
    const jiraRec = data.jira as Record<string, unknown>;
    const baseUrl = jiraRec.baseUrl;
    if (baseUrl === undefined || typeof baseUrl !== 'string' || baseUrl.trim() === '') {
      throw new Error(
        'Invalid config in .releasejet.yml\n\n  jira.baseUrl is required when jira section is present (non-empty string).',
      );
    }
    const projects = jiraRec.projects;
    if (!Array.isArray(projects) || projects.length === 0) {
      throw new Error(
        'Invalid config in .releasejet.yml\n\n  jira.projects must be a non-empty array of project keys.',
      );
    }
    for (let i = 0; i < projects.length; i++) {
      const key = projects[i];
      if (typeof key !== 'string' || !/^[A-Z][A-Z0-9]+$/.test(key)) {
        throw new Error(
          `Invalid config in .releasejet.yml\n\n  jira.projects[${i}] '${String(key)}' is not a valid project key (expected uppercase letters and digits, e.g. PROJ).`,
        );
      }
    }
  }

  const parsed = ReleaseJetConfigSchema.parse(data);

  let jira: ReleaseJetConfig['jira'];
  if (parsed.jira) {
    const trimmed = parsed.jira.baseUrl.trim().replace(/\/+$/, '');
    jira = {
      baseUrl: trimmed,
      projects: parsed.jira.projects.map((p) => p.toUpperCase()),
    };
  }

  // Provider selection: explicit provider wins; fall back to legacy gitlab; else default.
  let provider: { type: 'gitlab' | 'github'; url: string };
  if (providerRaw) {
    provider = {
      type: (parsed.provider?.type ?? 'gitlab') as 'gitlab' | 'github',
      url: parsed.provider?.url ?? '',
    };
  } else if (gitlabRaw) {
    provider = {
      type: 'gitlab',
      url: (gitlabRaw.url as string | undefined) ?? '',
    };
  } else {
    provider = { type: 'gitlab', url: '' };
  }

  let contributors: ReleaseJetConfig['contributors'];
  if (parsed.contributors) {
    contributors = {
      enabled: parsed.contributors.enabled,
      exclude: parsed.contributors.exclude,
    };
  }

  return {
    provider,
    source: parsed.source,
    clients: parsed.clients,
    categories: parsed.categories,
    uncategorized: parsed.uncategorized,
    contributors,
    template: parsed.template,
    tagFormat: parsed.tagFormat,
    notifications: parsed.notifications,
    projectName: parsed.projectName,
    description: parsed.description,
    jira,
  };
}
