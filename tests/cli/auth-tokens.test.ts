import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  access: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@inquirer/prompts', () => ({
  password: vi.fn(),
  confirm: vi.fn(),
  input: vi.fn(),
}));

import { readFile, writeFile } from 'node:fs/promises';
import { confirm } from '@inquirer/prompts';
import { runListTokens, runRemoveToken } from '../../src/cli/commands/auth.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('runListTokens', () => {
  it('prints "No tokens stored." when file is missing', async () => {
    vi.mocked(readFile).mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runListTokens({});
    const output = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(output).toContain('No tokens stored');
    logSpy.mockRestore();
  });

  it('prints all entries grouped by kind, masked by default', async () => {
    vi.mocked(readFile).mockResolvedValue(
      'gitlab.com: glpat-aaaaaaaaaaaa\n' +
      'company.gitlab.com: glpat-bbbbbbbbbbbb\n' +
      'gitlab.com/myorg/api: glpat-cccccccccccc\n' +
      'gitlab: glpat-legacy\n' as any,
    );
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runListTokens({});
    const output = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(output).toContain('Host entries (2)');
    expect(output).toContain('gitlab.com');
    expect(output).toContain('company.gitlab.com');
    expect(output).toContain('Repo entries (1)');
    expect(output).toContain('gitlab.com/myorg/api');
    expect(output).toContain('Legacy entries (1)');
    expect(output).toContain('migrate-tokens');
    expect(output).toContain('••••••••');
    expect(output).not.toContain('glpat-aaaaaaaaaaaa');
    logSpy.mockRestore();
  });

  it('reveals raw tokens when --show-tokens is passed', async () => {
    vi.mocked(readFile).mockResolvedValue('gitlab.com: glpat-secret\n' as any);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runListTokens({ showTokens: true });
    const output = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(output).toContain('glpat-secret');
    expect(output).not.toContain('••••••••');
    logSpy.mockRestore();
  });

  it('omits sections that have no entries', async () => {
    vi.mocked(readFile).mockResolvedValue('gitlab.com: glpat-x\n' as any);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runListTokens({});
    const output = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(output).toContain('Host entries (1)');
    expect(output).not.toContain('Repo entries');
    expect(output).not.toContain('Legacy entries');
    logSpy.mockRestore();
  });

  it('prints a stderr warning with count when malformed entries are present', async () => {
    vi.mocked(readFile).mockResolvedValue(
      'gitlab.com: glpat-x\n' +
      'pro:\n  token: jwt\n  expiresAt: 2026-12-31\n' +
      'broken: 12345\n' as any,
    );
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await runListTokens({});
    const errOut = errSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(errOut).toMatch(/2 entr(y|ies) skipped/i);
    logSpy.mockRestore();
    errSpy.mockRestore();
  });
});

