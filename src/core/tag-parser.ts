import * as semver from 'semver';
import type { ParsedTag, TagInfo } from '../types.js';

export function parseTag(tag: string): ParsedTag {
  // Multi-client: <prefix>-v<version...>
  // Non-greedy prefix finds first -v; coerce extracts core X.Y.Z
  const multiMatch = tag.match(/^(.+?)-v(.+)$/);
  if (multiMatch) {
    const [, prefix, versionPart] = multiMatch;
    const coerced = semver.coerce(versionPart);
    if (coerced) {
      const suffix = versionPart.slice(coerced.version.length) || null;
      return { raw: tag, prefix, version: coerced.version, suffix };
    }
  }

  // Single-client: v<version...>
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
