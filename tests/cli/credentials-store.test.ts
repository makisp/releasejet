import { describe, it, expect } from 'vitest';
import { redactToken } from '../../src/cli/credentials-store.js';

describe('redactToken', () => {
  it('returns a fixed eight-bullet mask regardless of input length', () => {
    expect(redactToken('glpat-abc')).toBe('••••••••');
    expect(redactToken('ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).toBe('••••••••');
    expect(redactToken('x')).toBe('••••••••');
    expect(redactToken('')).toBe('••••••••');
  });
});

import { vi, beforeEach } from 'vitest';

vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
  return {
    ...actual,
    readFile: vi.fn(),
    writeFile: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
  };
});

import { readFile } from 'node:fs/promises';
import { readEntries } from '../../src/cli/credentials-store.js';

describe('readEntries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty result when file does not exist', async () => {
    vi.mocked(readFile).mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    const result = await readEntries();
    expect(result.entries).toEqual([]);
    expect(result.malformed).toEqual([]);
  });

  it('throws a clear error when file exists but is unreadable', async () => {
    vi.mocked(readFile).mockRejectedValue(
      Object.assign(new Error('permission denied'), { code: 'EACCES' }),
    );
    await expect(readEntries()).rejects.toThrow(/Could not read credentials/);
  });

  it('classifies entries as host, repo, or legacy', async () => {
    vi.mocked(readFile).mockResolvedValue(
      'gitlab.com: glpat-host\n' +
      'company.gitlab.com:8443: glpat-port\n' +
      'gitlab.com/myorg/api: glpat-repo\n' +
      'gitlab: glpat-legacy-gl\n' +
      'github: ghp_legacy-gh\n' as any,
    );
    const result = await readEntries();
    const byKey = Object.fromEntries(result.entries.map((e) => [e.key, e]));
    expect(byKey['gitlab.com'].kind).toBe('host');
    expect(byKey['company.gitlab.com:8443'].kind).toBe('host');
    expect(byKey['gitlab.com/myorg/api'].kind).toBe('repo');
    expect(byKey['gitlab'].kind).toBe('legacy');
    expect(byKey['github'].kind).toBe('legacy');
  });

  it('classifies legacy keys case-insensitively', async () => {
    vi.mocked(readFile).mockResolvedValue('GITLAB: glpat-x\n' as any);
    const result = await readEntries();
    expect(result.entries[0].kind).toBe('legacy');
    expect(result.entries[0].key).toBe('gitlab');
  });

  it('filters out empty-string values', async () => {
    vi.mocked(readFile).mockResolvedValue(
      'gitlab.com: ""\n' +
      'github.com: ghp_real\n' as any,
    );
    const result = await readEntries();
    expect(result.entries.map((e) => e.key)).toEqual(['github.com']);
  });

  it('skips non-string values and records them under malformed', async () => {
    vi.mocked(readFile).mockResolvedValue(
      'gitlab.com: glpat-real\n' +
      'pro:\n  token: jwt-here\n  expiresAt: 2026-12-31\n' +
      'broken: 12345\n' as any,
    );
    const result = await readEntries();
    expect(result.entries.map((e) => e.key)).toEqual(['gitlab.com']);
    expect(result.malformed.sort()).toEqual(['broken', 'pro']);
  });

  it('returns tokens unmodified', async () => {
    vi.mocked(readFile).mockResolvedValue('gitlab.com: glpat-secret-123\n' as any);
    const result = await readEntries();
    expect(result.entries[0].token).toBe('glpat-secret-123');
  });

  it('lowercases keys when reading', async () => {
    vi.mocked(readFile).mockResolvedValue('GitLab.COM: glpat-x\n' as any);
    const result = await readEntries();
    expect(result.entries[0].key).toBe('gitlab.com');
  });
});

import { writeFile, mkdir } from 'node:fs/promises';
import { writeEntry } from '../../src/cli/credentials-store.js';

describe('writeEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a new credentials file with the given key/value (mode 0600)', async () => {
    vi.mocked(readFile).mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    await writeEntry('gitlab.com', 'glpat-new');
    expect(mkdir).toHaveBeenCalled();
    const call = vi.mocked(writeFile).mock.calls[0];
    expect(String(call[0])).toMatch(/credentials\.yml$/);
    expect(call[1]).toContain('gitlab.com: glpat-new');
    expect(call[2]).toEqual({ mode: 0o600 });
  });

  it('lowercases the key before writing', async () => {
    vi.mocked(readFile).mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    await writeEntry('GitLab.COM', 'glpat-new');
    const written = String(vi.mocked(writeFile).mock.calls[0][1]);
    expect(written).toContain('gitlab.com: glpat-new');
    expect(written).not.toContain('GitLab.COM');
  });

  it('preserves all existing top-level entries (other host, pro block, legacy)', async () => {
    vi.mocked(readFile).mockResolvedValue(
      'gitlab: glpat-legacy\n' +
      'github.com: ghp_other\n' +
      'pro:\n  token: jwt-here\n  expiresAt: 2026-12-31\n' as any,
    );
    await writeEntry('gitlab.com', 'glpat-new');
    const written = String(vi.mocked(writeFile).mock.calls[0][1]);
    expect(written).toContain('gitlab: glpat-legacy');
    expect(written).toContain('github.com: ghp_other');
    expect(written).toContain('pro:');
    expect(written).toContain('token: jwt-here');
    expect(written).toContain('gitlab.com: glpat-new');
  });

  it('overwrites an existing key in place', async () => {
    vi.mocked(readFile).mockResolvedValue('gitlab.com: glpat-old\n' as any);
    await writeEntry('gitlab.com', 'glpat-new');
    const written = String(vi.mocked(writeFile).mock.calls[0][1]);
    expect(written).toContain('gitlab.com: glpat-new');
    expect(written).not.toContain('glpat-old');
  });

  it('refuses to overwrite when the file exists but is unreadable', async () => {
    vi.mocked(readFile).mockRejectedValue(
      Object.assign(new Error('permission denied'), { code: 'EACCES' }),
    );
    await expect(writeEntry('gitlab.com', 'glpat-new')).rejects.toThrow(
      /Refusing to overwrite|data loss/,
    );
    expect(writeFile).not.toHaveBeenCalled();
  });
});
