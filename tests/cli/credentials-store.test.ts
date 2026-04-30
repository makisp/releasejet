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

import { removeEntry } from '../../src/cli/credentials-store.js';

describe('removeEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns false and does not write when file does not exist', async () => {
    vi.mocked(readFile).mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    const result = await removeEntry('gitlab.com');
    expect(result).toBe(false);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('returns false and does not write when key is not present', async () => {
    vi.mocked(readFile).mockResolvedValue('github.com: ghp_x\n' as any);
    const result = await removeEntry('gitlab.com');
    expect(result).toBe(false);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('returns true and removes the key when present', async () => {
    vi.mocked(readFile).mockResolvedValue(
      'gitlab.com: glpat-target\ngithub.com: ghp_keep\n' as any,
    );
    const result = await removeEntry('gitlab.com');
    expect(result).toBe(true);
    const written = String(vi.mocked(writeFile).mock.calls[0][1]);
    expect(written).not.toContain('gitlab.com');
    expect(written).toContain('github.com: ghp_keep');
  });

  it('lowercases the lookup key before matching', async () => {
    vi.mocked(readFile).mockResolvedValue('gitlab.com: glpat-x\n' as any);
    const result = await removeEntry('GitLab.COM');
    expect(result).toBe(true);
  });

  it('preserves the pro block and legacy keys when removing a host', async () => {
    vi.mocked(readFile).mockResolvedValue(
      'gitlab.com: glpat-target\n' +
      'gitlab: glpat-legacy\n' +
      'pro:\n  token: jwt\n  expiresAt: 2026-12-31\n' as any,
    );
    await removeEntry('gitlab.com');
    const written = String(vi.mocked(writeFile).mock.calls[0][1]);
    expect(written).toContain('gitlab: glpat-legacy');
    expect(written).toContain('pro:');
    expect(written).toContain('token: jwt');
    expect(written).not.toContain('gitlab.com');
  });

  it('writes mode 0600 when removing', async () => {
    vi.mocked(readFile).mockResolvedValue('gitlab.com: x\n' as any);
    await removeEntry('gitlab.com');
    expect(vi.mocked(writeFile).mock.calls[0][2]).toEqual({ mode: 0o600 });
  });
});

import { afterEach } from 'vitest';
import { resolveTokenChain } from '../../src/cli/credentials-store.js';

describe('resolveTokenChain', () => {
  const originalEnv = process.env;
  const GL = 'https://gitlab.com';
  const GH = 'https://github.com';
  const PATH = 'myorg/api';

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.RELEASEJET_TOKEN;
    delete process.env.GITLAB_API_TOKEN;
    delete process.env.GITHUB_TOKEN;
    vi.mocked(readFile).mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('emits all six steps in order', async () => {
    const chain = await resolveTokenChain('gitlab', GL, PATH);
    expect(chain.map((s) => s.source)).toEqual([
      'env-universal',
      'env-provider',
      'repo',
      'host',
      'legacy',
      'legacy-file',
    ]);
  });

  it('hits env-universal first, marks all later steps skipped', async () => {
    process.env.RELEASEJET_TOKEN = 'universal-token';
    process.env.GITHUB_TOKEN = 'gh-env';
    vi.mocked(readFile).mockResolvedValue('github.com: ghp_file\n' as any);
    const chain = await resolveTokenChain('github', GH, PATH);
    expect(chain[0]).toMatchObject({ source: 'env-universal', status: 'hit', value: 'universal-token' });
    expect(chain.slice(1).every((s) => s.status === 'skipped')).toBe(true);
  });

  it('hits env-provider when env-universal is unset', async () => {
    process.env.GITHUB_TOKEN = 'gh-env';
    const chain = await resolveTokenChain('github', GH, PATH);
    expect(chain[0]).toMatchObject({ source: 'env-universal', status: 'miss' });
    expect(chain[1]).toMatchObject({ source: 'env-provider', key: 'GITHUB_TOKEN', status: 'hit', value: 'gh-env' });
    expect(chain.slice(2).every((s) => s.status === 'skipped')).toBe(true);
  });

  it('uses GITLAB_API_TOKEN as env-provider for gitlab', async () => {
    process.env.GITLAB_API_TOKEN = 'gl-env';
    const chain = await resolveTokenChain('gitlab', GL, PATH);
    expect(chain[1]).toMatchObject({ source: 'env-provider', key: 'GITLAB_API_TOKEN', status: 'hit' });
  });

  it('hits repo step when only repo key exists in YAML', async () => {
    vi.mocked(readFile).mockImplementation(async (p: any) => {
      if (String(p).endsWith('credentials.yml')) {
        return 'gitlab.com/myorg/api: repo-token\n' as any;
      }
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });
    const chain = await resolveTokenChain('gitlab', GL, PATH);
    expect(chain[2]).toMatchObject({ source: 'repo', key: 'gitlab.com/myorg/api', status: 'hit', value: 'repo-token' });
    expect(chain[3]).toMatchObject({ source: 'host', status: 'skipped' });
  });

  it('hits host step when host key exists and no repo key', async () => {
    vi.mocked(readFile).mockImplementation(async (p: any) => {
      if (String(p).endsWith('credentials.yml')) {
        return 'gitlab.com: host-token\n' as any;
      }
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });
    const chain = await resolveTokenChain('gitlab', GL, PATH);
    expect(chain[2]).toMatchObject({ source: 'repo', key: 'gitlab.com/myorg/api', status: 'miss' });
    expect(chain[3]).toMatchObject({ source: 'host', key: 'gitlab.com', status: 'hit', value: 'host-token' });
  });

  it('hits legacy step only when no host key matched', async () => {
    vi.mocked(readFile).mockImplementation(async (p: any) => {
      if (String(p).endsWith('credentials.yml')) {
        return 'gitlab: legacy-wildcard\n' as any;
      }
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });
    const chain = await resolveTokenChain('gitlab', GL, PATH);
    expect(chain[3]).toMatchObject({ source: 'host', status: 'miss' });
    expect(chain[4]).toMatchObject({ source: 'legacy', key: 'gitlab', status: 'hit', value: 'legacy-wildcard' });
  });

  it('marks legacy as skipped when host key matched (matches existing behavior)', async () => {
    vi.mocked(readFile).mockImplementation(async (p: any) => {
      if (String(p).endsWith('credentials.yml')) {
        return 'gitlab.com: host-token\ngitlab: legacy-old\n' as any;
      }
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });
    const chain = await resolveTokenChain('gitlab', GL, PATH);
    expect(chain[3]).toMatchObject({ source: 'host', status: 'hit' });
    expect(chain[4]).toMatchObject({ source: 'legacy', status: 'skipped' });
  });

  it('hits legacy-file when YAML has no useful entry but bare-text file exists', async () => {
    vi.mocked(readFile).mockImplementation(async (p: any) => {
      const path = String(p);
      if (path.endsWith('credentials.yml')) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      if (path.endsWith('credentials')) return 'bare-text-token\n' as any;
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });
    const chain = await resolveTokenChain('gitlab', GL, PATH);
    expect(chain[5]).toMatchObject({ source: 'legacy-file', status: 'hit', value: 'bare-text-token' });
  });

  it('full miss — every step misses, no hits', async () => {
    const chain = await resolveTokenChain('gitlab', GL, PATH);
    expect(chain.every((s) => s.status === 'miss')).toBe(true);
  });

  it('skips repo step (still emits it as miss with placeholder key) when projectPath is empty', async () => {
    vi.mocked(readFile).mockImplementation(async (p: any) => {
      if (String(p).endsWith('credentials.yml')) return 'gitlab.com: host-token\n' as any;
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });
    const chain = await resolveTokenChain('gitlab', GL, '');
    expect(chain[2]).toMatchObject({ source: 'repo', status: 'miss' });
    expect(chain[3]).toMatchObject({ source: 'host', status: 'hit' });
  });

  it('matches host case-insensitively and strips default ports', async () => {
    vi.mocked(readFile).mockResolvedValue('gitlab.com: gl-token\n' as any);
    const chain = await resolveTokenChain('gitlab', 'https://GITLAB.COM:443/', PATH);
    expect(chain[3]).toMatchObject({ source: 'host', status: 'hit', value: 'gl-token' });
  });
});
