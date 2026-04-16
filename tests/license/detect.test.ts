import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/license/store.js', () => ({
  readLicense: vi.fn(),
}));

vi.mock('../../src/license/validator.js', () => ({
  verifyLicense: vi.fn(),
}));

import { readLicense } from '../../src/license/store.js';
import { verifyLicense } from '../../src/license/validator.js';
import { hasActivePro } from '../../src/license/detect.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('hasActivePro', () => {
  it('returns true when license is valid', async () => {
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

    expect(await hasActivePro()).toBe(true);
  });

  it('returns false when no license is stored', async () => {
    vi.mocked(readLicense).mockResolvedValue(null);

    expect(await hasActivePro()).toBe(false);
    expect(verifyLicense).not.toHaveBeenCalled();
  });

  it('returns false when license is expired', async () => {
    vi.mocked(readLicense).mockResolvedValue({
      key: 'rlj_abc',
      token: 'expired.jwt',
      expiresAt: '2026-01-01',
    });
    vi.mocked(verifyLicense).mockResolvedValue({ valid: false, reason: 'expired' });

    expect(await hasActivePro()).toBe(false);
  });

  it('returns false when license is invalid', async () => {
    vi.mocked(readLicense).mockResolvedValue({
      key: 'rlj_abc',
      token: 'bad.jwt',
      expiresAt: '2026-05-13',
    });
    vi.mocked(verifyLicense).mockResolvedValue({ valid: false, reason: 'invalid_signature' });

    expect(await hasActivePro()).toBe(false);
  });
});
