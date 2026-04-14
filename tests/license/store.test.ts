import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { readLicense, writeLicense, removeLicense } from '../../src/license/store.js';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(mkdir).mockResolvedValue(undefined);
  vi.mocked(writeFile).mockResolvedValue(undefined);
});

describe('readLicense', () => {
  it('returns license credentials when present', async () => {
    vi.mocked(readFile).mockResolvedValue(
      'github: ghp_abc\nlicense:\n  key: rlj_abc123\n  token: eyJhbG\n  expiresAt: "2026-05-13"\n',
    );

    const result = await readLicense();

    expect(result).toEqual({
      key: 'rlj_abc123',
      token: 'eyJhbG',
      expiresAt: '2026-05-13',
    });
  });

  it('returns null when no license block exists', async () => {
    vi.mocked(readFile).mockResolvedValue('github: ghp_abc\n');

    const result = await readLicense();

    expect(result).toBeNull();
  });

  it('returns null when credentials file does not exist', async () => {
    vi.mocked(readFile).mockRejectedValue(
      Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
    );

    const result = await readLicense();

    expect(result).toBeNull();
  });

  it('returns null when license block is incomplete', async () => {
    vi.mocked(readFile).mockResolvedValue('license:\n  key: rlj_abc123\n');

    const result = await readLicense();

    expect(result).toBeNull();
  });
});

describe('writeLicense', () => {
  it('writes license block preserving existing provider tokens', async () => {
    vi.mocked(readFile).mockResolvedValue('github: ghp_abc\n');

    await writeLicense({
      key: 'rlj_abc123',
      token: 'eyJhbG',
      expiresAt: '2026-05-13',
    });

    expect(writeFile).toHaveBeenCalledWith(
      expect.stringContaining('credentials.yml'),
      expect.stringContaining('github: ghp_abc'),
      'utf-8',
    );
    const written = vi.mocked(writeFile).mock.calls[0][1] as string;
    expect(written).toContain('rlj_abc123');
    expect(written).toContain('eyJhbG');
    expect(written).toContain('2026-05-13');
  });

  it('creates directory if it does not exist', async () => {
    vi.mocked(readFile).mockRejectedValue(
      Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
    );

    await writeLicense({
      key: 'rlj_abc123',
      token: 'eyJhbG',
      expiresAt: '2026-05-13',
    });

    expect(mkdir).toHaveBeenCalledWith(expect.stringContaining('.releasejet'), { recursive: true });
  });
});

describe('removeLicense', () => {
  it('removes license block preserving other data', async () => {
    vi.mocked(readFile).mockResolvedValue(
      'github: ghp_abc\nlicense:\n  key: rlj_abc123\n  token: eyJhbG\n  expiresAt: "2026-05-13"\n',
    );

    await removeLicense();

    const written = vi.mocked(writeFile).mock.calls[0][1] as string;
    expect(written).toContain('github: ghp_abc');
    expect(written).not.toContain('license');
    expect(written).not.toContain('rlj_abc123');
  });

  it('does nothing when credentials file does not exist', async () => {
    vi.mocked(readFile).mockRejectedValue(
      Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
    );

    await removeLicense();

    expect(writeFile).not.toHaveBeenCalled();
  });
});
