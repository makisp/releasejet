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

export interface OrphanReport {
  formatMismatch: { name: string; createdAt: string } | null;
  suffix: TagInfo | null;
}

export function collectOrphanTags(
  allTags: TagInfo[],
  unparseableTags: { name: string; createdAt: string }[],
  currentTag: TagInfo,
): OrphanReport {
  const formatMismatch =
    unparseableTags.length === 0
      ? null
      : unparseableTags.reduce((latest, t) =>
          new Date(t.createdAt).getTime() > new Date(latest.createdAt).getTime()
            ? t
            : latest,
        );

  const suffixCandidates = allTags
    .filter((t) => t.prefix === currentTag.prefix && t.raw !== currentTag.raw)
    .filter((t) => t.suffix !== null)
    .filter((t) => semver.lte(t.version, currentTag.version));

  const suffix =
    suffixCandidates.length === 0
      ? null
      : suffixCandidates.sort((a, b) => {
          const cmp = semver.rcompare(a.version, b.version);
          if (cmp !== 0) return cmp;
          return (
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        })[0];

  return { formatMismatch, suffix };
}

function formatDate(iso: string): string {
  return iso.split('T')[0];
}

function tagFormatOrLegacy(tagFormat: string | undefined): string {
  return tagFormat ?? '<prefix>-v<semver> or v<semver>';
}

export function formatOrphanError(
  report: OrphanReport,
  currentTag: TagInfo,
  tagFormat: string | undefined,
  unparseableCount: number,
): string {
  const formatStr = tagFormatOrLegacy(tagFormat);

  if (report.formatMismatch && !report.suffix) {
    const orphan = report.formatMismatch;
    const noun = unparseableCount === 1 ? 'tag' : 'tags';
    const verb = unparseableCount === 1 ? 'does not match' : 'do not match';
    return [
      `No previous tag found for "${currentTag.raw}", but ${unparseableCount} ${noun} in this repository`,
      `${verb} the configured tagFormat ("${formatStr}").`,
      '',
      `Most recent non-matching tag: ${orphan.name} (${formatDate(orphan.createdAt)})`,
      '',
      'This usually means tagFormat was changed after previous releases were tagged.',
      'To avoid publishing release notes covering every issue since the beginning of',
      'history, either:',
      '',
      '  - Specify an explicit starting point:',
      `      releasejet generate --tag ${currentTag.raw} --since ${orphan.name}`,
      '',
      '  - Or re-tag the previous release to match the new tagFormat and re-run',
      '    this command.',
      '',
      'Aborting.',
    ].join('\n');
  }

  if (report.suffix && !report.formatMismatch) {
    const orphan = report.suffix;
    return [
      `No previous tag found for "${currentTag.raw}". A same-prefix suffixed tag`,
      `exists (${orphan.raw}, ${formatDate(orphan.createdAt)}) and suffixed tags are filtered out`,
      'when detecting the previous release.',
      '',
      'To generate release notes against that tag, pass --since:',
      '',
      `  releasejet generate --tag ${currentTag.raw} --since ${orphan.raw}`,
      '',
      'Aborting.',
    ].join('\n');
  }

  // Both present (Case C)
  const fm = report.formatMismatch!;
  const sf = report.suffix!;
  return [
    `No previous tag found for "${currentTag.raw}". Multiple tags were skipped`,
    'during previous-tag detection:',
    '',
    `  - Most recent non-matching tag (not in configured tagFormat "${formatStr}"):`,
    `      ${fm.name} (${formatDate(fm.createdAt)})`,
    '  - Most recent same-prefix suffixed tag (filtered out):',
    `      ${sf.raw} (${formatDate(sf.createdAt)})`,
    '',
    'To proceed, specify an explicit starting point with --since, e.g.:',
    '',
    `  releasejet generate --tag ${currentTag.raw} --since ${sf.raw}`,
    '',
    'Aborting.',
  ].join('\n');
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
