import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

import { readFile, writeFile } from 'node:fs/promises';
import { runListTokens } from '../../src/cli/commands/auth.js';

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
