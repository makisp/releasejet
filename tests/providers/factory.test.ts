import { describe, it, expect, vi } from 'vitest';
import type { ReleaseJetConfig } from '../../src/types.js';

vi.mock('../../src/gitlab/client.js', () => ({
  createGitLabClient: vi.fn().mockReturnValue({ type: 'gitlab-mock' }),
}));
vi.mock('../../src/github/client.js', () => ({
  createGitHubClient: vi.fn().mockReturnValue({ type: 'github-mock' }),
}));

import { createClient } from '../../src/providers/factory.js';
import { createGitLabClient } from '../../src/gitlab/client.js';
import { createGitHubClient } from '../../src/github/client.js';

describe('createClient', () => {
  it('creates GitLab client when provider type is gitlab', () => {
    const config = {
      provider: { type: 'gitlab' as const, url: 'https://gitlab.example.com' },
    } as ReleaseJetConfig;

    createClient(config, 'test-token');

    expect(createGitLabClient).toHaveBeenCalledWith('https://gitlab.example.com', 'test-token');
  });

  it('creates GitHub client when provider type is github', () => {
    const config = {
      provider: { type: 'github' as const, url: 'https://github.com' },
    } as ReleaseJetConfig;

    createClient(config, 'test-token');

    expect(createGitHubClient).toHaveBeenCalledWith('https://github.com', 'test-token');
  });
});
