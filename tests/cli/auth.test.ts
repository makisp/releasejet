import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

import { readFile } from 'node:fs/promises';
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
