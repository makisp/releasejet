import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ProviderClient } from '../../src/providers/types.js';
import type { ReleaseJetConfig } from '../../src/types.js';

vi.mock('../../src/core/config.js', () => ({
  loadConfig: vi.fn(),
}));
vi.mock('../../src/core/git.js', () => ({
  getRemoteUrl: vi.fn().mockReturnValue('git@gitlab.example.com:mobile/app.git'),
  resolveHostUrl: vi.fn().mockReturnValue('https://gitlab.example.com'),
  resolveProjectPath: vi.fn().mockReturnValue('mobile/app'),
}));
vi.mock('../../src/providers/factory.js', () => ({
  createClient: vi.fn(),
}));
vi.mock('../../src/cli/auth.js', () => ({
  resolveToken: vi.fn().mockResolvedValue('test-token'),
}));

import { loadConfig } from '../../src/core/config.js';
import { createClient } from '../../src/providers/factory.js';
import { runValidate } from '../../src/cli/commands/validate.js';

const mockConfig: ReleaseJetConfig = {
  provider: { type: 'gitlab', url: 'https://gitlab.example.com' },
  source: 'issues',
  clients: [{ prefix: 'mobile', label: 'MOBILE' }],
  categories: {
    feature: 'New Features',
    bug: 'Bug Fixes',
  },
  uncategorized: 'lenient',
};

function createMockClient(): ProviderClient {
  return {
    listTags: vi.fn(),
    listIssues: vi.fn().mockResolvedValue([]),
    listPullRequests: vi.fn().mockResolvedValue([]),
    createRelease: vi.fn(),
    listMilestones: vi.fn(),
  };
}

describe('runValidate', () => {
  let mockClient: ProviderClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    vi.mocked(loadConfig).mockResolvedValue(mockConfig);
    vi.mocked(createClient).mockReturnValue(mockClient);
  });

  it('reports properly labeled issues as OK', async () => {
    vi.mocked(mockClient.listIssues).mockResolvedValue([
      { number: 1, title: 'Good issue', labels: ['feature', 'MOBILE'], closedAt: '', webUrl: '', milestone: null },
    ]);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runValidate({ config: '.releasejet.yml', debug: false });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('All open issues are properly labeled'),
    );
    expect(process.exitCode).not.toBe(1);
    consoleSpy.mockRestore();
  });

  it('reports issues missing client label', async () => {
    vi.mocked(mockClient.listIssues).mockResolvedValue([
      { number: 1, title: 'No client', labels: ['feature'], closedAt: '', webUrl: '', milestone: null },
    ]);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runValidate({ config: '.releasejet.yml', debug: false });

    const allOutput = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allOutput).toContain('#1');
    expect(allOutput).toContain('client label');
    consoleSpy.mockRestore();
  });

  it('reports issues missing category label', async () => {
    vi.mocked(mockClient.listIssues).mockResolvedValue([
      { number: 2, title: 'No category', labels: ['MOBILE'], closedAt: '', webUrl: '', milestone: null },
    ]);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runValidate({ config: '.releasejet.yml', debug: false });

    const allOutput = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allOutput).toContain('#2');
    expect(allOutput).toContain('category label');
    consoleSpy.mockRestore();
  });

  it('skips client label check for single-client repos', async () => {
    const singleConfig: ReleaseJetConfig = { ...mockConfig, clients: [] };
    vi.mocked(loadConfig).mockResolvedValue(singleConfig);
    vi.mocked(mockClient.listIssues).mockResolvedValue([
      { number: 1, title: 'Has category', labels: ['feature'], closedAt: '', webUrl: '', milestone: null },
    ]);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runValidate({ config: '.releasejet.yml', debug: false });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('All open issues are properly labeled'),
    );
    consoleSpy.mockRestore();
  });

  it('errors when --state closed is used without --recent', async () => {
    await expect(
      runValidate({ config: '.releasejet.yml', state: 'closed' }),
    ).rejects.toThrow('--recent is required when --state is "closed" or "all"');
  });

  it('errors when --state all is used without --recent', async () => {
    await expect(
      runValidate({ config: '.releasejet.yml', state: 'all' }),
    ).rejects.toThrow('--recent is required when --state is "closed" or "all"');
  });

  it('accepts --state closed with --recent', async () => {
    vi.mocked(mockClient.listIssues).mockResolvedValue([]);
    vi.mocked(mockClient.listTags).mockResolvedValue([]);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runValidate({ config: '.releasejet.yml', state: 'closed', recent: 30 });

    expect(mockClient.listIssues).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('accepts --state opened without --recent', async () => {
    vi.mocked(mockClient.listIssues).mockResolvedValue([]);
    vi.mocked(mockClient.listTags).mockResolvedValue([]);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runValidate({ config: '.releasejet.yml', state: 'opened' });

    expect(mockClient.listIssues).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
