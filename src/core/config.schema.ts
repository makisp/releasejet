import { z } from 'zod';
import type { ReleaseJetConfig } from '../types.js';

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

const NotificationChannelSchema = z
  .object({
    type: z.enum(['slack', 'discord', 'teams']).describe('Channel type.'),
    enabled: z.boolean().describe('Whether this channel should fire.'),
    webhookUrl: z
      .string()
      .describe('Webhook URL. Must be an ${ENV_VAR} reference; literal URLs are rejected before this layer.'),
  })
  .describe('One notification channel entry.');

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
    projectName: z
      .string()
      .min(1, { message: 'projectName must be a non-empty string' })
      .optional()
      .describe('Human-readable project name shown in notification cards.'),
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
          `Invalid config in .releasejet.yml\n\n  notifications[${i}].type: required. Valid: slack, discord, teams.`,
        );
      }
      if (n.type !== 'slack' && n.type !== 'discord' && n.type !== 'teams') {
        throw new Error(
          `Invalid config in .releasejet.yml\n\n  notifications[${i}].type: "${String(n.type)}" is not supported. Valid: slack, discord, teams.`,
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
    }
  }

  const parsed = ReleaseJetConfigSchema.parse(data);

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
  };
}
