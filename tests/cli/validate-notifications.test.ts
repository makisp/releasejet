import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ReleaseJetConfig } from '../../src/types.js';

vi.mock('../../src/core/config.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/config.js')>();
  return {
    ...actual,
    loadConfig: vi.fn(),
  };
});
vi.mock('../../src/core/git.js', () => ({
  getRemoteUrl: vi.fn().mockReturnValue('git@github.com:acme/app.git'),
  resolveHostUrl: vi.fn().mockReturnValue('https://github.com'),
  resolveProjectPath: vi.fn().mockReturnValue('acme/app'),
  resolveProjectInfo: vi.fn().mockReturnValue({ hostUrl: 'https://github.com', projectPath: 'acme/app' }),
}));
vi.mock('../../src/providers/factory.js', () => ({
  createClient: vi.fn().mockReturnValue({
    listTags: vi.fn().mockResolvedValue([]),
    listIssues: vi.fn().mockResolvedValue([]),
  }),
}));
vi.mock('../../src/cli/auth.js', () => ({
  resolveToken: vi.fn().mockResolvedValue('t'),
}));

import { loadConfig } from '../../src/core/config.js';
import { runValidate } from '../../src/cli/commands/validate.js';
import { runValidateAndCaptureStdout } from './_helpers.js';

const baseConfig: ReleaseJetConfig = {
  provider: { type: 'github', url: 'https://github.com' },
  source: 'issues',
  clients: [],
  categories: { feature: 'Features' },
  uncategorized: 'lenient',
};

describe('validate — notifications section', () => {
  const ORIGINAL = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL };
  });

  it('does not print a Notifications section when config has none', async () => {
    vi.mocked(loadConfig).mockResolvedValue(baseConfig);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runValidate({ config: '.releasejet.yml' });
    const all = log.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(all).not.toMatch(/Notifications/);
    log.mockRestore();
  });

  it('reports each configured channel with enabled state', async () => {
    process.env.RJTEST_URL_A = 'https://example.invalid/hook-a';
    vi.mocked(loadConfig).mockResolvedValue({
      ...baseConfig,
      notifications: [
        { type: 'slack', enabled: true, webhookUrl: 'https://example.invalid/hook-a' },
        { type: 'discord', enabled: false, webhookUrl: 'https://example.invalid/hook-b' },
      ],
    });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runValidate({ config: '.releasejet.yml' });
    const all = log.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(all).toMatch(/Notifications/);
    expect(all).toMatch(/slack.*enabled/i);
    expect(all).toMatch(/discord.*disabled/i);
    log.mockRestore();
  });

  it('warns on enabled channels whose expanded webhookUrl is empty', async () => {
    vi.mocked(loadConfig).mockResolvedValue({
      ...baseConfig,
      notifications: [
        { type: 'slack', enabled: true, webhookUrl: '' },
      ],
    });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runValidate({ config: '.releasejet.yml' });
    const all = log.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(all).toMatch(/empty/i);
    log.mockRestore();
  });

  it('does not print webhookUrl values', async () => {
    vi.mocked(loadConfig).mockResolvedValue({
      ...baseConfig,
      notifications: [
        { type: 'slack', enabled: true, webhookUrl: 'https://hooks.slack.com/services/SECRET' },
      ],
    });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runValidate({ config: '.releasejet.yml' });
    const all = log.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(all).not.toMatch(/SECRET/);
    expect(all).not.toMatch(/hooks\.slack\.com/);
    log.mockRestore();
  });

  it('does not print webhookUrl values when channel is disabled', async () => {
    vi.mocked(loadConfig).mockResolvedValue({
      ...baseConfig,
      notifications: [
        { type: 'discord', enabled: false, webhookUrl: 'https://hooks.slack.com/services/SECRET2' },
      ],
    });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runValidate({ config: '.releasejet.yml' });
    const all = log.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(all).not.toMatch(/SECRET2/);
    expect(all).not.toMatch(/hooks\.slack\.com/);
    log.mockRestore();
  });

  it('does not print webhookUrl values in --debug output', async () => {
    vi.mocked(loadConfig).mockResolvedValue({
      ...baseConfig,
      notifications: [
        { type: 'slack', enabled: true, webhookUrl: 'https://hooks.slack.com/services/DEBUG_SECRET' },
      ],
    });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    await runValidate({ config: '.releasejet.yml', debug: true });
    const all = [...log.mock.calls, ...errLog.mock.calls].map((c) => c.join(' ')).join('\n');
    expect(all).not.toMatch(/DEBUG_SECRET/);
    expect(all).not.toMatch(/hooks\.slack\.com/);
    log.mockRestore();
    errLog.mockRestore();
  });
});

describe('validate — projectName reporting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prints the configured projectName when set', async () => {
    const out = await runValidateAndCaptureStdout({
      configOverrides: { projectName: 'Test Project' },
      projectUrl: 'https://github.com/acme/whatever',
    });
    expect(out).toMatch(/^Project:\s+Test Project$/m);
  });

  it('prints the derived projectName when config is unset', async () => {
    const out = await runValidateAndCaptureStdout({
      configOverrides: {},
      projectUrl: 'https://github.com/acme/Derived-Name',
    });
    expect(out).toMatch(/^Project:\s+Derived-Name$/m);
  });

  it('prints "(unset)" when neither resolver has a value', async () => {
    const out = await runValidateAndCaptureStdout({
      configOverrides: {},
      projectUrl: '',
    });
    expect(out).toMatch(/^Project:\s+\(unset\)$/m);
  });
});
