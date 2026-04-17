/**
 * Canonical location for the Tag Timestamps docs. Referenced by init tip,
 * generate warning, and validate output. When adding a new touch-point,
 * import this constant rather than hard-coding the URL.
 */
export const README_ANCHOR_URL =
  'https://github.com/makisp/releasejet#tag-timestamps';

export const TAG_TIMESTAMP_TIP = [
  '',
  '💡 Tip — Tag timestamps',
  '   ReleaseJet works best with annotated tags or tags that have a release',
  '   object attached. Plain lightweight tags fall back to the commit date,',
  '   which may pick up issues closed after the commit.',
  '',
  '   Create tags either way:',
  '     • CLI:     git tag -a v1.0.0 -m "Release v1.0.0"',
  '     • GitLab:  Code → Tags → New tag (fill the Message field,',
  '                e.g. "Release v1.0.0")',
  '     • GitHub:  Releases → Draft a new release',
  '                (GitHub has no web UI for creating tags without a release)',
  '     • Or let ReleaseJet do it: releasejet generate --tag <tag> --publish',
  '',
  `   See: ${README_ANCHOR_URL}`,
].join('\n');

export function formatLightweightTagWarning(tagName: string): string {
  return [
    `⚠  Tag "${tagName}" is a lightweight tag with no release object attached.`,
    '   ReleaseJet is using the commit date as a lower bound and the current',
    '   time as the upper bound, which may include issues closed after the',
    '   commit.',
    '',
    '   For precise timing, either:',
    `     • Create annotated tags (git tag -a ${tagName} -m "Release ${tagName}")`,
    '     • Attach a release object',
    `       (e.g., releasejet generate --tag ${tagName} --publish)`,
    '',
    `   See: ${README_ANCHOR_URL}`,
  ].join('\n');
}
