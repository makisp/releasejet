import { describe, it, expect } from 'vitest';
import { parseConfig } from '../../src/core/config.schema.js';

describe('parseConfig', () => {
  it('accepts an empty object and applies defaults', () => {
    const result = parseConfig({});
    expect(result.provider.type).toBe('gitlab');
    expect(result.provider.url).toBe('');
    expect(result.source).toBe('issues');
    expect(result.clients).toEqual([]);
    expect(result.uncategorized).toBe('lenient');
    expect(result.categories).toEqual({
      feature: 'New Features',
      bug: 'Bug Fixes',
      improvement: 'Improvements',
      'breaking-change': 'Breaking Changes',
    });
  });

  it('parses a full provider config', () => {
    const result = parseConfig({
      provider: { type: 'github', url: 'https://github.com' },
      source: 'pull_requests',
      clients: [{ prefix: 'mobile', label: 'MOBILE' }],
      categories: { feature: 'Features' },
      uncategorized: 'strict',
      tagFormat: 'v{version}',
    });
    expect(result.provider).toEqual({ type: 'github', url: 'https://github.com' });
    expect(result.source).toBe('pull_requests');
    expect(result.clients).toEqual([{ prefix: 'mobile', label: 'MOBILE' }]);
    expect(result.uncategorized).toBe('strict');
    expect(result.tagFormat).toBe('v{version}');
  });

  it('migrates legacy gitlab: key into provider', () => {
    const result = parseConfig({
      gitlab: { url: 'https://gitlab.example.com' },
    });
    expect(result.provider).toEqual({ type: 'gitlab', url: 'https://gitlab.example.com' });
  });

  it('rejects invalid provider.type with the legacy error message', () => {
    expect(() => parseConfig({ provider: { type: 'bitbucket' } })).toThrow(
      /provider\.type: "bitbucket" is not valid\. Expected "gitlab" or "github"\./,
    );
  });

  it('rejects provider.url without scheme', () => {
    expect(() => parseConfig({ provider: { type: 'github', url: 'github.com' } })).toThrow(
      /provider\.url:.*Must start with http:\/\/ or https:\/\//,
    );
  });

  it('rejects invalid source', () => {
    expect(() => parseConfig({ source: 'commits' })).toThrow(
      /source: "commits" is not valid\. Expected "issues" or "pull_requests"\./,
    );
  });

  it('rejects invalid uncategorized', () => {
    expect(() => parseConfig({ uncategorized: 'loose' })).toThrow(
      /uncategorized: "loose" is not valid\. Expected "lenient" or "strict"\./,
    );
  });

  it('rejects tagFormat without {version} placeholder', () => {
    expect(() => parseConfig({ tagFormat: 'vX' })).toThrow(
      /tagFormat: must contain the \{version\} placeholder/,
    );
  });

  it('rejects client missing prefix or label', () => {
    expect(() => parseConfig({ clients: [{ prefix: 'mobile' }] })).toThrow(
      /clients\[0\]: "prefix" and "label" are required/,
    );
  });

  it('contributors defaults exclude to the bot list when enabled without explicit exclude', () => {
    const result = parseConfig({ contributors: { enabled: true } });
    expect(result.contributors?.enabled).toBe(true);
    expect(result.contributors?.exclude).toEqual([
      'dependabot',
      'renovate',
      'gitlab-bot',
      'github-actions',
    ]);
  });

  it('preserves an explicit empty categories object (legacy pass-through)', () => {
    const result = parseConfig({ categories: {} });
    expect(result.categories).toEqual({});
  });

  it('preserves an explicit empty contributors.exclude array', () => {
    const result = parseConfig({ contributors: { enabled: true, exclude: [] } });
    expect(result.contributors?.exclude).toEqual([]);
  });

  it('tolerates clients: null (YAML empty value) and defaults to []', () => {
    const result = parseConfig({ clients: null });
    expect(result.clients).toEqual([]);
  });

  it('defaults excludeLabels to an empty array when omitted', () => {
    const result = parseConfig({});
    expect(result.excludeLabels).toEqual([]);
  });

  it('parses excludeLabels from config', () => {
    const result = parseConfig({ excludeLabels: ['internal', 'chore'] });
    expect(result.excludeLabels).toEqual(['internal', 'chore']);
  });

  it('rejects excludeLabels when it is not an array', () => {
    expect(() => parseConfig({ excludeLabels: 'internal' })).toThrow(
      /excludeLabels: expected an array of label names/,
    );
  });

  it('rejects excludeLabels when entries are not strings', () => {
    expect(() => parseConfig({ excludeLabels: ['ok', 5] })).toThrow();
  });

  describe('notifications schema', () => {
    it('parses a valid notifications list', () => {
      const parsed = parseConfig({
        provider: { type: 'gitlab', url: 'https://gitlab.example.com' },
        notifications: [
          { type: 'slack', enabled: true, webhookUrl: '' },
          { type: 'discord', enabled: false, webhookUrl: 'https://hooks.slack.com/x' },
          // ^ the literal-URL check runs BEFORE parseConfig in loadConfig, so at this
          //   layer it just shapes through; schema only validates shape/types.
        ],
      });
      expect(parsed.notifications).toEqual([
        { type: 'slack', enabled: true, webhookUrl: '' },
        { type: 'discord', enabled: false, webhookUrl: 'https://hooks.slack.com/x' },
      ]);
    });

    it('defaults notifications to undefined when absent', () => {
      const parsed = parseConfig({ provider: { type: 'gitlab', url: '' } });
      expect(parsed.notifications).toBeUndefined();
    });

    it('rejects an unknown notification type', () => {
      expect(() =>
        parseConfig({
          provider: { type: 'gitlab', url: '' },
          notifications: [{ type: 'mattermost', enabled: true, webhookUrl: '' }],
        }),
      ).toThrowError(/notifications\[0\]\.type: "mattermost" is not supported/);
    });

    it('rejects a missing webhookUrl', () => {
      expect(() =>
        parseConfig({
          provider: { type: 'gitlab', url: '' },
          notifications: [{ type: 'slack', enabled: true }],
        }),
      ).toThrowError(/notifications\[0\]\.webhookUrl/);
    });

    it('rejects a missing type', () => {
      expect(() =>
        parseConfig({
          provider: { type: 'gitlab', url: '' },
          notifications: [{ enabled: true, webhookUrl: '' }],
        }),
      ).toThrowError(/notifications\[0\]\.type/);
    });

    it('rejects a non-boolean enabled', () => {
      expect(() =>
        parseConfig({
          provider: { type: 'gitlab', url: '' },
          notifications: [{ type: 'slack', enabled: 'yes', webhookUrl: '' }],
        }),
      ).toThrowError(/notifications\[0\]\.enabled/);
    });

    it('rejects notifications as a non-array', () => {
      expect(() =>
        parseConfig({
          provider: { type: 'gitlab', url: '' },
          notifications: { type: 'slack' },
        }),
      ).toThrowError(/notifications: expected an array/);
    });

    it('allows multiple entries of the same type', () => {
      const parsed = parseConfig({
        provider: { type: 'gitlab', url: '' },
        notifications: [
          { type: 'slack', enabled: true, webhookUrl: 'a' },
          { type: 'slack', enabled: false, webhookUrl: 'b' },
        ],
      });
      expect(parsed.notifications).toHaveLength(2);
    });
  });

  describe('projectName schema', () => {
    it('parses when projectName is a non-empty string', () => {
      const parsed = parseConfig({
        provider: { type: 'github', url: 'https://github.com' },
        projectName: 'Test Project',
      });
      expect(parsed.projectName).toBe('Test Project');
    });

    it('leaves projectName undefined when absent', () => {
      const parsed = parseConfig({ provider: { type: 'github', url: 'https://github.com' } });
      expect(parsed.projectName).toBeUndefined();
    });

    it('rejects a non-string projectName', () => {
      expect(() =>
        parseConfig({
          provider: { type: 'github', url: 'https://github.com' },
          projectName: 42,
        }),
      ).toThrowError(/projectName/);
    });

    it('rejects an empty-string projectName (ambiguous with unset)', () => {
      expect(() =>
        parseConfig({
          provider: { type: 'github', url: 'https://github.com' },
          projectName: '',
        }),
      ).toThrowError(/projectName.*non-empty/i);
    });
  });
});