describe('runRemoveToken', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(confirm).mockResolvedValue(true);
    const { access } = await import('node:fs/promises');
    vi.mocked(access).mockResolvedValue(undefined);
  });

  it('rejects when more than one of --host/--repo/--legacy is passed', async () => {
    await expect(runRemoveToken({ host: 'gitlab.com', repo: 'gitlab.com/x/y' }))
      .rejects.toThrow(/exactly one|mutually exclusive/i);
  });

  it('rejects when none of --host/--repo/--legacy is passed', async () => {
    await expect(runRemoveToken({})).rejects.toThrow(/exactly one|mutually exclusive/i);
  });

  it('rejects an invalid --legacy value', async () => {
    await expect(runRemoveToken({ legacy: 'bitbucket' as any }))
      .rejects.toThrow(/--legacy.*must be.*gitlab.*github/i);
  });

  it('removes a host entry after confirmation', async () => {
    vi.mocked(readFile).mockResolvedValue('gitlab.com: glpat-x\ngithub.com: ghp_y\n' as any);
    vi.mocked(confirm).mockResolvedValue(true);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runRemoveToken({ host: 'gitlab.com' });
    const written = String(vi.mocked(writeFile).mock.calls[0][1]);
    expect(written).not.toContain('gitlab.com');
    expect(written).toContain('github.com: ghp_y');
    expect(logSpy.mock.calls.map((c) => String(c[0])).join('\n')).toContain('Removed');
    logSpy.mockRestore();
  });

  it('removes a repo entry by --repo', async () => {
    vi.mocked(readFile).mockResolvedValue('gitlab.com/myorg/api: glpat-x\n' as any);
    vi.mocked(confirm).mockResolvedValue(true);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runRemoveToken({ repo: 'gitlab.com/myorg/api' });
    const written = String(vi.mocked(writeFile).mock.calls[0][1]);
    expect(written).not.toContain('gitlab.com/myorg/api');
    logSpy.mockRestore();
  });

  it('accepts a full URL for --repo', async () => {
    vi.mocked(readFile).mockResolvedValue('gitlab.com/myorg/api: glpat-x\n' as any);
    vi.mocked(confirm).mockResolvedValue(true);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runRemoveToken({ repo: 'https://gitlab.com/myorg/api' });
    const written = String(vi.mocked(writeFile).mock.calls[0][1]);
    expect(written).not.toContain('gitlab.com/myorg/api');
    logSpy.mockRestore();
  });

  it('removes a legacy entry by --legacy', async () => {
    vi.mocked(readFile).mockResolvedValue('gitlab: glpat-legacy\ngithub.com: ghp_y\n' as any);
    vi.mocked(confirm).mockResolvedValue(true);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runRemoveToken({ legacy: 'gitlab' });
    const written = String(vi.mocked(writeFile).mock.calls[0][1]);
    expect(written).not.toMatch(/^gitlab:/m);
    expect(written).toContain('github.com: ghp_y');
    logSpy.mockRestore();
  });

  it('aborts and does not write when confirmation is declined', async () => {
    vi.mocked(readFile).mockResolvedValue('gitlab.com: glpat-x\n' as any);
    vi.mocked(confirm).mockResolvedValue(false);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runRemoveToken({ host: 'gitlab.com' });
    expect(writeFile).not.toHaveBeenCalled();
    expect(logSpy.mock.calls.map((c) => String(c[0])).join('\n')).toMatch(/aborted|cancelled/i);
    logSpy.mockRestore();
  });

  it('skips the confirmation prompt when --yes is passed', async () => {
    vi.mocked(readFile).mockResolvedValue('gitlab.com: glpat-x\n' as any);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runRemoveToken({ host: 'gitlab.com', yes: true });
    expect(confirm).not.toHaveBeenCalled();
    expect(writeFile).toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it('throws when the file does not exist', async () => {
    vi.mocked(readFile).mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    const { access } = await import('node:fs/promises');
    vi.mocked(access).mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    await expect(runRemoveToken({ host: 'gitlab.com', yes: true }))
      .rejects.toThrow(/No credentials file|nothing to remove/);
  });

  it('throws when the key is not present', async () => {
    vi.mocked(readFile).mockResolvedValue('github.com: ghp_x\n' as any);
    await expect(runRemoveToken({ host: 'gitlab.com', yes: true }))
      .rejects.toThrow(/No entry found for/);
  });
});

vi.mock('../../src/core/config.js', () => ({
  loadConfig: vi.fn(),
}));

import { loadConfig } from '../../src/core/config.js';
import { runShowToken } from '../../src/cli/commands/auth.js';

