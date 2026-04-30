import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { stringify as stringifyYaml, parse as parseYaml } from 'yaml';

const DEFAULT_PORTS: Record<string, string> = { 'http:': '80', 'https:': '443' };

export function deriveHost(hostUrl: string): string {
  const trimmed = (hostUrl ?? '').trim();
  if (!trimmed) {
    throw new Error(`Cannot derive host from empty value: "${hostUrl}"`);
  }

  // Try as URL first; fall back to bare-hostname interpretation.
  let hostname: string;
  let port: string;
  try {
    const withScheme = /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const parsed = new URL(withScheme);
    hostname = parsed.hostname;
    port = parsed.port;
    // Strip default ports for the protocol when explicitly present.
    if (port && DEFAULT_PORTS[parsed.protocol] === port) {
      port = '';
    }
  } catch {
    throw new Error(`Cannot derive host from invalid value: "${hostUrl}"`);
  }

  if (!hostname) {
    throw new Error(`Cannot derive host from invalid value: "${hostUrl}"`);
  }

  const result = port ? `${hostname}:${port}` : hostname;
  return result.toLowerCase();
}

export function deriveRepoKey(host: string, projectPath: string): string {
  const path = (projectPath ?? '').trim().replace(/^\/+|\/+$/g, '');
  if (!path) {
    throw new Error(`Cannot derive repo key from empty project path`);
  }
  return `${host}/${path}`.toLowerCase();
}

export async function writeTokenToCredentials(key: string, token: string): Promise<void> {
  const credDir = join(homedir(), '.releasejet');
  await mkdir(credDir, { recursive: true });
  const credPath = join(credDir, 'credentials.yml');

  let existing: Record<string, unknown> = {};
  try {
    const content = await readFile(credPath, 'utf-8');
    const parsed = parseYaml(content);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      existing = parsed as Record<string, unknown>;
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw new Error(
        `Could not read existing credentials at ${credPath}: ${(err as Error).message}. ` +
          `Refusing to overwrite to avoid data loss. Fix or remove the file and try again.`,
      );
    }
    // ENOENT — file does not exist, start fresh.
  }

  existing[key.toLowerCase()] = token;
  await writeFile(credPath, stringifyYaml(existing), { mode: 0o600 });
}

export async function resolveToken(
  providerType: 'gitlab' | 'github',
  hostUrl: string,
  projectPath: string,
): Promise<string> {
  // 1. Universal env var
  if (process.env.RELEASEJET_TOKEN) return process.env.RELEASEJET_TOKEN;

  // 2. Provider-specific env var
  const providerEnvVar = providerType === 'github' ? 'GITHUB_TOKEN' : 'GITLAB_API_TOKEN';
  const providerEnvValue = process.env[providerEnvVar];
  if (providerEnvValue) return providerEnvValue;

  const host = deriveHost(hostUrl);
  const repoKey = projectPath ? deriveRepoKey(host, projectPath) : null;
  const credPath = join(homedir(), '.releasejet', 'credentials.yml');

  // 3-5. credentials.yml lookups
  let yamlEntries: Record<string, unknown> | null = null;
  try {
    const content = await readFile(credPath, 'utf-8');
    const parsed = parseYaml(content);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      yamlEntries = parsed as Record<string, unknown>;
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw new Error(
        `Could not read credentials at ${credPath}: ${(err as Error).message}. ` +
        `Fix or remove the file and try again.`,
      );
    }
    // ENOENT — file does not exist, try legacy bare-text below.
  }

  if (yamlEntries) {
    // 3. Repo key
    if (repoKey) {
      const repoVal = yamlEntries[repoKey];
      if (typeof repoVal === 'string' && repoVal.length > 0) return repoVal;
    }

    // 4. Host key
    const hostVal = yamlEntries[host];
    if (typeof hostVal === 'string' && hostVal.length > 0) return hostVal;

    // 5. Legacy provider-type key — only when no host key matched
    const legacyVal = yamlEntries[providerType];
    if (typeof legacyVal === 'string' && legacyVal.length > 0) return legacyVal;
  }

  // 6. Bare-text legacy file
  try {
    const legacyPath = join(homedir(), '.releasejet', 'credentials');
    const stored = (await readFile(legacyPath, 'utf-8')).trim();
    if (stored) return stored;
  } catch {
    // Not present — fall through to error.
  }

  // TODO(F13): tokens migrate command — guide users to host-keyed entries.
  const providerName = providerType === 'github' ? 'GitHub' : 'GitLab';
  const providerEnvName = providerType === 'github' ? 'GITHUB_TOKEN' : 'GITLAB_API_TOKEN';
  const repoKeyDisplay = repoKey ?? `${host}/<projectPath>`;
  throw new Error(
    `${providerName} API token not found for ${repoKey ?? host}.\n` +
      `Tried (in order):\n` +
      `  - env: RELEASEJET_TOKEN, ${providerEnvName}\n` +
      `  - ~/.releasejet/credentials.yml: ${repoKeyDisplay}, ${host}, ${providerType} (legacy)\n` +
      `  - ~/.releasejet/credentials (legacy file)\n` +
      `\n` +
      `To configure, run one of:\n` +
      `  releasejet auth set-token              # default — token for this repo's host\n` +
      `  releasejet auth set-token --repo <path> # token for this repo specifically`,
  );
}
