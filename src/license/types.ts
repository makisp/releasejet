export interface LicenseCredentials {
  key: string;
  token: string;
  expiresAt: string;
}

export interface LicensePayload {
  sub: string;
  email: string;
  plan: string;
  features: string[];
  iat: number;
  exp: number;
}

export type LicenseStatus =
  | { valid: true; payload: LicensePayload }
  | { valid: false; reason: 'not-activated' | 'invalid-key' | 'expired' };
