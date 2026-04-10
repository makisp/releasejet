import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ProviderClient } from '../../src/providers/types.js';
import type { ReleaseJetConfig } from '../../src/types.js';

vi.mock('../../src/core/config.js', () => ({
  loadConfig: vi.fn(),
}));
vi.mock('../../src/core/git.js', () => ({
  getRemoteUrl: vi.fn().mockReturnValue('git@gitlab.example.com:mobile/app.git'),
  resolveProjectInfo: vi.fn().mockReturnValue({ hostUrl: 'https://gitlab.example.com', projectPath: 'mobile/app' }),
}));
vi.mock('../../src/providers/factory.js', () => ({
  createClient: vi.fn(),
}));
vi.mock('../../src/cli/auth.js', () => ({
  resolveToken: vi.fn().mockResolvedValue('test-token'),
}));
vi.mock('../../src/cli/prompts.js', () => ({
  promptForUncategorized: vi.fn(),
}));

import { loadConfig } from '../../src/core/config.js';
import { createClient } from '../../src/providers/factory.js';
import { resolveProjectInfo } from '../../src/core/git.js';
import { runGenerate } from '../../src/cli/commands/generate.js';

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
    listTags: vi.fn().mockResolvedValue([
      { name: 'mobile-v0.1.16', createdAt: '2026-03-01T10:00:00Z' },
      { name: 'mobile-v0.1.17', createdAt: '2026-04-08T10:00:00Z' },
    ]),
    listIssues: vi.fn().mockResolvedValue([
      { number: 1, title: 'New feature', labels: ['feature', 'MOBILE'], closedAt: '2026-04-07', webUrl: '', milestone: null },
    ]),
    listPullRequests: vi.fn().mockResolvedValue([]),
    createRelease: vi.fn().mockResolvedValue(undefined),
    listMilestones: vi.fn().mockResolvedValue([]),
  };
}

describe('runGenerate', () => {
  let mockClient: ProviderClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    vi.mocked(loadConfig).mockResolvedValue(mockConfig);
    vi.mocked(createClient).mockReturnValue(mockClient);
    vi.mocked(resolveProjectInfo).mockReturnValue({ hostUrl: 'https://gitlab.example.com', projectPath: 'mobile/app' });
  });

  it('generates markdown output to stdout', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runGenerate({
      tag: 'mobile-v0.1.17',
      publish: false,
      dryRun: false,
      format: 'markdown',
      config: '.releasejet.yml',
    });

    expect(consoleSpy).toHaveBeenCalled();
    const output = consoleSpy.mock.calls[0][0] as string;
    expect(output).toContain('# MOBILE v0.1.17');
    expect(output).toContain('New feature');
    consoleSpy.mockRestore();
  });

  it('publishes release when --publish is set', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await runGenerate({
      tag: 'mobile-v0.1.17',
      publish: true,
      dryRun: false,
      format: 'markdown',
      config: '.releasejet.yml',
    });

    expect(mockClient.createRelease).toHaveBeenCalledWith(
      'mobile/app',
      expect.objectContaining({
        tagName: 'mobile-v0.1.17',
        name: 'MOBILE v0.1.17',
      }),
    );
    vi.restoreAllMocks();
  });

  it('does not publish in dry-run mode', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await runGenerate({
      tag: 'mobile-v0.1.17',
      publish: true,
      dryRun: true,
      format: 'markdown',
      config: '.releasejet.yml',
    });

    expect(mockClient.createRelease).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('throws when tag is not found in remote', async () => {
    await expect(
      runGenerate({
        tag: 'mobile-v9.9.9',
        publish: false,
        dryRun: false,
        format: 'markdown',
        config: '.releasejet.yml',
      }),
    ).rejects.toThrow('not found');
  });

  it('outputs JSON when format is json', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runGenerate({
      tag: 'mobile-v0.1.17',
      publish: false,
      dryRun: false,
      format: 'json',
      config: '.releasejet.yml',
    });

    const output = consoleSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(output);
    expect(parsed.tagName).toBe('mobile-v0.1.17');
    expect(parsed.version).toBe('0.1.17');
    consoleSpy.mockRestore();
  });
});
