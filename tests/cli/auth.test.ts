import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
  return {
    ...actual,
    readFile: vi.fn(),
    writeFile: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
  };
});

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolveToken } from '../../src/cli/auth.js';

describe('resolveToken', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
    delete process.env.RELEASEJET_TOKEN;
    delete process.env.GITLAB_API_TOKEN;
    delete process.env.GITHUB_TOKEN;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns RELEASEJET_TOKEN for any provider', async () => {
    process.env.RELEASEJET_TOKEN = 'universal-token';
    expect(await resolveToken('gitlab')).toBe('universal-token');
    expect(await resolveToken('github')).toBe('universal-token');
  });

  it('returns GITLAB_API_TOKEN for gitlab provider', async () => {
    process.env.GITLAB_API_TOKEN = 'gl-token';
    expect(await resolveToken('gitlab')).toBe('gl-token');
  });

  it('returns GITHUB_TOKEN for github provider', async () => {
    process.env.GITHUB_TOKEN = 'gh-token';
    expect(await resolveToken('github')).toBe('gh-token');
  });

  it('reads provider key from credentials.yml', async () => {
    vi.mocked(readFile).mockImplementation(async (path: any) => {
      if (path.includes('credentials.yml')) return 'gitlab: gl-stored\ngithub: gh-stored\n' as any;
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });
    expect(await resolveToken('github')).toBe('gh-stored');
  });

  it('falls back to legacy credentials file', async () => {
    vi.mocked(readFile).mockImplementation(async (path: any) => {
      if (path.includes('credentials.yml')) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      if (path.includes('credentials')) return 'legacy-token\n' as any;
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });
    expect(await resolveToken('gitlab')).toBe('legacy-token');
  });

  it('throws with provider-aware message when no token found', async () => {
    vi.mocked(readFile).mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    await expect(resolveToken('github')).rejects.toThrow('GitHub');
    await expect(resolveToken('gitlab')).rejects.toThrow('GitLab');
  });
});

import { deriveHost, deriveRepoKey } from '../../src/cli/auth.js';

describe('deriveHost', () => {
  it('strips protocol and trailing slash, lowercases', () => {
    expect(deriveHost('https://gitlab.com/')).toBe('gitlab.com');
    expect(deriveHost('http://gitlab.com')).toBe('gitlab.com');
    expect(deriveHost('GITLAB.COM')).toBe('gitlab.com');
  });

  it('preserves non-default ports, strips default ports', () => {
    expect(deriveHost('https://gitlab.example.com:8443')).toBe('gitlab.example.com:8443');
    expect(deriveHost('http://gitlab.example.com:8080')).toBe('gitlab.example.com:8080');
    expect(deriveHost('https://gitlab.example.com:443')).toBe('gitlab.example.com');
    expect(deriveHost('http://gitlab.example.com:80')).toBe('gitlab.example.com');
  });

  it('accepts a bare hostname', () => {
    expect(deriveHost('gitlab.com')).toBe('gitlab.com');
    expect(deriveHost('company.gitlab.com:8443')).toBe('company.gitlab.com:8443');
  });

  it('throws on empty or malformed input', () => {
    expect(() => deriveHost('')).toThrow(/empty|invalid/i);
    expect(() => deriveHost('   ')).toThrow(/empty|invalid/i);
  });
});

describe('deriveRepoKey', () => {
  it('joins host and project path', () => {
    expect(deriveRepoKey('gitlab.com', 'myorg/api')).toBe('gitlab.com/myorg/api');
  });

  it('preserves subgroup paths verbatim', () => {
    expect(deriveRepoKey('gitlab.com', 'group/sub/project')).toBe('gitlab.com/group/sub/project');
  });

  it('strips leading and trailing slashes from path', () => {
    expect(deriveRepoKey('gitlab.com', '/myorg/api')).toBe('gitlab.com/myorg/api');
    expect(deriveRepoKey('gitlab.com', 'myorg/api/')).toBe('gitlab.com/myorg/api');
    expect(deriveRepoKey('gitlab.com', '/myorg/api/')).toBe('gitlab.com/myorg/api');
  });

  it('lowercases both host and path', () => {
    expect(deriveRepoKey('GitLab.COM', 'MyOrg/Api')).toBe('gitlab.com/myorg/api');
  });

  it('throws on empty path', () => {
    expect(() => deriveRepoKey('gitlab.com', '')).toThrow(/empty/i);
    expect(() => deriveRepoKey('gitlab.com', '   ')).toThrow(/empty/i);
  });
});

import { writeTokenToCredentials } from '../../src/cli/auth.js';

describe('writeTokenToCredentials', () => {
  beforeEach(() => {
    vi.mocked(writeFile).mockClear();
    vi.mocked(mkdir).mockClear();
  });

  it('creates a new credentials file with the given key/value', async () => {
    vi.mocked(readFile).mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

    await writeTokenToCredentials('gitlab.com', 'glpat-new');

    expect(mkdir).toHaveBeenCalled();
    const writeCall = vi.mocked(writeFile).mock.calls[0];
    expect(writeCall[0]).toMatch(/credentials\.yml$/);
    expect(writeCall[1]).toContain('gitlab.com: glpat-new');
    expect(writeCall[2]).toEqual({ mode: 0o600 });
  });

  it('preserves all existing top-level entries', async () => {
    vi.mocked(readFile).mockResolvedValue(
      'gitlab: glpat-legacy\n' +
      'github.com: ghp_other\n' +
      'pro:\n  token: jwt-here\n  expiresAt: 2026-12-31\n' as any,
    );

    await writeTokenToCredentials('gitlab.com', 'glpat-new');

    const written = vi.mocked(writeFile).mock.calls[0][1] as string;
    expect(written).toContain('gitlab: glpat-legacy');
    expect(written).toContain('github.com: ghp_other');
    expect(written).toContain('pro:');
    expect(written).toContain('token: jwt-here');
    expect(written).toContain('gitlab.com: glpat-new');
  });

  it('overwrites an existing key in place', async () => {
    vi.mocked(readFile).mockResolvedValue('gitlab.com: glpat-old\n' as any);

    await writeTokenToCredentials('gitlab.com', 'glpat-new');

    const written = vi.mocked(writeFile).mock.calls[0][1] as string;
    expect(written).toContain('gitlab.com: glpat-new');
    expect(written).not.toContain('glpat-old');
  });

  it('lowercases the key before writing', async () => {
    vi.mocked(readFile).mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

    await writeTokenToCredentials('GitLab.COM', 'glpat-new');

    const written = vi.mocked(writeFile).mock.calls[0][1] as string;
    expect(written).toContain('gitlab.com: glpat-new');
    expect(written).not.toContain('GitLab.COM');
  });
});
