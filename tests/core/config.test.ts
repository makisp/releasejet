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
});
