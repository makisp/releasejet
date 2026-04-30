import {
  deriveHost,
  deriveRepoKey,
  resolveTokenChain,
  writeEntry,
} from './credentials-store.js';

export { deriveHost, deriveRepoKey };

export async function writeTokenToCredentials(key: string, token: string): Promise<void> {
  await writeEntry(key, token);
}

export async function resolveToken(
  providerType: 'gitlab' | 'github',
  hostUrl: string,
  projectPath: string,
): Promise<string> {
  const chain = await resolveTokenChain(providerType, hostUrl, projectPath);
  const winner = chain.find((s) => s.status === 'hit');
  if (winner && winner.value) return winner.value;

  const providerName = providerType === 'github' ? 'GitHub' : 'GitLab';
  const providerEnvName = providerType === 'github' ? 'GITHUB_TOKEN' : 'GITLAB_API_TOKEN';
  const host = (() => {
    try { return deriveHost(hostUrl); } catch { return hostUrl; }
  })();
  const repoKey = projectPath ? `${host}/${projectPath.replace(/^\/+|\/+$/g, '')}`.toLowerCase() : null;
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