describe('runShowToken', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.RELEASEJET_TOKEN;
    delete process.env.GITLAB_API_TOKEN;
    delete process.env.GITHUB_TOKEN;
  });

  it('uses --repo arg and prints the full chain with hits and misses', async () => {
    vi.mocked(readFile).mockImplementation(async (p: any) => {
      if (String(p).endsWith('credentials.yml')) return 'gitlab.com: glpat-host\n' as any;
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runShowToken({ repoArg: 'gitlab.com/myorg/api' });
    const out = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(out).toContain('Resolving token for gitlab.com/myorg/api');
    expect(out).toMatch(/RELEASEJET_TOKEN.*not set/);
    expect(out).toMatch(/GITLAB_API_TOKEN.*not set/);
    expect(out).toMatch(/gitlab\.com\/myorg\/api.*not present/);
    expect(out).toMatch(/gitlab\.com\].*match.*used/i);
    expect(out).not.toContain('glpat-host');
    logSpy.mockRestore();
  });

  it('reveals the resolved token with --show-tokens', async () => {
    vi.mocked(readFile).mockImplementation(async (p: any) => {
      if (String(p).endsWith('credentials.yml')) return 'gitlab.com: glpat-host\n' as any;
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runShowToken({ repoArg: 'gitlab.com/myorg/api', showTokens: true });
    const out = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(out).toContain('glpat-host');
    logSpy.mockRestore();
  });

  it('prints "No token resolved" when every step misses', async () => {
    vi.mocked(readFile).mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runShowToken({ repoArg: 'gitlab.com/myorg/api' });
    const out = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(out).toMatch(/No token resolved/);
    expect(out).toMatch(/auth set-token/);
    logSpy.mockRestore();
  });

  it('marks env-universal as used when set, all later steps as skipped', async () => {
    process.env.RELEASEJET_TOKEN = 'universal';
    vi.mocked(readFile).mockResolvedValue('gitlab.com: glpat-host\n' as any);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runShowToken({ repoArg: 'gitlab.com/myorg/api' });
    const out = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(out).toMatch(/RELEASEJET_TOKEN.*used/);
    expect(out).toMatch(/skipped/);
    logSpy.mockRestore();
  });

  it('marks legacy as skipped when host matched but legacy entry exists', async () => {
    vi.mocked(readFile).mockImplementation(async (p: any) => {
      if (String(p).endsWith('credentials.yml')) return 'gitlab: legacy\ngitlab.com: host-tok\n' as any;
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runShowToken({ repoArg: 'gitlab.com/myorg/api' });
    const out = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(out).toMatch(/\[gitlab\].*skipped/);
    logSpy.mockRestore();
  });

  it('auto-detects host and projectPath from config + git remote when no arg passed', async () => {
    vi.mocked(loadConfig).mockResolvedValue({
      provider: { type: 'gitlab', url: 'https://gitlab.com' },
    } as any);
    vi.mocked(readFile).mockImplementation(async (p: any) => {
      if (String(p).endsWith('credentials.yml')) return 'gitlab.com: glpat-host\n' as any;
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runShowToken({
      gitRemoteFn: () => 'https://gitlab.com/myorg/api.git',
    });
    const out = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(out).toContain('Resolving token for gitlab.com/myorg/api');
    logSpy.mockRestore();
  });

  it('falls back to host-only when git remote is unavailable', async () => {
    vi.mocked(loadConfig).mockResolvedValue({
      provider: { type: 'gitlab', url: 'https://gitlab.com' },
    } as any);
    vi.mocked(readFile).mockImplementation(async (p: any) => {
      if (String(p).endsWith('credentials.yml')) return 'gitlab.com: glpat-host\n' as any;
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runShowToken({
      gitRemoteFn: () => { throw new Error('not a git repo'); },
    });
    const out = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(out).toContain('Resolving token for gitlab.com');
    expect(out).not.toContain('gitlab.com/');
    logSpy.mockRestore();
  });

  it('throws auto-detect error when no arg and no config url', async () => {
    vi.mocked(loadConfig).mockResolvedValue({ provider: {} } as any);
    await expect(runShowToken({
      gitRemoteFn: () => { throw new Error('no remote'); },
    })).rejects.toThrow(/Could not auto-detect/);
  });

  it('accepts a full URL form for the repo arg', async () => {
    vi.mocked(readFile).mockImplementation(async (p: any) => {
      if (String(p).endsWith('credentials.yml')) return 'gitlab.com: glpat-host\n' as any;
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runShowToken({ repoArg: 'https://gitlab.com/myorg/api' });
    const out = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(out).toContain('gitlab.com/myorg/api');
    logSpy.mockRestore();
  });
});
