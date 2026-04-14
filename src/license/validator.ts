import { importSPKI, jwtVerify, errors } from 'jose';
import type { LicenseStatus, LicensePayload } from './types.js';

// Development public key — replace with production key when license server is deployed.
// Generated from: tests/fixtures/license/dev-public.pem
const DEV_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA1mURBXgVGqrF3dnrf/Rw
PdzQHX/2HTBxDOkm+qowMQA74Cg4c5dUrukiXd4yksx+Zqqy3ZXErf8aBvt4HZQ1
zV8d6fynMn7lenWFFAqywFsp9SfXEKdbEIJ8YerlI7OzKSrNoGlpmymbfobYyySs
xcyofe8fPITr5spPNRDQJ0EFfly1sMBUgyJJkDSEQZ0j2RTUx7YdKmRfUgrtoYHx
JrAHmGHhJUhPJh2IcNMQkkQBz3VvD0QuJlMsJTg++EefeFPNllflT9k1ZdxtER9v
YVk+B1jqj8ehsSKGL+Q+OI6s0PppjsECXP0rJC+51zZvQ6OfwfUj97SjdzsxlFjr
IwIDAQAB
-----END PUBLIC KEY-----
`;

export async function verifyLicense(
  token: string,
  publicKeyPem: string = DEV_PUBLIC_KEY,
): Promise<LicenseStatus> {
  try {
    const publicKey = await importSPKI(publicKeyPem, 'RS256');
    const { payload } = await jwtVerify(token, publicKey);

    return {
      valid: true,
      payload: {
        sub: payload.sub as string,
        email: (payload as Record<string, unknown>).email as string,
        plan: (payload as Record<string, unknown>).plan as string,
        features: (payload as Record<string, unknown>).features as string[],
        iat: payload.iat as number,
        exp: payload.exp as number,
      },
    };
  } catch (err) {
    if (err instanceof errors.JWTExpired) {
      return { valid: false, reason: 'expired' };
    }
    return { valid: false, reason: 'invalid-key' };
  }
}
