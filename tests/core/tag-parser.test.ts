import { describe, it, expect } from 'vitest';
import { parseTag, findPreviousTag, validateTag, tagFormatToRegex } from '../../src/core/tag-parser.js';
import type { TagInfo, ReleaseJetConfig } from '../../src/types.js';

describe('tagFormatToRegex', () => {
  it('converts v{version} to regex with version in group 1', () => {
    const result = tagFormatToRegex('v{version}');
    expect(result.regex.source).toBe('^v(.+)$');
    expect(result.prefixGroup).toBeNull();
    expect(result.versionGroup).toBe(1);
  });

  it('converts {prefix}-v{version} to regex with prefix in group 1 and version in group 2', () => {
    const result = tagFormatToRegex('{prefix}-v{version}');
    expect(result.regex.source).toBe('^(.+?)-v(.+)$');
    expect(result.prefixGroup).toBe(1);
    expect(result.versionGroup).toBe(2);
  });

  it('converts bare {version} to regex', () => {
    const result = tagFormatToRegex('{version}');
    expect(result.regex.source).toBe('^(.+)$');
    expect(result.prefixGroup).toBeNull();
    expect(result.versionGroup).toBe(1);
  });

  it('converts {prefix}/{version} with slash separator', () => {
    const result = tagFormatToRegex('{prefix}/{version}');
    // Node 22+ escapes '/' in RegExp.source; test the regex behavior instead
    expect('mobile/1.0.0').toMatch(result.regex);
    expect('mobile-1.0.0').not.toMatch(result.regex);
    expect(result.prefixGroup).toBe(1);
    expect(result.versionGroup).toBe(2);
  });

  it('converts {prefix}@{version} with at-sign separator', () => {
    const result = tagFormatToRegex('{prefix}@{version}');
    expect(result.regex.source).toBe('^(.+?)@(.+)$');
    expect(result.prefixGroup).toBe(1);
    expect(result.versionGroup).toBe(2);
  });

  it('converts release/v{version} with literal path prefix', () => {
    const result = tagFormatToRegex('release/v{version}');
    // Node 22+ escapes '/' in RegExp.source; test the regex behavior instead
    expect('release/v1.0.0').toMatch(result.regex);
    expect('release-v1.0.0').not.toMatch(result.regex);
    expect(result.prefixGroup).toBeNull();
    expect(result.versionGroup).toBe(1);
  });

  it('escapes regex special characters in literal parts', () => {
    const result = tagFormatToRegex('release.{version}');
    expect(result.regex.source).toBe('^release\\.(.+)$');
  });

  it('throws when {version} placeholder is missing', () => {
    expect(() => tagFormatToRegex('{prefix}-release')).toThrow(
      'Tag format must contain {version}',
    );
  });
});

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

