import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { LicenseCredentials } from './types.js';

function credentialsPath(): string {
  return join(homedir(), '.releasejet', 'credentials.yml');
}

export async function readLicense(): Promise<LicenseCredentials | null> {
  try {
    const content = await readFile(credentialsPath(), 'utf-8');
    const creds = parseYaml(content) as Record<string, unknown>;
    const license = creds?.license as Record<string, string> | undefined;
    if (!license?.key || !license?.token || !license?.expiresAt) return null;
    return {
      key: license.key,
      token: license.token,
      expiresAt: license.expiresAt,
    };
  } catch {
    return null;
  }
}

export async function writeLicense(license: LicenseCredentials): Promise<void> {
  const path = credentialsPath();
  let existing: Record<string, unknown> = {};
  try {
    const content = await readFile(path, 'utf-8');
    existing = (parseYaml(content) as Record<string, unknown>) ?? {};
  } catch {
    // File doesn't exist yet
  }
  existing.license = {
    key: license.key,
    token: license.token,
    expiresAt: license.expiresAt,
  };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, stringifyYaml(existing), 'utf-8');
}

export async function removeLicense(): Promise<void> {
  const path = credentialsPath();
  try {
    const content = await readFile(path, 'utf-8');
    const existing = (parseYaml(content) as Record<string, unknown>) ?? {};
    delete existing.license;
    await writeFile(path, stringifyYaml(existing), 'utf-8');
  } catch {
    // File doesn't exist, nothing to remove
  }
}
