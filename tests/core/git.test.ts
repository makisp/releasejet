import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveHostUrl, resolveProjectPath, resolveProjectInfo, detectProviderFromRemote } from '../../src/core/git.js';

describe('resolveHostUrl', () => {
  it('extracts URL from SSH remote', () => {
    expect(resolveHostUrl('git@gitlab.example.com:mobile/app.git'))
      .toBe('https://gitlab.example.com');
  });

  it('extracts URL from HTTPS remote', () => {
    expect(resolveHostUrl('https://gitlab.example.com/mobile/app.git'))
      .toBe('https://gitlab.example.com');
  });

  it('works with GitHub SSH remote', () => {
    expect(resolveHostUrl('git@github.com:owner/repo.git'))
      .toBe('https://github.com');
  });

  it('works with GitHub HTTPS remote', () => {
    expect(resolveHostUrl('https://github.com/owner/repo.git'))
      .toBe('https://github.com');
  });

  it('throws on unrecognized remote format', () => {
    expect(() => resolveHostUrl('not-a-url')).toThrow('Cannot parse');
  });
});

describe('resolveProjectPath', () => {
  it('extracts path from SSH remote', () => {
    expect(resolveProjectPath('git@gitlab.example.com:mobile/android-app.git'))
      .toBe('mobile/android-app');
  });

  it('extracts path from HTTPS remote', () => {
    expect(resolveProjectPath('https://gitlab.example.com/mobile/android-app.git'))
      .toBe('mobile/android-app');
  });

  it('handles nested groups', () => {
    expect(resolveProjectPath('git@gitlab.example.com:group/subgroup/project.git'))
      .toBe('group/subgroup/project');
  });

  it('handles remote without .git suffix', () => {
    expect(resolveProjectPath('git@gitlab.example.com:mobile/app'))
      .toBe('mobile/app');
  });

  it('extracts path from GitHub remote', () => {
    expect(resolveProjectPath('git@github.com:owner/repo.git'))
      .toBe('owner/repo');
  });

  it('throws on unrecognized remote format', () => {
    expect(() => resolveProjectPath('not-a-url')).toThrow('Cannot parse');
  });
});

describe('resolveProjectInfo', () => {
  afterEach(() => {
    delete process.env.CI_SERVER_URL;
    delete process.env.CI_PROJECT_PATH;
    delete process.env.GITHUB_SERVER_URL;
    delete process.env.GITHUB_REPOSITORY;
  });

  it('uses GitLab CI environment variables when available', () => {
    process.env.CI_SERVER_URL = 'https://gitlab.example.com';
    process.env.CI_PROJECT_PATH = 'mpapas/test-project';

    const info = resolveProjectInfo('');
    expect(info).toEqual({
      hostUrl: 'https://gitlab.example.com',
      projectPath: 'mpapas/test-project',
    });
  });

  it('uses GitHub Actions environment variables when available', () => {
    process.env.GITHUB_SERVER_URL = 'https://github.com';
    process.env.GITHUB_REPOSITORY = 'owner/repo';

    const info = resolveProjectInfo('');
    expect(info).toEqual({
      hostUrl: 'https://github.com',
      projectPath: 'owner/repo',
    });
  });

  it('falls back to git remote when CI vars are missing', () => {
    const info = resolveProjectInfo('git@gitlab.example.com:mobile/app.git');
    expect(info).toEqual({
      hostUrl: 'https://gitlab.example.com',
      projectPath: 'mobile/app',
    });
  });

  it('prefers GitHub Actions vars over git remote', () => {
    process.env.GITHUB_SERVER_URL = 'https://github.com';
    process.env.GITHUB_REPOSITORY = 'ci/project';

    const info = resolveProjectInfo('git@gitlab.example.com:mobile/app.git');
    expect(info).toEqual({
      hostUrl: 'https://github.com',
      projectPath: 'ci/project',
    });
  });
});

describe('detectProviderFromRemote', () => {
  it('detects GitHub from github.com remote', () => {
    expect(detectProviderFromRemote('git@github.com:owner/repo.git')).toBe('github');
  });

  it('detects GitHub from HTTPS github.com remote', () => {
    expect(detectProviderFromRemote('https://github.com/owner/repo.git')).toBe('github');
  });

  it('defaults to GitLab for non-GitHub remotes', () => {
    expect(detectProviderFromRemote('git@gitlab.example.com:mobile/app.git')).toBe('gitlab');
  });

  it('defaults to GitLab for unrecognized remotes', () => {
    expect(detectProviderFromRemote('some-other-remote')).toBe('gitlab');
  });
});