describe('description config field', () => {
  it('defaults to "none" when omitted', () => {
    const config = parseConfig({});
    expect(config.description).toBe('none');
  });

  it('accepts "extract"', () => {
    const config = parseConfig({ description: 'extract' });
    expect(config.description).toBe('extract');
  });

  it('accepts "ai"', () => {
    const config = parseConfig({ description: 'ai' });
    expect(config.description).toBe('ai');
  });

  it('rejects unknown values', () => {
    expect(() => parseConfig({ description: 'summary' })).toThrow();
  });
});

describe('notifications.template field', () => {
  it('accepts an optional template string on a channel entry', () => {
    const cfg = parseConfig({
      provider: { type: 'github', url: 'https://github.com' },
      notifications: [
        { type: 'slack', enabled: true, webhookUrl: '${SLACK}', template: 'Hello {{tagName}}' },
      ],
    });
    expect(cfg.notifications?.[0]?.template).toBe('Hello {{tagName}}');
  });

  it('treats omitted template as undefined', () => {
    const cfg = parseConfig({
      provider: { type: 'github', url: 'https://github.com' },
      notifications: [
        { type: 'slack', enabled: true, webhookUrl: '${SLACK}' },
      ],
    });
    expect(cfg.notifications?.[0]?.template).toBeUndefined();
  });

  it('accepts an empty-string template (treated as absent at render time)', () => {
    const cfg = parseConfig({
      provider: { type: 'github', url: 'https://github.com' },
      notifications: [
        { type: 'slack', enabled: true, webhookUrl: '${SLACK}', template: '' },
      ],
    });
    expect(cfg.notifications?.[0]?.template).toBe('');
  });

  it('rejects a non-string template (number)', () => {
    expect(() =>
      parseConfig({
        provider: { type: 'github', url: 'https://github.com' },
        notifications: [
          { type: 'slack', enabled: true, webhookUrl: '${SLACK}', template: 123 },
        ],
      }),
    ).toThrowError(/notifications\[0\]\.template/);
  });

  it('parses aiSummary.enabled: true', () => {
    const cfg = parseConfig({
      provider: { type: 'github', url: 'https://github.com/o/r' },
      aiSummary: { enabled: true },
    });
    expect(cfg.aiSummary).toEqual({ enabled: true });
  });

  it('parses aiSummary.enabled: false (default)', () => {
    const cfg = parseConfig({
      provider: { type: 'github', url: 'https://github.com/o/r' },
      aiSummary: {},
    });
    expect(cfg.aiSummary).toEqual({ enabled: false });
  });

  it('aiSummary defaults to undefined when omitted', () => {
    const cfg = parseConfig({
      provider: { type: 'github', url: 'https://github.com/o/r' },
    });
    expect(cfg.aiSummary).toBeUndefined();
  });

  it('parses ai.allowDataEgress: true', () => {
    const cfg = parseConfig({
      provider: { type: 'github', url: 'https://github.com/o/r' },
      ai: { allowDataEgress: true },
    });
    expect(cfg.ai).toEqual({ allowDataEgress: true });
  });

  it('ai defaults to undefined when omitted', () => {
    const cfg = parseConfig({
      provider: { type: 'github', url: 'https://github.com/o/r' },
    });
    expect(cfg.ai).toBeUndefined();
  });
});

