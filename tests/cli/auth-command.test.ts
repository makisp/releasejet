import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/license/store.js', () => ({
  readLicense: vi.fn(),
  writeLicense: vi.fn(),
  removeLicense: vi.fn(),
}));

vi.mock('../../src/license/validator.js', () => ({
  verifyLicense: vi.fn(),
}));

vi.mock('../../src/license/npmrc.js', () => ({
  isNpmrcConfigured: vi.fn(),
  writeNpmrcConfig: vi.fn(),
  removeNpmrcConfig: vi.fn(),
}));

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

import { readLicense, writeLicense, removeLicense } from '../../src/license/store.js';
import { verifyLicense } from '../../src/license/validator.js';
import { isNpmrcConfigured, writeNpmrcConfig, removeNpmrcConfig } from '../../src/license/npmrc.js';
import { runActivate, runStatus, runRefresh, runDeactivate } from '../../src/cli/commands/auth.js';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(writeLicense).mockResolvedValue(undefined);
  vi.mocked(removeLicense).mockResolvedValue(undefined);
  vi.mocked(writeNpmrcConfig).mockResolvedValue(undefined);
  vi.mocked(removeNpmrcConfig).mockResolvedValue(undefined);
  vi.mocked(isNpmrcConfigured).mockResolvedValue(false);
});

describe('runActivate', () => {
  it('rejects an invalid key format', async () => {
    await expect(runActivate('bad-key', { confirmNpmrc: async () => false })).rejects.toThrow('Invalid key format');
  });

  it('activates a valid key and stores credentials', async () => {
    const mockJwt = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJvcmdfYWJjIiwiZW1haWwiOiJ1QGUuY29tIiwicGxhbiI6InBybyIsImZlYXR1cmVzIjpbInRlbXBsYXRlcyJdLCJleHAiOjE3NDk3NzYwMDB9.sig';
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ token: mockJwt, expiresAt: '2026-06-13' }),
    });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runActivate('rlj_abcdefghijklmnopqrstuvwxyz012345', { confirmNpmrc: async () => false });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/license/activate'),
      expect.objectContaining({ method: 'POST' }),
    );
    expect(writeLicense).toHaveBeenCalledWith({
      key: 'rlj_abcdefghijklmnopqrstuvwxyz012345',
      token: mockJwt,
      expiresAt: '2026-06-13',
    });
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('activated'));
    logSpy.mockRestore();
  });

  it('throws on server rejection', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
    });

    await expect(
      runActivate('rlj_abcdefghijklmnopqrstuvwxyz012345', { confirmNpmrc: async () => false }),
    ).rejects.toThrow('Invalid license key');
  });

  it('throws on network error', async () => {
    fetchMock.mockRejectedValue(new Error('fetch failed'));

    await expect(
      runActivate('rlj_abcdefghijklmnopqrstuvwxyz012345', { confirmNpmrc: async () => false }),
    ).rejects.toThrow('Could not reach license server');
  });

  it('calls writeNpmrcConfig when user confirms', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'jwt', expiresAt: '2026-06-13' }),
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runActivate('rlj_abcdefghijklmnopqrstuvwxyz012345', { confirmNpmrc: async () => true });

    expect(writeNpmrcConfig).toHaveBeenCalledWith('rlj_abcdefghijklmnopqrstuvwxyz012345');
    logSpy.mockRestore();
  });

  it('prints instructions when user declines npmrc setup', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'jwt', expiresAt: '2026-06-13' }),
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runActivate('rlj_abcdefghijklmnopqrstuvwxyz012345', { confirmNpmrc: async () => false });

    expect(writeNpmrcConfig).not.toHaveBeenCalled();
    const output = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('npm.releasejet.dev');
    logSpy.mockRestore();
  });
});

describe('runStatus', () => {
  it('shows license details when valid', async () => {
    vi.mocked(readLicense).mockResolvedValue({
      key: 'rlj_abc',
      token: 'valid.jwt',
      expiresAt: '2026-05-13',
    });
    vi.mocked(verifyLicense).mockResolvedValue({
      valid: true,
      payload: {
        sub: 'org_abc',
        email: 'user@example.com',
        plan: 'pro',
        features: ['templates', 'notifications'],
        iat: 0,
        exp: 0,
      },
    });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runStatus();

    const output = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('pro');
    expect(output).toContain('user@example.com');
    expect(output).toContain('2026-05-13');
    logSpy.mockRestore();
  });

  it('reports expired license', async () => {
    vi.mocked(readLicense).mockResolvedValue({
      key: 'rlj_abc',
      token: 'expired.jwt',
      expiresAt: '2026-01-01',
    });
    vi.mocked(verifyLicense).mockResolvedValue({ valid: false, reason: 'expired' });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runStatus();

    const output = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('expired');
    logSpy.mockRestore();
  });

  it('reports no license found', async () => {
    vi.mocked(readLicense).mockResolvedValue(null);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runStatus();

    const output = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('No Pro license found');
    logSpy.mockRestore();
  });
});

describe('runRefresh', () => {
  it('refreshes and stores new token', async () => {
    vi.mocked(readLicense).mockResolvedValue({
      key: 'rlj_abc',
      token: 'old.jwt',
      expiresAt: '2026-05-13',
    });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'new.jwt', expiresAt: '2026-06-13' }),
    });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runRefresh();

    expect(writeLicense).toHaveBeenCalledWith({
      key: 'rlj_abc',
      token: 'new.jwt',
      expiresAt: '2026-06-13',
    });
    logSpy.mockRestore();
  });

  it('throws when no license is stored', async () => {
    vi.mocked(readLicense).mockResolvedValue(null);

    await expect(runRefresh()).rejects.toThrow('No license found');
  });

  it('throws when server rejects refresh', async () => {
    vi.mocked(readLicense).mockResolvedValue({
      key: 'rlj_abc',
      token: 'old.jwt',
      expiresAt: '2026-05-13',
    });
    fetchMock.mockResolvedValue({ ok: false, status: 403 });

    await expect(runRefresh()).rejects.toThrow('no longer active');
  });
});

describe('runDeactivate', () => {
  it('removes license and prints confirmation', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runDeactivate();

    expect(removeLicense).toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('removed'));
    logSpy.mockRestore();
  });

  it('removes npmrc config on deactivate', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runDeactivate();

    expect(removeNpmrcConfig).toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it('prints npmrc removal message only when npmrc was configured', async () => {
    vi.mocked(isNpmrcConfigured).mockResolvedValue(true);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runDeactivate();

    const output = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('npm registry config removed');
    logSpy.mockRestore();
  });

  it('does not print npmrc removal message when npmrc was not configured', async () => {
    vi.mocked(isNpmrcConfigured).mockResolvedValue(false);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runDeactivate();

    const output = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).not.toContain('npm registry config removed');
    logSpy.mockRestore();
  });
});

describe('runStatus — npm registry', () => {
  it('shows configured when npmrc has releasejet lines', async () => {
    vi.mocked(readLicense).mockResolvedValue({
      key: 'rlj_abc',
      token: 'valid.jwt',
      expiresAt: '2026-05-13',
    });
    vi.mocked(verifyLicense).mockResolvedValue({
      valid: true,
      payload: {
        sub: 'org_abc',
        email: 'user@example.com',
        plan: 'pro',
        features: ['templates'],
        iat: 0,
        exp: 0,
      },
    });
    vi.mocked(isNpmrcConfigured).mockResolvedValue(true);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runStatus();

    const output = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('npm registry');
    expect(output).toContain('configured');
    logSpy.mockRestore();
  });
});
