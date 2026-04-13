import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { importPKCS8, SignJWT } from 'jose';
import { verifyLicense } from '../../src/license/validator.js';

const TEST_PRIVATE_KEY = readFileSync(
  join(import.meta.dirname, '../fixtures/license/dev-private.pem'),
  'utf-8',
);
const TEST_PUBLIC_KEY = readFileSync(
  join(import.meta.dirname, '../fixtures/license/dev-public.pem'),
  'utf-8',
);

async function signTestJwt(
  claims: Record<string, unknown>,
  options?: { expiresIn?: string },
): Promise<string> {
  const privateKey = await importPKCS8(TEST_PRIVATE_KEY, 'RS256');
  let builder = new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuedAt();
  if (options?.expiresIn) {
    builder = builder.setExpirationTime(options.expiresIn);
  }
  return builder.sign(privateKey);
}

describe('verifyLicense', () => {
  it('returns valid status for a correctly signed, non-expired JWT', async () => {
    const token = await signTestJwt(
      {
        sub: 'org_abc123',
        email: 'user@example.com',
        plan: 'pro',
        features: ['templates'],
      },
      { expiresIn: '30d' },
    );

    const result = await verifyLicense(token, TEST_PUBLIC_KEY);

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.payload.sub).toBe('org_abc123');
      expect(result.payload.email).toBe('user@example.com');
      expect(result.payload.plan).toBe('pro');
      expect(result.payload.features).toEqual(['templates']);
    }
  });

  it('returns expired status for an expired JWT', async () => {
    const token = await signTestJwt(
      {
        sub: 'org_abc123',
        email: 'user@example.com',
        plan: 'pro',
        features: ['templates'],
      },
      { expiresIn: '0s' },
    );

    // Wait for the token to expire
    await new Promise((r) => setTimeout(r, 1100));

    const result = await verifyLicense(token, TEST_PUBLIC_KEY);

    expect(result).toEqual({ valid: false, reason: 'expired' });
  });

  it('returns invalid-key for a JWT signed with a different key', async () => {
    const crypto = await import('node:crypto');
    const { privateKey: otherPrivate } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    const otherKey = await importPKCS8(otherPrivate, 'RS256');
    const token = await new SignJWT({
      sub: 'org_abc123',
      email: 'user@example.com',
      plan: 'pro',
      features: ['templates'],
    })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuedAt()
      .setExpirationTime('30d')
      .sign(otherKey);

    const result = await verifyLicense(token, TEST_PUBLIC_KEY);

    expect(result).toEqual({ valid: false, reason: 'invalid-key' });
  });

  it('returns invalid-key for a malformed token', async () => {
    const result = await verifyLicense('not.a.jwt', TEST_PUBLIC_KEY);
    expect(result).toEqual({ valid: false, reason: 'invalid-key' });
  });

  it('returns invalid-key for an empty string', async () => {
    const result = await verifyLicense('', TEST_PUBLIC_KEY);
    expect(result).toEqual({ valid: false, reason: 'invalid-key' });
  });
});
