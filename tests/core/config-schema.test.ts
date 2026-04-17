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
});
