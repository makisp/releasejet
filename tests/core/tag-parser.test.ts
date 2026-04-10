import { describe, it, expect } from 'vitest';
import { parseTag, findPreviousTag } from '../../src/core/tag-parser.js';
import type { TagInfo } from '../../src/types.js';

describe('parseTag', () => {
  it('parses multi-client tag', () => {
    expect(parseTag('mobile-v0.1.17')).toEqual({
      raw: 'mobile-v0.1.17',
      prefix: 'mobile',
      version: '0.1.17',
      suffix: null,
    });
  });

  it('parses single-client tag', () => {
    expect(parseTag('v2.1.0')).toEqual({
      raw: 'v2.1.0',
      prefix: null,
      version: '2.1.0',
      suffix: null,
    });
  });

  it('parses tag with hyphenated prefix', () => {
    expect(parseTag('my-app-v1.0.0')).toEqual({
      raw: 'my-app-v1.0.0',
      prefix: 'my-app',
      version: '1.0.0',
      suffix: null,
    });
  });

  it('preserves suffix after semver', () => {
    expect(parseTag('mobile-v0.12.0-version')).toEqual({
      raw: 'mobile-v0.12.0-version',
      prefix: 'mobile',
      version: '0.12.0',
      suffix: '-version',
    });
  });

  it('preserves long suffix after semver', () => {
    expect(parseTag('mobile-v0.13.0-version-something-else')).toEqual({
      raw: 'mobile-v0.13.0-version-something-else',
      prefix: 'mobile',
      version: '0.13.0',
      suffix: '-version-something-else',
    });
  });

  it('preserves suffix on single-client tag', () => {
    expect(parseTag('v1.0.0-beta.1')).toEqual({
      raw: 'v1.0.0-beta.1',
      prefix: null,
      version: '1.0.0',
      suffix: '-beta.1',
    });
  });

  it('throws on tag without v prefix', () => {
    expect(() => parseTag('1.0.0')).toThrow('Invalid tag format');
  });

  it('throws on arbitrary string', () => {
    expect(() => parseTag('release-latest')).toThrow('Invalid tag format');
  });

  it('throws on tag with no version number', () => {
    expect(() => parseTag('v-no-version')).toThrow('Invalid tag format');
  });
});

describe('findPreviousTag', () => {
  const tags: TagInfo[] = [
    { raw: 'mobile-v0.1.15', prefix: 'mobile', version: '0.1.15', suffix: null, createdAt: '2026-01-01T00:00:00Z' },
    { raw: 'mobile-v0.1.16', prefix: 'mobile', version: '0.1.16', suffix: null, createdAt: '2026-02-01T00:00:00Z' },
    { raw: 'mobile-v0.1.17', prefix: 'mobile', version: '0.1.17', suffix: null, createdAt: '2026-03-01T00:00:00Z' },
    { raw: 'web-v1.0.0', prefix: 'web', version: '1.0.0', suffix: null, createdAt: '2026-02-15T00:00:00Z' },
    { raw: 'v2.0.0', prefix: null, version: '2.0.0', suffix: null, createdAt: '2026-03-15T00:00:00Z' },
  ];

  it('returns the highest version below current for same prefix', () => {
    const current = tags[2]; // mobile-v0.1.17
    const result = findPreviousTag(tags, current);
    expect(result?.raw).toBe('mobile-v0.1.16');
  });

  it('skips versions higher than current', () => {
    const current = tags[1]; // mobile-v0.1.16
    const result = findPreviousTag(tags, current);
    expect(result?.raw).toBe('mobile-v0.1.15');
  });

  it('returns null when no previous tag for same prefix', () => {
    const current = tags[0]; // mobile-v0.1.15 (lowest mobile tag)
    const result = findPreviousTag(tags, current);
    expect(result).toBeNull();
  });

  it('ignores tags with different prefix', () => {
    const current = tags[3]; // web-v1.0.0
    const result = findPreviousTag(tags, current);
    expect(result).toBeNull();
  });

  it('handles single-client tags (null prefix)', () => {
    const singleTags: TagInfo[] = [
      { raw: 'v1.0.0', prefix: null, version: '1.0.0', suffix: null, createdAt: '2026-01-01T00:00:00Z' },
      { raw: 'v2.0.0', prefix: null, version: '2.0.0', suffix: null, createdAt: '2026-02-01T00:00:00Z' },
    ];
    const current = singleTags[1];
    const result = findPreviousTag(singleTags, current);
    expect(result?.raw).toBe('v1.0.0');
  });

  it('uses creation date as tiebreaker for same version', () => {
    const tiedTags: TagInfo[] = [
      { raw: 'mobile-v1.0.0', prefix: 'mobile', version: '1.0.0', suffix: null, createdAt: '2026-01-01T00:00:00Z' },
      { raw: 'mobile-v1.0.0', prefix: 'mobile', version: '1.0.0', suffix: null, createdAt: '2026-02-01T00:00:00Z' },
      { raw: 'mobile-v2.0.0', prefix: 'mobile', version: '2.0.0', suffix: null, createdAt: '2026-03-01T00:00:00Z' },
    ];
    const current = tiedTags[2];
    const result = findPreviousTag(tiedTags, current);
    expect(result?.createdAt).toBe('2026-02-01T00:00:00Z');
  });

  it('skips suffixed tags (emergency/hotfix releases)', () => {
    const mixedTags: TagInfo[] = [
      { raw: 'mobile-v0.1.0', prefix: 'mobile', version: '0.1.0', suffix: null, createdAt: '2026-01-01T00:00:00Z' },
      { raw: 'mobile-v0.1.1-hotfix', prefix: 'mobile', version: '0.1.1', suffix: '-hotfix', createdAt: '2026-01-15T00:00:00Z' },
      { raw: 'mobile-v0.2.0', prefix: 'mobile', version: '0.2.0', suffix: null, createdAt: '2026-02-01T00:00:00Z' },
    ];
    const current = mixedTags[2]; // mobile-v0.2.0
    const result = findPreviousTag(mixedTags, current);
    expect(result?.raw).toBe('mobile-v0.1.0');
  });
});
