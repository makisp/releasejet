import { execSync } from 'node:child_process';

export function getRemoteUrl(): string {
  return execSync('git remote get-url origin', { encoding: 'utf-8' }).trim();
}

export function resolveHostUrl(remoteUrl: string): string {
  const sshMatch = remoteUrl.match(/^git@([^:]+):/);
  if (sshMatch) return `https://${sshMatch[1]}`;

  const httpsMatch = remoteUrl.match(/^(https?:\/\/[^/]+)/);
  if (httpsMatch) return httpsMatch[1];

  throw new Error(`Cannot parse host URL from remote: ${remoteUrl}`);
}

export function resolveProjectInfo(remoteUrl: string): { hostUrl: string; projectPath: string } {
  // GitHub Actions
  if (process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY) {
    return {
      hostUrl: process.env.GITHUB_SERVER_URL,
      projectPath: process.env.GITHUB_REPOSITORY,
    };
  }
  // GitLab CI
  if (process.env.CI_SERVER_URL && process.env.CI_PROJECT_PATH) {
    return {
      hostUrl: process.env.CI_SERVER_URL,
      projectPath: process.env.CI_PROJECT_PATH,
    };
  }
  // Fallback: parse git remote
  return {
    hostUrl: resolveHostUrl(remoteUrl),
    projectPath: resolveProjectPath(remoteUrl),
  };
}

export function resolveProjectPath(remoteUrl: string): string {
  const sshMatch = remoteUrl.match(/^git@[^:]+:(.+?)(?:\.git)?$/);
  if (sshMatch) return sshMatch[1];

  const httpsMatch = remoteUrl.match(/^https?:\/\/[^/]+\/(.+?)(?:\.git)?$/);
  if (httpsMatch) return httpsMatch[1];

  throw new Error(`Cannot parse project path from remote: ${remoteUrl}`);
}

export function detectProviderFromRemote(remoteUrl: string): 'gitlab' | 'github' {
  return remoteUrl.includes('github.com') ? 'github' : 'gitlab';
}