describe('notifications.includeAiSummary field', () => {
  function baseNotif(extra: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      provider: { type: 'github', url: 'https://github.com' },
      ...extra,
    };
  }

  it('parses a slack channel with includeAiSummary: true and preserves the field', () => {
    const cfg = parseConfig(
      baseNotif({
        notifications: [
          { type: 'slack', enabled: true, webhookUrl: '${SLACK_URL}', includeAiSummary: true },
        ],
      }),
    );
    const n = cfg.notifications?.[0];
    expect(n?.type).toBe('slack');
    if (n?.type === 'slack' || n?.type === 'discord' || n?.type === 'teams') {
      expect(n.includeAiSummary).toBe(true);
    }
  });

  it('parses a slack channel with includeAiSummary: false and preserves the field', () => {
    const cfg = parseConfig(
      baseNotif({
        notifications: [
          { type: 'slack', enabled: true, webhookUrl: '${SLACK_URL}', includeAiSummary: false },
        ],
      }),
    );
    const n = cfg.notifications?.[0];
    if (n?.type === 'slack' || n?.type === 'discord' || n?.type === 'teams') {
      expect(n.includeAiSummary).toBe(false);
    }
  });

  it('rejects a slack channel with includeAiSummary as a string', () => {
    expect(() =>
      parseConfig(
        baseNotif({
          notifications: [
            { type: 'slack', enabled: true, webhookUrl: '${SLACK_URL}', includeAiSummary: 'false' },
          ],
        }),
      ),
    ).toThrowError(/expected a boolean \(true or false\).*use includeAiSummary: false, not includeAiSummary: "false"/s);
  });

  it('rejects a slack channel with includeAiSummary as a number', () => {
    expect(() =>
      parseConfig(
        baseNotif({
          notifications: [
            { type: 'slack', enabled: true, webhookUrl: '${SLACK_URL}', includeAiSummary: 0 },
          ],
        }),
      ),
    ).toThrowError(/expected a boolean/);
  });

  it('parses a discord channel with includeAiSummary: true', () => {
    const cfg = parseConfig(
      baseNotif({
        notifications: [
          { type: 'discord', enabled: true, webhookUrl: '${DISCORD_URL}', includeAiSummary: true },
        ],
      }),
    );
    const n = cfg.notifications?.[0];
    if (n?.type === 'slack' || n?.type === 'discord' || n?.type === 'teams') {
      expect(n.includeAiSummary).toBe(true);
    }
  });

  it('parses a teams channel with includeAiSummary: true', () => {
    const cfg = parseConfig(
      baseNotif({
        notifications: [
          { type: 'teams', enabled: true, webhookUrl: '${TEAMS_URL}', includeAiSummary: true },
        ],
      }),
    );
    const n = cfg.notifications?.[0];
    if (n?.type === 'slack' || n?.type === 'discord' || n?.type === 'teams') {
      expect(n.includeAiSummary).toBe(true);
    }
  });

  it('rejects a webhook channel with includeAiSummary: true', () => {
    expect(() =>
      parseConfig(
        baseNotif({
          notifications: [
            {
              type: 'webhook',
              enabled: true,
              url: 'https://example.com/hook',
              events: ['release.published'],
              includeAiSummary: true,
            },
          ],
        }),
      ),
    ).toThrowError(/includeAiSummary.*not supported on type: webhook/);
  });

  it('leaves includeAiSummary undefined when omitted from a slack channel', () => {
    const cfg = parseConfig(
      baseNotif({
        notifications: [
          { type: 'slack', enabled: true, webhookUrl: '${SLACK_URL}' },
        ],
      }),
    );
    const n = cfg.notifications?.[0];
    if (n?.type === 'slack' || n?.type === 'discord' || n?.type === 'teams') {
      expect(n.includeAiSummary).toBeUndefined();
    }
  });
});
