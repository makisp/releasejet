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

  // Step 1
  it('returns RELEASEJET_TOKEN ahead of provider env and file', async () => {
    process.env.RELEASEJET_TOKEN = 'universal';
    process.env.GITHUB_TOKEN = 'gh-env';
    vi.mocked(readFile).mockResolvedValue('github.com: ghp_file\n' as any);
    expect(await resolveToken('github', GH, PATH)).toBe('universal');
  });

  // Step 2
  it('returns provider env when RELEASEJET_TOKEN is absent', async () => {
    process.env.GITHUB_TOKEN = 'gh-env';
    vi.mocked(readFile).mockResolvedValue('github.com: ghp_file\n' as any);
    expect(await resolveToken('github', GH, PATH)).toBe('gh-env');
  });

  it('returns GITLAB_API_TOKEN for gitlab provider', async () => {
    process.env.GITLAB_API_TOKEN = 'gl-env';
    expect(await resolveToken('gitlab', GL, PATH)).toBe('gl-env');
  });

  // Step 3 vs Step 4
  it('repo key wins over host key', async () => {
    vi.mocked(readFile).mockImplementation(async (p: any) => {
      if (String(p).endsWith('credentials.yml')) {
        return 'gitlab.com: host-token\ngitlab.com/myorg/api: repo-token\n' as any;
      }
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });
    expect(await resolveToken('gitlab', GL, PATH)).toBe('repo-token');
  });

  // Step 4 vs Step 5
  it('host key wins over legacy provider-type key', async () => {
    vi.mocked(readFile).mockImplementation(async (p: any) => {
      if (String(p).endsWith('credentials.yml')) {
        return 'gitlab: legacy-token\ngitlab.com: host-token\n' as any;
      }
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });
    expect(await resolveToken('gitlab', GL, PATH)).toBe('host-token');
  });

  // Step 5 — wildcard fallback
  it('legacy key resolves any host without an explicit host entry', async () => {
    vi.mocked(readFile).mockImplementation(async (p: any) => {
      if (String(p).endsWith('credentials.yml')) {
        return 'gitlab: legacy-wildcard\n' as any;
      }
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });
    expect(await resolveToken('gitlab', GL, PATH)).toBe('legacy-wildcard');
    expect(await resolveToken('gitlab', 'https://company.gitlab.com', 'team/repo')).toBe('legacy-wildcard');
  });

  // Step 5 — does NOT fire when host key matches
  it('legacy key does not fire for hosts that have an explicit host entry', async () => {
    vi.mocked(readFile).mockImplementation(async (p: any) => {
      if (String(p).endsWith('credentials.yml')) {
        return 'gitlab: legacy-old\ngitlab.com: gl-com-new\n' as any;
      }
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });
    expect(await resolveToken('gitlab', GL, PATH)).toBe('gl-com-new');
  });

  // Step 5 — wildcard still fires for a third host when a different host has an explicit entry
  it('legacy key fires for a third host even when another host has an explicit entry', async () => {
    vi.mocked(readFile).mockImplementation(async (p: any) => {
      if (String(p).endsWith('credentials.yml')) {
        return 'gitlab: legacy-wildcard\ngitlab.com: gl-com-token\n' as any;
      }
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });
    expect(await resolveToken('gitlab', 'https://company.gitlab.com', 'team/repo'))
      .toBe('legacy-wildcard');
  });

  // Step 6 — bare-text legacy file
  it('falls back to bare-text legacy credentials file when YAML is absent', async () => {
    vi.mocked(readFile).mockImplementation(async (p: any) => {
      const path = String(p);
      if (path.endsWith('credentials.yml')) {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      }
      if (path.endsWith('credentials')) return 'bare-text-token\n' as any;
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });
    expect(await resolveToken('gitlab', GL, PATH)).toBe('bare-text-token');
  });

  // Casing
  it('matches host key case-insensitively', async () => {
    vi.mocked(readFile).mockResolvedValue('gitlab.com: gl-token\n' as any);
    expect(await resolveToken('gitlab', 'https://GITLAB.COM/', PATH)).toBe('gl-token');
  });

  // Default-port stripping
  it('strips default ports when matching host key', async () => {
    vi.mocked(readFile).mockResolvedValue('gitlab.com: gl-token\n' as any);
    expect(await resolveToken('gitlab', 'https://gitlab.com:443/', PATH)).toBe('gl-token');
  });

  // Error message
  it('throws an error listing every key that was tried', async () => {
    vi.mocked(readFile).mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    await expect(resolveToken('github', GH, PATH)).rejects.toThrow(/github\.com\/myorg\/api/);
    await expect(resolveToken('github', GH, PATH)).rejects.toThrow(/github\.com/);
    await expect(resolveToken('github', GH, PATH)).rejects.toThrow(/github \(legacy\)/);
    await expect(resolveToken('github', GH, PATH)).rejects.toThrow(/RELEASEJET_TOKEN/);
    await expect(resolveToken('github', GH, PATH)).rejects.toThrow(/auth set-token/);
  });

  it('skips repo key when projectPath is empty', async () => {
    vi.mocked(readFile).mockImplementation(async (p: any) => {
      if (String(p).endsWith('credentials.yml')) {
        return 'gitlab.com: host-token\n' as any;
      }
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });
    expect(await resolveToken('gitlab', GL, '')).toBe('host-token');
  });

  it('error message uses placeholder when projectPath is empty', async () => {
    vi.mocked(readFile).mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    await expect(resolveToken('github', GH, '')).rejects.toThrow(/github\.com\/<projectPath>/);
  });

  it('throws a clear error when credentials.yml exists but is unreadable', async () => {
    vi.mocked(readFile).mockImplementation(async (p: any) => {
      if (String(p).endsWith('credentials.yml')) {
        throw Object.assign(new Error('permission denied'), { code: 'EACCES' });
      }
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });
    await expect(resolveToken('gitlab', GL, PATH)).rejects.toThrow(/Could not read credentials/);
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

  it('refuses to overwrite when credentials.yml exists but is unreadable (non-ENOENT)', async () => {
    vi.mocked(readFile).mockRejectedValue(
      Object.assign(new Error('permission denied'), { code: 'EACCES' }),
    );

    await expect(writeTokenToCredentials('gitlab.com', 'glpat-new')).rejects.toThrow(
      /Refusing to overwrite|data loss/,
    );
    expect(writeFile).not.toHaveBeenCalled();
  });
});
