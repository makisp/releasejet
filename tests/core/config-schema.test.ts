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
