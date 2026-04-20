import { describe, it, expect } from 'vitest';
import { buildReleaseUrl } from '../../src/core/release-url.js';

describe('buildReleaseUrl', () => {
  it('constructs a GitHub release URL', () => {
    const url = buildReleaseUrl('github', 'https://github.com/acme/app', 'v1.2.0');
    expect(url).toBe('https://github.com/acme/app/releases/tag/v1.2.0');
  });

  it('constructs a GitLab release URL', () => {
    const url = buildReleaseUrl('gitlab', 'https://gitlab.example.com/acme/app', 'v1.2.0');
    expect(url).toBe('https://gitlab.example.com/acme/app/-/releases/v1.2.0');
  });

  it('URL-encodes GitLab tag names with special characters', () => {
    const url = buildReleaseUrl('gitlab', 'https://gitlab.example.com/acme/app', 'release/v1.2.0');
    expect(url).toBe('https://gitlab.example.com/acme/app/-/releases/release%2Fv1.2.0');
  });

  it('URL-encodes GitHub tag names with special characters', () => {
    const url = buildReleaseUrl('github', 'https://github.com/acme/app', 'release/v1.2.0');
    // GitHub actually accepts "/" in tag names in release-tag URLs, but encoding keeps us safe.
    expect(url).toBe('https://github.com/acme/app/releases/tag/release%2Fv1.2.0');
  });

  it('handles multi-client prefixed tags', () => {
    const url = buildReleaseUrl('github', 'https://github.com/acme/app', 'mobile-v2.1.0');
    expect(url).toBe('https://github.com/acme/app/releases/tag/mobile-v2.1.0');
  });

  it('does not add a trailing slash to projectUrl', () => {
    const url = buildReleaseUrl('github', 'https://github.com/acme/app/', 'v1.0.0');
    expect(url).toBe('https://github.com/acme/app/releases/tag/v1.0.0');
  });
});
