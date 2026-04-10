import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

export async function resolveToken(providerType: 'gitlab' | 'github'): Promise<string> {
  // 1. Universal env var
  const envToken = process.env.RELEASEJET_TOKEN;
  if (envToken) return envToken;

  // 2. Provider-specific env var
  const providerEnvVar = providerType === 'github' ? 'GITHUB_TOKEN' : 'GITLAB_API_TOKEN';
  const providerToken = process.env[providerEnvVar];
  if (providerToken) return providerToken;

  // 3. Provider-keyed credentials file
  try {
    const credPath = join(homedir(), '.releasejet', 'credentials.yml');
    const content = (await readFile(credPath, 'utf-8')).trim();
    const creds = parseYaml(content) as Record<string, string>;
    if (creds?.[providerType]) return creds[providerType];
  } catch {
    // credentials.yml not found, try legacy
  }

  // 4. Legacy bare credentials file (backward compat)
  try {
    const legacyPath = join(homedir(), '.releasejet', 'credentials');
    const stored = (await readFile(legacyPath, 'utf-8')).trim();
    if (stored) return stored;
  } catch {
    // No stored credentials
  }

  const providerName = providerType === 'github' ? 'GitHub' : 'GitLab';
  throw new Error(
    `${providerName} API token not found. Set RELEASEJET_TOKEN environment variable or run \`releasejet init\`.`,
  );
}
