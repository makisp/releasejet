import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadConfig, DEFAULT_CONFIG } from '../../src/core/config.js';

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

import { readFile } from 'node:fs/promises';

describe('loadConfig', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns defaults when config file is missing', async () => {
    vi.mocked(readFile).mockRejectedValue(
      Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
    );
    const config = await loadConfig();
    expect(config.clients).toEqual([]);
    expect(config.uncategorized).toBe('lenient');
    expect(config.categories).toEqual(DEFAULT_CONFIG.categories);
    expect(config.source).toBe('issues');
  });

  it('parses a valid YAML config with new provider: format', async () => {
    vi.mocked(readFile).mockResolvedValue(`
provider:
  type: gitlab
  url: https://gitlab.example.com
clients:
  - prefix: mobile
    label: MOBILE
categories:
  feature: "New Features"
  bug: "Bug Fixes"
uncategorized: strict
source: issues
` as never);
    const config = await loadConfig();
    expect(config.provider).toEqual({ type: 'gitlab', url: 'https://gitlab.example.com' });
    expect(config.clients).toEqual([{ prefix: 'mobile', label: 'MOBILE' }]);
    expect(config.categories).toEqual({ feature: 'New Features', bug: 'Bug Fixes' });
    expect(config.uncategorized).toBe('strict');
    expect(config.source).toBe('issues');
  });

  it('migrates legacy gitlab: key to provider:', async () => {
    vi.mocked(readFile).mockResolvedValue(`
gitlab:
  url: https://gitlab.example.com
clients:
  - prefix: mobile
    label: MOBILE
categories:
  feature: "New Features"
  bug: "Bug Fixes"
uncategorized: strict
` as never);
    const config = await loadConfig();
    expect(config.provider).toEqual({ type: 'gitlab', url: 'https://gitlab.example.com' });
    expect(config.clients).toEqual([{ prefix: 'mobile', label: 'MOBILE' }]);
    expect(config.categories).toEqual({ feature: 'New Features', bug: 'Bug Fixes' });
    expect(config.uncategorized).toBe('strict');
  });

  it('source defaults to issues when not specified', async () => {
    vi.mocked(readFile).mockResolvedValue(`
provider:
  type: gitlab
  url: https://gitlab.example.com
` as never);
    const config = await loadConfig();
    expect(config.source).toBe('issues');
  });

  it('merges partial config with defaults', async () => {
    vi.mocked(readFile).mockResolvedValue(`
provider:
  type: gitlab
  url: https://gitlab.example.com
` as never);
    const config = await loadConfig();
    expect(config.provider).toEqual({ type: 'gitlab', url: 'https://gitlab.example.com' });
    expect(config.clients).toEqual([]);
    expect(config.categories).toEqual(DEFAULT_CONFIG.categories);
    expect(config.uncategorized).toBe('lenient');
  });

  it('uses custom config path when provided', async () => {
    vi.mocked(readFile).mockRejectedValue(
      Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
    );
    await loadConfig('custom/path.yml');
    expect(readFile).toHaveBeenCalledWith('custom/path.yml', 'utf-8');
  });

  it('rethrows non-ENOENT errors', async () => {
    vi.mocked(readFile).mockRejectedValue(new Error('Permission denied'));
    await expect(loadConfig()).rejects.toThrow('Permission denied');
  });

  it('throws on invalid provider.type', async () => {
    vi.mocked(readFile).mockResolvedValue(`
provider:
  type: githob
  url: https://github.com
` as never);
    await expect(loadConfig()).rejects.toThrow('provider.type');
    await expect(loadConfig()).rejects.toThrow('githob');
  });

  it('throws on invalid provider.url', async () => {
    vi.mocked(readFile).mockResolvedValue(`
provider:
  type: github
  url: ftp://github.com
` as never);
    await expect(loadConfig()).rejects.toThrow('provider.url');
  });

  it('allows empty provider.url', async () => {
    vi.mocked(readFile).mockResolvedValue(`
provider:
  type: github
` as never);
    const config = await loadConfig();
    expect(config.provider.url).toBe('');
  });

  it('throws on invalid source', async () => {
    vi.mocked(readFile).mockResolvedValue(`
provider:
  type: github
  url: https://github.com
source: merge_requests
` as never);
    await expect(loadConfig()).rejects.toThrow('source');
    await expect(loadConfig()).rejects.toThrow('merge_requests');
  });

  it('throws on invalid uncategorized', async () => {
    vi.mocked(readFile).mockResolvedValue(`
provider:
  type: gitlab
  url: https://gitlab.example.com
uncategorized: strictt
` as never);
    await expect(loadConfig()).rejects.toThrow('uncategorized');
    await expect(loadConfig()).rejects.toThrow('strictt');
  });

  it('throws on client entry missing prefix', async () => {
    vi.mocked(readFile).mockResolvedValue(`
provider:
  type: gitlab
  url: https://gitlab.example.com
clients:
  - label: MOBILE
` as never);
    await expect(loadConfig()).rejects.toThrow('clients[0]');
  });

  it('throws on client entry missing label', async () => {
    vi.mocked(readFile).mockResolvedValue(`
provider:
  type: gitlab
  url: https://gitlab.example.com
clients:
  - prefix: mobile
` as never);
    await expect(loadConfig()).rejects.toThrow('clients[0]');
  });

  it('throws on non-object categories', async () => {
    vi.mocked(readFile).mockResolvedValue(`
provider:
  type: gitlab
  url: https://gitlab.example.com
categories:
  - feature
  - bug
` as never);
    await expect(loadConfig()).rejects.toThrow('categories');
  });

  it('defaults missing fields without throwing', async () => {
    vi.mocked(readFile).mockResolvedValue(`
provider:
  type: github
  url: https://github.com
` as never);
    const config = await loadConfig();
    expect(config.source).toBe('issues');
    expect(config.uncategorized).toBe('lenient');
    expect(config.clients).toEqual([]);
    expect(config.categories).toEqual(DEFAULT_CONFIG.categories);
  });

  it('parses contributors config with enabled and exclude', async () => {
    vi.mocked(readFile).mockResolvedValue(`
provider:
  type: github
  url: https://github.com
contributors:
  enabled: true
  exclude:
    - my-ci-bot
    - deploy-bot
` as never);
    const config = await loadConfig();
    expect(config.contributors).toEqual({
      enabled: true,
      exclude: ['my-ci-bot', 'deploy-bot'],
    });
  });

  it('applies default bot exclude list when exclude is not specified', async () => {
    vi.mocked(readFile).mockResolvedValue(`
provider:
  type: github
  url: https://github.com
contributors:
  enabled: true
` as never);
    const config = await loadConfig();
    expect(config.contributors).toBeDefined();
    expect(config.contributors!.enabled).toBe(true);
    expect(config.contributors!.exclude).toEqual(['dependabot', 'renovate', 'gitlab-bot', 'github-actions']);
  });

  it('defaults enabled to true when contributors object is present', async () => {
    vi.mocked(readFile).mockResolvedValue(`
provider:
  type: github
  url: https://github.com
contributors:
  exclude:
    - my-bot
` as never);
    const config = await loadConfig();
    expect(config.contributors!.enabled).toBe(true);
  });

  it('returns no contributors config when field is omitted', async () => {
    vi.mocked(readFile).mockResolvedValue(`
provider:
  type: github
  url: https://github.com
` as never);
    const config = await loadConfig();
    expect(config.contributors).toBeUndefined();
  });

  it('handles contributors enabled: false', async () => {
    vi.mocked(readFile).mockResolvedValue(`
provider:
  type: github
  url: https://github.com
contributors:
  enabled: false
` as never);
    const config = await loadConfig();
    expect(config.contributors).toEqual({
      enabled: false,
      exclude: ['dependabot', 'renovate', 'gitlab-bot', 'github-actions'],
    });
  });

  it('throws on non-object contributors value', async () => {
    vi.mocked(readFile).mockResolvedValue(`
provider:
  type: github
  url: https://github.com
contributors: yes
` as never);
    await expect(loadConfig()).rejects.toThrow('contributors');
  });

  it('throws on non-boolean contributors.enabled', async () => {
    vi.mocked(readFile).mockResolvedValue(`
provider:
  type: github
  url: https://github.com
contributors:
  enabled: "yes"
` as never);
    await expect(loadConfig()).rejects.toThrow('contributors.enabled');
  });

  it('throws on non-array contributors.exclude', async () => {
    vi.mocked(readFile).mockResolvedValue(`
provider:
  type: github
  url: https://github.com
contributors:
  enabled: true
  exclude: my-bot
` as never);
    await expect(loadConfig()).rejects.toThrow('contributors.exclude');
  });

  it('parses template field from config', async () => {
    vi.mocked(readFile).mockResolvedValue(`
provider:
  type: github
template: compact
categories:
  bug: Bug Fixes
` as never);

    const config = await loadConfig();
    expect(config.template).toBe('compact');
  });

  it('parses template: default from config', async () => {
    vi.mocked(readFile).mockResolvedValue(`
provider:
  type: github
template: default
categories:
  bug: Bug Fixes
` as never);

    const config = await loadConfig();
    expect(config.template).toBe('default');
  });

  it('defaults template to undefined when not specified', async () => {
    vi.mocked(readFile).mockResolvedValue(`
provider:
  type: github
categories:
  bug: Bug Fixes
` as never);

    const config = await loadConfig();
    expect(config.template).toBeUndefined();
  });
});
