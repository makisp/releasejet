import { describe, it, expect } from 'vitest';
import { deriveProjectName } from '../../src/core/project-name.js';

describe('deriveProjectName', () => {
  it('returns the repo slug for a GitHub URL', () => {
    expect(deriveProjectName('https://github.com/acme/Test-Project')).toBe('Test-Project');
  });

  it('strips a trailing .git suffix', () => {
    expect(deriveProjectName('https://gitlab.com/group/repo.git')).toBe('repo');
  });

  it('strips a single trailing slash', () => {
    expect(deriveProjectName('https://github.com/acme/Test-Project/')).toBe('Test-Project');
  });

  it('uses the last segment for nested GitLab groups', () => {
    expect(deriveProjectName('https://gitlab.com/group/sub/repo')).toBe('repo');
  });

  it('returns undefined for an empty string', () => {
    expect(deriveProjectName('')).toBeUndefined();
  });

  it('returns undefined when there is no path', () => {
    expect(deriveProjectName('https://github.com')).toBeUndefined();
    expect(deriveProjectName('https://github.com/')).toBeUndefined();
  });

  it('returns undefined for an unparseable value', () => {
    expect(deriveProjectName('not a url')).toBeUndefined();
  });

  it('preserves punctuation and case inside the slug', () => {
    expect(deriveProjectName('https://github.com/acme/My.Cool_Repo-1')).toBe('My.Cool_Repo-1');
  });

  it('handles URLs with query strings and fragments', () => {
    expect(deriveProjectName('https://github.com/acme/repo?x=1#frag')).toBe('repo');
  });
});
