import type { ReleaseJetConfig } from '../types.js';
import type { ProviderClient } from './types.js';
import { createGitLabClient } from '../gitlab/client.js';
import { createGitHubClient } from '../github/client.js';

export function createClient(config: ReleaseJetConfig, token: string): ProviderClient {
  if (config.provider.type === 'github') {
    return createGitHubClient(config.provider.url, token);
  }
  return createGitLabClient(config.provider.url, token);
}