describe('parseTag with tagFormat', () => {
  it('parses v-prefixed tag with v{version} format', () => {
    expect(parseTag('v1.0.0', 'v{version}')).toEqual({
      raw: 'v1.0.0',
      prefix: null,
      version: '1.0.0',
      suffix: null,
    });
  });

  it('parses bare version with {version} format', () => {
    expect(parseTag('1.0.0', '{version}')).toEqual({
      raw: '1.0.0',
      prefix: null,
      version: '1.0.0',
      suffix: null,
    });
  });

  it('parses multi-client tag with {prefix}-v{version} format', () => {
    expect(parseTag('mobile-v1.0.0', '{prefix}-v{version}')).toEqual({
      raw: 'mobile-v1.0.0',
      prefix: 'mobile',
      version: '1.0.0',
      suffix: null,
    });
  });

  it('parses tag with slash separator {prefix}/{version}', () => {
    expect(parseTag('mobile/1.0.0', '{prefix}/{version}')).toEqual({
      raw: 'mobile/1.0.0',
      prefix: 'mobile',
      version: '1.0.0',
      suffix: null,
    });
  });

  it('parses tag with at-sign separator {prefix}@{version}', () => {
    expect(parseTag('mobile@1.0.0', '{prefix}@{version}')).toEqual({
      raw: 'mobile@1.0.0',
      prefix: 'mobile',
      version: '1.0.0',
      suffix: null,
    });
  });

  it('parses tag with literal path prefix release/v{version}', () => {
    expect(parseTag('release/v1.0.0', 'release/v{version}')).toEqual({
      raw: 'release/v1.0.0',
      prefix: null,
      version: '1.0.0',
      suffix: null,
    });
  });

  it('preserves suffix with custom format', () => {
    expect(parseTag('v1.0.0-beta.1', 'v{version}')).toEqual({
      raw: 'v1.0.0-beta.1',
      prefix: null,
      version: '1.0.0',
      suffix: '-beta.1',
    });
  });

  it('preserves suffix with prefix format', () => {
    expect(parseTag('mobile-v0.12.0-hotfix', '{prefix}-v{version}')).toEqual({
      raw: 'mobile-v0.12.0-hotfix',
      prefix: 'mobile',
      version: '0.12.0',
      suffix: '-hotfix',
    });
  });

  it('throws when tag does not match custom format', () => {
    expect(() => parseTag('badtag', 'v{version}')).toThrow(
      'Expected format: v{version}',
    );
  });

  it('throws when version part is not valid semver', () => {
    expect(() => parseTag('v-notaversion', 'v{version}')).toThrow(
      'Expected format: v{version}',
    );
  });

  it('parses hyphenated prefix with custom format', () => {
    expect(parseTag('my-app-v2.0.0', '{prefix}-v{version}')).toEqual({
      raw: 'my-app-v2.0.0',
      prefix: 'my-app',
      version: '2.0.0',
      suffix: null,
    });
  });

  it('falls back to legacy behavior when tagFormat is undefined', () => {
    expect(parseTag('v1.0.0')).toEqual({
      raw: 'v1.0.0',
      prefix: null,
      version: '1.0.0',
      suffix: null,
    });
    expect(parseTag('mobile-v1.0.0')).toEqual({
      raw: 'mobile-v1.0.0',
      prefix: 'mobile',
      version: '1.0.0',
      suffix: null,
    });
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

describe('validateTag', () => {
  const singleClientConfig: ReleaseJetConfig = {
    provider: { type: 'github', url: '' },
    source: 'issues',
    clients: [],
    categories: { feature: 'Features', bug: 'Bug Fixes' },
    uncategorized: 'lenient',
  };

  const multiClientConfig: ReleaseJetConfig = {
    provider: { type: 'github', url: '' },
    source: 'issues',
    clients: [
      { prefix: 'mobile', label: 'MOBILE' },
      { prefix: 'web', label: 'WEB' },
    ],
    categories: { feature: 'Features', bug: 'Bug Fixes' },
    uncategorized: 'lenient',
  };

  it('accepts a valid single-client tag', () => {
    const result = validateTag('v1.2.3', singleClientConfig);
    expect(result).toEqual({ tag: 'v1.2.3', valid: true });
  });

  it('accepts a valid multi-client tag with known prefix', () => {
    const result = validateTag('mobile-v1.0.0', multiClientConfig);
    expect(result).toEqual({ tag: 'mobile-v1.0.0', valid: true });
  });

  it('accepts a tag with a semver suffix', () => {
    const result = validateTag('v1.0.0-beta.1', singleClientConfig);
    expect(result).toEqual({ tag: 'v1.0.0-beta.1', valid: true });
  });

  it('rejects a tag that does not match expected format', () => {
    const result = validateTag('release-2024', singleClientConfig);
    expect(result).toEqual({
      tag: 'release-2024',
      valid: false,
      reason: 'does not match expected format',
    });
  });

  it('rejects a tag with invalid semver', () => {
    const result = validateTag('mobile-vbad', multiClientConfig);
    expect(result).toEqual({
      tag: 'mobile-vbad',
      valid: false,
      reason: 'does not match expected format',
    });
  });

  it('rejects a tag with unknown prefix in multi-client mode', () => {
    const result = validateTag('desktop-v1.0.0', multiClientConfig);
    expect(result).toEqual({
      tag: 'desktop-v1.0.0',
      valid: false,
      reason: 'unknown prefix "desktop" (expected: mobile, web)',
    });
  });

  it('accepts any prefix in single-client mode', () => {
    const result = validateTag('anything-v1.0.0', singleClientConfig);
    expect(result).toEqual({ tag: 'anything-v1.0.0', valid: true });
  });

  it('validates tag against custom tagFormat', () => {
    const config: ReleaseJetConfig = {
      ...singleClientConfig,
      tagFormat: '{version}',
    };
    const result = validateTag('1.0.0', config);
    expect(result).toEqual({ tag: '1.0.0', valid: true });
  });

  it('rejects tag that does not match custom tagFormat', () => {
    const config: ReleaseJetConfig = {
      ...singleClientConfig,
      tagFormat: 'release/v{version}',
    };
    const result = validateTag('v1.0.0', config);
    expect(result).toEqual({
      tag: 'v1.0.0',
      valid: false,
      reason: 'does not match expected format',
    });
  });

  it('validates multi-client tag with custom format and known prefix', () => {
    const config: ReleaseJetConfig = {
      ...multiClientConfig,
      tagFormat: '{prefix}/{version}',
    };
    const result = validateTag('mobile/1.0.0', config);
    expect(result).toEqual({ tag: 'mobile/1.0.0', valid: true });
  });

  it('rejects multi-client tag with custom format and unknown prefix', () => {
    const config: ReleaseJetConfig = {
      ...multiClientConfig,
      tagFormat: '{prefix}/{version}',
    };
    const result = validateTag('desktop/1.0.0', config);
    expect(result).toEqual({
      tag: 'desktop/1.0.0',
      valid: false,
      reason: 'unknown prefix "desktop" (expected: mobile, web)',
    });
  });

  it('falls back to legacy validation when tagFormat is undefined', () => {
    const result = validateTag('v1.2.3', singleClientConfig);
    expect(result).toEqual({ tag: 'v1.2.3', valid: true });
  });
});
