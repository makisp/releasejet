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
      afterPublish: { run: afterPublishRun },
    },
  }),
}));

import { runGenerateAndCaptureAfterPublish } from './_helpers.js';

describe('generate — projectName propagation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prefers config.projectName over derivation', async () => {
    const payload = await runGenerateAndCaptureAfterPublish({
      configOverrides: { projectName: 'Test Project' },
      projectUrl: 'https://github.com/acme/repo',
      afterPublishRun,
    });
    expect(payload.projectName).toBe('Test Project');
  });

  it('falls back to deriveProjectName when config.projectName is unset', async () => {
    const payload = await runGenerateAndCaptureAfterPublish({
      configOverrides: {},
      projectUrl: 'https://github.com/acme/Test-Project',
      afterPublishRun,
    });
    expect(payload.projectName).toBe('Test-Project');
  });

  it('leaves projectName undefined when both resolvers fail', async () => {
    const payload = await runGenerateAndCaptureAfterPublish({
      configOverrides: {},
      projectUrl: '',
      afterPublishRun,
    });
    expect(payload.projectName).toBeUndefined();
  });
});
