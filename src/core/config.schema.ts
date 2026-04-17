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
  })
  .describe('ReleaseJet configuration (.releasejet.yml).');

export type ReleaseJetConfigInput = z.input<typeof ReleaseJetConfigSchema>;

export function parseConfig(raw: unknown): ReleaseJetConfig {
  // Pre-validation checks that match the legacy error format exactly.
  const data = (raw ?? {}) as Record<string, unknown>;

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
  };
}
