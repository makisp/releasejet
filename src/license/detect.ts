import { readLicense } from './store.js';
import { verifyLicense } from './validator.js';

export async function hasActivePro(): Promise<boolean> {
  const license = await readLicense();
  if (!license) return false;
  const status = await verifyLicense(license.token);
  return status.valid;
}
