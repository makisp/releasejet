import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/core/config.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/config.js')>();
  return {
    ...actual,
    loadConfig: vi.fn(),
  };
});
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
      afterGenerate: { run: vi.fn() },
      afterPublish: { run: afterPublishRun },
    },
  }),
}));

import { loadConfig } from '../../src/core/config.js';
import { createClient } from '../../src/providers/factory.js';
import { runGenerate } from '../../src/cli/commands/generate.js';
import { baseGenerateConfig, makeGenerateClient } from './_helpers.js';

describe('runGenerate — afterPublish payload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadConfig).mockResolvedValue(baseGenerateConfig);
    vi.mocked(createClient).mockReturnValue(makeGenerateClient());
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
      ...baseGenerateConfig,
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

  it('does not print webhookUrl values in --debug output', async () => {
    vi.mocked(loadConfig).mockResolvedValue({
      ...baseGenerateConfig,
      notifications: [
        { type: 'slack', enabled: true, webhookUrl: 'https://hooks.slack.com/services/GEN_DEBUG_SECRET' },
      ],
    });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    await runGenerate({
      tag: 'v1.1.0',
      publish: false,
      dryRun: false,
      format: 'markdown',
      config: '.releasejet.yml',
      notify: true,
      debug: true,
    } as never);
    const all = [...log.mock.calls, ...errLog.mock.calls].map((c) => c.join(' ')).join('\n');
    expect(all).not.toMatch(/GEN_DEBUG_SECRET/);
    expect(all).not.toMatch(/hooks\.slack\.com/);
    log.mockRestore();
    errLog.mockRestore();
  });
});
