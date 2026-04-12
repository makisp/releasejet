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
    process.exitCode = undefined;
    mockClient = createMockClient();
    vi.mocked(loadConfig).mockResolvedValue(mockConfig);
    vi.mocked(createClient).mockReturnValue(mockClient);
  });

  it('reports properly labeled issues as OK', async () => {
    vi.mocked(mockClient.listIssues).mockResolvedValue([
      { number: 1, title: 'Good issue', labels: ['feature', 'MOBILE'], closedAt: '', webUrl: '', milestone: null },
    ]);
    vi.mocked(mockClient.listTags).mockResolvedValue([]);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runValidate({ config: '.releasejet.yml', debug: false });

    const allOutput = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allOutput).toContain('1 issue properly labeled');
    expect(allOutput).toContain('0 label problems');
    expect(process.exitCode).not.toBe(1);
    consoleSpy.mockRestore();
  });

  it('reports issues missing client label', async () => {
    vi.mocked(mockClient.listIssues).mockResolvedValue([
      { number: 1, title: 'No client', labels: ['feature'], closedAt: '', webUrl: '', milestone: null },
    ]);
    vi.mocked(mockClient.listTags).mockResolvedValue([]);
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
    vi.mocked(mockClient.listTags).mockResolvedValue([]);
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
    vi.mocked(mockClient.listTags).mockResolvedValue([]);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runValidate({ config: '.releasejet.yml', debug: false });

    const allOutput = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allOutput).toContain('1 issue properly labeled');
    expect(allOutput).toContain('0 label problems');
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

  it('passes state to provider when --state is closed', async () => {
    vi.mocked(mockClient.listIssues).mockResolvedValue([]);
    vi.mocked(mockClient.listTags).mockResolvedValue([]);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runValidate({ config: '.releasejet.yml', state: 'closed', recent: 30 });

    expect(mockClient.listIssues).toHaveBeenCalledWith('mobile/app', expect.objectContaining({ state: 'closed' }));
    consoleSpy.mockRestore();
  });

  it('fetches both opened and closed when --state is all', async () => {
    vi.mocked(mockClient.listIssues).mockResolvedValue([]);
    vi.mocked(mockClient.listTags).mockResolvedValue([]);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runValidate({ config: '.releasejet.yml', state: 'all', recent: 30 });

    expect(mockClient.listIssues).toHaveBeenCalledWith('mobile/app', expect.objectContaining({ state: 'opened' }));
    expect(mockClient.listIssues).toHaveBeenCalledWith('mobile/app', expect.objectContaining({ state: 'closed' }));
    consoleSpy.mockRestore();
  });

  it('filters issues by milestone when --milestone is provided', async () => {
    vi.mocked(mockClient.listIssues).mockResolvedValue([
      { number: 1, title: 'In milestone', labels: ['feature', 'MOBILE'], closedAt: '', webUrl: '', milestone: { title: 'v1.2.0', url: '' } },
      { number: 2, title: 'Wrong milestone', labels: ['feature', 'MOBILE'], closedAt: '', webUrl: '', milestone: { title: 'v2.0.0', url: '' } },
      { number: 3, title: 'No milestone', labels: ['bug'], closedAt: '', webUrl: '', milestone: null },
    ]);
    vi.mocked(mockClient.listTags).mockResolvedValue([]);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runValidate({ config: '.releasejet.yml', milestone: 'v1.2.0' });

    const allOutput = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allOutput).not.toContain('#2');
    expect(allOutput).not.toContain('#3');
    consoleSpy.mockRestore();
  });

  it('filters issues by recency when --recent is provided', async () => {
    const now = new Date();
    const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    vi.mocked(mockClient.listIssues).mockResolvedValue([
      { number: 1, title: 'Recent', labels: ['bug'], closedAt: fiveDaysAgo, webUrl: '', milestone: null },
      { number: 2, title: 'Old', labels: ['bug'], closedAt: thirtyDaysAgo, webUrl: '', milestone: null },
    ]);
    vi.mocked(mockClient.listTags).mockResolvedValue([]);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runValidate({ config: '.releasejet.yml', state: 'closed', recent: 10 });

    const allOutput = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allOutput).toContain('#1');
    expect(allOutput).not.toContain('#2');
    consoleSpy.mockRestore();
  });

  it('reports tag format warnings in output', async () => {
    vi.mocked(mockClient.listIssues).mockResolvedValue([]);
    vi.mocked(mockClient.listTags).mockResolvedValue([
      { name: 'mobile-v1.0.0', createdAt: '2026-01-01T00:00:00Z' },
      { name: 'release-2024', createdAt: '2026-01-01T00:00:00Z' },
      { name: 'mobile-vbad', createdAt: '2026-01-01T00:00:00Z' },
    ]);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runValidate({ config: '.releasejet.yml' });

    const allOutput = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allOutput).toContain('Tag Format');
    expect(allOutput).toContain('1 tag OK');
    expect(allOutput).toContain('2 tags with issues');
    expect(allOutput).toContain('release-2024');
    expect(allOutput).toContain('mobile-vbad');
    consoleSpy.mockRestore();
  });

  it('shows all tags OK when all tags are valid', async () => {
    vi.mocked(mockClient.listIssues).mockResolvedValue([]);
    vi.mocked(mockClient.listTags).mockResolvedValue([
      { name: 'mobile-v1.0.0', createdAt: '2026-01-01T00:00:00Z' },
      { name: 'mobile-v1.1.0', createdAt: '2026-02-01T00:00:00Z' },
    ]);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runValidate({ config: '.releasejet.yml' });

    const allOutput = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allOutput).toContain('2 tags OK');
    expect(allOutput).not.toContain('tags with issues');
    consoleSpy.mockRestore();
  });

  it('tag warnings do not cause exit code 1', async () => {
    vi.mocked(mockClient.listIssues).mockResolvedValue([]);
    vi.mocked(mockClient.listTags).mockResolvedValue([
      { name: 'release-2024', createdAt: '2026-01-01T00:00:00Z' },
    ]);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runValidate({ config: '.releasejet.yml' });

    expect(process.exitCode).not.toBe(1);
    consoleSpy.mockRestore();
  });

  it('shows structured output with both sections and summary', async () => {
    vi.mocked(mockClient.listIssues).mockResolvedValue([
      { number: 42, title: 'Add dark mode', labels: ['MOBILE'], closedAt: '', webUrl: '', milestone: null },
    ]);
    vi.mocked(mockClient.listTags).mockResolvedValue([
      { name: 'mobile-v1.0.0', createdAt: '2026-01-01T00:00:00Z' },
      { name: 'release-2024', createdAt: '2026-01-01T00:00:00Z' },
    ]);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runValidate({ config: '.releasejet.yml' });

    const allOutput = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allOutput).toContain('Tag Format');
    expect(allOutput).toContain('1 tag OK');
    expect(allOutput).toContain('Issue Labels');
    expect(allOutput).toContain('#42');
    expect(allOutput).toContain('category label');
    expect(allOutput).toContain('Summary:');
    expect(allOutput).toContain('1 tag warning');
    expect(allOutput).toContain('1 label problem');
    consoleSpy.mockRestore();
  });

  it('includes milestone in issue section header when --milestone is used', async () => {
    vi.mocked(mockClient.listIssues).mockResolvedValue([
      { number: 1, title: 'Good', labels: ['feature', 'MOBILE'], closedAt: '', webUrl: '', milestone: { title: 'v1.2.0', url: '' } },
    ]);
    vi.mocked(mockClient.listTags).mockResolvedValue([]);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runValidate({ config: '.releasejet.yml', milestone: 'v1.2.0' });

    const allOutput = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allOutput).toContain('Issue Labels (opened, milestone: v1.2.0)');
    consoleSpy.mockRestore();
  });

  it('exits with code 1 when label problems exist', async () => {
    vi.mocked(mockClient.listIssues).mockResolvedValue([
      { number: 1, title: 'Missing labels', labels: [], closedAt: '', webUrl: '', milestone: null },
    ]);
    vi.mocked(mockClient.listTags).mockResolvedValue([]);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runValidate({ config: '.releasejet.yml' });

    expect(process.exitCode).toBe(1);
    consoleSpy.mockRestore();
  });

  it('shows zero-problem summary when everything is clean', async () => {
    vi.mocked(mockClient.listIssues).mockResolvedValue([
      { number: 1, title: 'Good', labels: ['feature', 'MOBILE'], closedAt: '', webUrl: '', milestone: null },
    ]);
    vi.mocked(mockClient.listTags).mockResolvedValue([
      { name: 'mobile-v1.0.0', createdAt: '2026-01-01T00:00:00Z' },
    ]);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runValidate({ config: '.releasejet.yml' });

    const allOutput = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allOutput).toContain('0 tag warnings');
    expect(allOutput).toContain('0 label problems');
    expect(process.exitCode).not.toBe(1);
    consoleSpy.mockRestore();
  });
});
