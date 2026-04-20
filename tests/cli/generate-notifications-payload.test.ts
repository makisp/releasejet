import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ProviderClient } from '../../src/providers/types.js';
import type { ReleaseJetConfig } from '../../src/types.js';

vi.mock('../../src/core/config.js', () => ({
  loadConfig: vi.fn(),
}));
vi.mock('../../src/core/git.js', () => ({
  getRemoteUrl: vi.fn().mockReturnValue('git@github.com:acme/app.git'),
  resolveProjectInfo: vi.fn().mockReturnValue({ hostUrl: 'https://github.com', projectPath: 'acme/app' }),
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

const { afterPublishRun } = vi.hoisted(() => ({ afterPublishRun: vi.fn() }));
vi.mock('../../src/plugins/loader.js', () => ({
  getPluginRuntime: vi.fn().mockReturnValue({
    hasFormatter: vi.fn().mockReturnValue(false),
    runFormatter: vi.fn(),
    hooks: {
      beforeFormat: { run: vi.fn() },
      afterPublish: { run: afterPublishRun },
    },
  }),
}));

import { loadConfig } from '../../src/core/config.js';
import { createClient } from '../../src/providers/factory.js';
import { runGenerate } from '../../src/cli/commands/generate.js';

const baseConfig: ReleaseJetConfig = {
  provider: { type: 'github', url: 'https://github.com' },
  source: 'issues',
  clients: [],
  categories: { feature: 'Features', bug: 'Fixes' },
  uncategorized: 'lenient',
};

function makeClient(): ProviderClient {
  return {
    listTags: vi.fn().mockResolvedValue([
      { name: 'v1.0.0', createdAt: '2026-01-01T00:00:00Z', commitDate: '2026-01-01T00:00:00Z', dateSource: 'annotated' as const },
      { name: 'v1.1.0', createdAt: '2026-02-01T00:00:00Z', commitDate: '2026-02-01T00:00:00Z', dateSource: 'annotated' as const },
    ]),
    listIssues: vi.fn().mockResolvedValue([
      { number: 1, title: 'Ship', labels: ['feature'], closedAt: '2026-01-15', webUrl: '', milestone: null, author: null, assignee: null, closedBy: null },
    ]),
    listPullRequests: vi.fn().mockResolvedValue([]),
    createRelease: vi.fn().mockResolvedValue(undefined),
    listMilestones: vi.fn().mockResolvedValue([]),
  };
}

describe('runGenerate — afterPublish payload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadConfig).mockResolvedValue(baseConfig);
    vi.mocked(createClient).mockReturnValue(makeClient());
  });

  // Commander maps `--no-notify` to a boolean `notify` option that defaults to true.
  // `notify: true`  → user did NOT pass --no-notify → notifyDisabled = false
  // `notify: false` → user passed --no-notify       → notifyDisabled = true

  it('passes data, releaseUrl, and notifyDisabled=false to afterPublish by default', async () => {
    await runGenerate({
      tag: 'v1.1.0',
      publish: true,
      dryRun: false,
      format: 'markdown',
      config: '.releasejet.yml',
      notify: true,
    } as never);

    expect(afterPublishRun).toHaveBeenCalledTimes(1);
    const payload = afterPublishRun.mock.calls[0][0];
    expect(payload.tagName).toBe('v1.1.0');
    expect(payload.releaseUrl).toBe('https://github.com/acme/app/releases/tag/v1.1.0');
    expect(payload.data).toBeDefined();
    expect(payload.data.tagName).toBe('v1.1.0');
    expect(payload.notifyDisabled).toBe(false);
  });

  it('passes notifyDisabled=true when --no-notify is set', async () => {
    await runGenerate({
      tag: 'v1.1.0',
      publish: true,
      dryRun: false,
      format: 'markdown',
      config: '.releasejet.yml',
      notify: false,
    } as never);

    const payload = afterPublishRun.mock.calls[0][0];
    expect(payload.notifyDisabled).toBe(true);
  });

  it('uses GitLab URL shape when provider.type is gitlab', async () => {
    vi.mocked(loadConfig).mockResolvedValue({
      ...baseConfig,
      provider: { type: 'gitlab', url: 'https://gitlab.example.com' },
    });
    // Repoint git module mock for this test
    const git = await import('../../src/core/git.js');
    vi.mocked(git.resolveProjectInfo).mockReturnValue({
      hostUrl: 'https://gitlab.example.com',
      projectPath: 'acme/app',
    });

    await runGenerate({
      tag: 'v1.1.0',
      publish: true,
      dryRun: false,
      format: 'markdown',
      config: '.releasejet.yml',
      notify: true,
    } as never);

    const payload = afterPublishRun.mock.calls[0][0];
    expect(payload.releaseUrl).toBe('https://gitlab.example.com/acme/app/-/releases/v1.1.0');
  });

  it('does not fire afterPublish when --dry-run is set', async () => {
    await runGenerate({
      tag: 'v1.1.0',
      publish: true,
      dryRun: true,
      format: 'markdown',
      config: '.releasejet.yml',
      notify: true,
    } as never);
    expect(afterPublishRun).not.toHaveBeenCalled();
  });

  it('does not fire afterPublish when --publish is false', async () => {
    await runGenerate({
      tag: 'v1.1.0',
      publish: false,
      dryRun: false,
      format: 'markdown',
      config: '.releasejet.yml',
      notify: true,
    } as never);
    expect(afterPublishRun).not.toHaveBeenCalled();
  });
});
