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
