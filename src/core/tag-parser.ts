import * as semver from 'semver';
import type { ParsedTag, TagInfo, ReleaseJetConfig } from '../types.js';

export interface TagFormatRegex {
  regex: RegExp;
  prefixGroup: number | null;
  versionGroup: number;
}

export function tagFormatToRegex(format: string): TagFormatRegex {
  let prefixGroup: number | null = null;
  let versionGroup = 0;
  let groupIndex = 0;

  const parts = format.split(/(\{prefix\}|\{version\})/);
  let pattern = '';

  for (const part of parts) {
    if (part === '{prefix}') {
      groupIndex++;
      prefixGroup = groupIndex;
      pattern += '(.+?)';
    } else if (part === '{version}') {
      groupIndex++;
      versionGroup = groupIndex;
      pattern += '(.+)';
    } else {
      pattern += part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
  }

  if (versionGroup === 0) {
    throw new Error('Tag format must contain {version} placeholder.');
  }

  return {
    regex: new RegExp(`^${pattern}$`),
    prefixGroup,
    versionGroup,
  };
}

export function parseTag(tag: string, tagFormat?: string): ParsedTag {
  if (tagFormat) {
    const { regex, prefixGroup, versionGroup } = tagFormatToRegex(tagFormat);
    const match = tag.match(regex);
    if (match) {
      const prefix = prefixGroup ? match[prefixGroup] : null;
      const versionPart = match[versionGroup];
      const coerced = semver.coerce(versionPart);
      if (coerced) {
        const suffix = versionPart.slice(coerced.version.length) || null;
        return { raw: tag, prefix, version: coerced.version, suffix };
      }
    }
    throw new Error(
      `Invalid tag format: "${tag}". Expected format: ${tagFormat}`,
    );
  }

  // Legacy behavior: try multi-client then single-client
  const multiMatch = tag.match(/^(.+?)-v(.+)$/);
  if (multiMatch) {
    const [, prefix, versionPart] = multiMatch;
    const coerced = semver.coerce(versionPart);
    if (coerced) {
      const suffix = versionPart.slice(coerced.version.length) || null;
      return { raw: tag, prefix, version: coerced.version, suffix };
    }
  }

  const singleMatch = tag.match(/^v(.+)$/);
  if (singleMatch) {
    const [, versionPart] = singleMatch;
    const coerced = semver.coerce(versionPart);
    if (coerced) {
      const suffix = versionPart.slice(coerced.version.length) || null;
      return { raw: tag, prefix: null, version: coerced.version, suffix };
    }
  }

  throw new Error(
    `Invalid tag format: "${tag}". Expected <prefix>-v<semver> or v<semver>.`,
  );
}

export function findPreviousTag(
  allTags: TagInfo[],
  current: TagInfo,
): TagInfo | null {
  const candidates = allTags
    .filter((t) => t.prefix === current.prefix && t.raw !== current.raw)
    .filter((t) => t.suffix === null)
    .filter((t) => semver.lt(t.version, current.version))
    .sort((a, b) => {
      const cmp = semver.rcompare(a.version, b.version);
      if (cmp !== 0) return cmp;
      return (
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    });

  return candidates[0] ?? null;
}

export function findNextSamePrefixTag(
  allTags: TagInfo[],
  current: TagInfo,
): TagInfo | null {
  const candidates = allTags
    .filter((t) => t.prefix === current.prefix && t.raw !== current.raw)
    .filter((t) => t.suffix === null)
    .filter((t) => semver.gt(t.version, current.version))
    .sort((a, b) => semver.compare(a.version, b.version));

  return candidates[0] ?? null;
}

export interface TagValidationResult {
  tag: string;
  valid: boolean;
  reason?: string;
}

export function validateTag(tagName: string, config: ReleaseJetConfig): TagValidationResult {
  try {
    const parsed = parseTag(tagName, config.tagFormat);

    // In multi-client mode, check that the prefix matches a configured client
    if (config.clients.length > 0 && parsed.prefix !== null) {
      const knownPrefixes = config.clients.map((c) => c.prefix);
      if (!knownPrefixes.includes(parsed.prefix)) {
        return {
          tag: tagName,
          valid: false,
          reason: `unknown prefix "${parsed.prefix}" (expected: ${knownPrefixes.join(', ')})`,
        };
      }
    }

    return { tag: tagName, valid: true };
  } catch {
    return { tag: tagName, valid: false, reason: 'does not match expected format' };
  }
}
