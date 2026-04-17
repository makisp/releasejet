# F11 — Tag-format migration detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `releasejet generate` abort with an actionable error when `findPreviousTag` returns `null` but same-prefix orphan tags (unparseable or suffixed) exist, so users don't silently publish "everything since the dawn of time" after a tagFormat change.

**Architecture:** Two new pure helpers (`collectOrphanTags`, `formatOrphanError`) added to `src/core/tag-parser.ts`. `src/cli/commands/generate.ts` is refactored to preserve unparseable tag names alongside the existing `allTags` array, and invokes the helpers immediately after `findPreviousTag` returns `null` in the auto-detect branch (the check is skipped when `--since` is passed). Orchestration stays thin; the helpers are easy to unit-test in isolation.

**Tech Stack:** TypeScript, Node 20, Vitest, `semver` (already a dependency).

**Spec:** [`docs/superpowers/specs/2026-04-17-tag-format-migration-detection-design.md`](../specs/2026-04-17-tag-format-migration-detection-design.md)

---

## File Structure

**Create:** none.

**Modify:**
- `src/core/tag-parser.ts` — append `OrphanReport` interface, `collectOrphanTags()`, `formatOrphanError()`.
- `src/cli/commands/generate.ts` — replace the `.map + .filter` tag-collection block with a single-pass loop that also accumulates unparseables; insert the orphan-check block in the `else` branch of `if (options.since)`.
- `tests/core/tag-parser.test.ts` — append `describe('collectOrphanTags', ...)` and `describe('formatOrphanError', ...)`.
- `docs/ROADMAP.md` — flip F11 checkbox.
- `CHANGELOG.md` — add `[1.9.4] - 2026-04-17` section.
- `package.json` — version bump `1.9.3` → `1.9.4`.

**Not creating a new integration test file.** There is currently no `tests/cli/commands/generate.test.ts`; spec calls for unit coverage to be sufficient.

---

## Task 1: Add `OrphanReport` type and `collectOrphanTags` helper (TDD)

**Files:**
- Modify: `src/core/tag-parser.ts` (append at end of file)
- Test: `tests/core/tag-parser.test.ts` (append new `describe` block)

### - [ ] Step 1: Write the failing tests

Append to `tests/core/tag-parser.test.ts`. Add the import update at the top first:

```ts
// In the existing import line at top of file, add collectOrphanTags:
import {
  parseTag,
  findPreviousTag,
  findNextSamePrefixTag,
  validateTag,
  tagFormatToRegex,
  collectOrphanTags,
} from '../../src/core/tag-parser.js';
```

Then append at the end of the file:

```ts
describe('collectOrphanTags', () => {
  function makeTag(
    raw: string,
    prefix: string | null,
    version: string,
    suffix: string | null,
    createdAt: string,
  ): TagInfo {
    return {
      raw,
      prefix,
      version,
      suffix,
      createdAt,
      commitDate: createdAt,
      dateSource: 'annotated',
    };
  }

  const current = makeTag('v1.0.0', null, '1.0.0', null, '2026-04-01T00:00:00Z');

  it('returns { null, null } for a genuine first release (no orphans)', () => {
    const report = collectOrphanTags([current], [], current);
    expect(report).toEqual({ formatMismatch: null, suffix: null });
  });

  it('detects a single format-mismatch orphan', () => {
    const unparseable = [{ name: 'old-v0.9.0', createdAt: '2026-03-01T00:00:00Z' }];
    const report = collectOrphanTags([current], unparseable, current);
    expect(report.formatMismatch).toEqual(unparseable[0]);
    expect(report.suffix).toBeNull();
  });

  it('picks the most recent unparseable when multiple exist', () => {
    const unparseable = [
      { name: 'old-v0.8.0', createdAt: '2026-01-01T00:00:00Z' },
      { name: 'old-v0.9.0', createdAt: '2026-03-01T00:00:00Z' },
      { name: 'old-v0.9.5', createdAt: '2026-02-01T00:00:00Z' },
    ];
    const report = collectOrphanTags([current], unparseable, current);
    expect(report.formatMismatch?.name).toBe('old-v0.9.0');
  });

  it('detects a suffix orphan with same prefix and semver.lte current', () => {
    const beta = makeTag('v0.9.0-beta.1', null, '0.9.0', '-beta.1', '2026-03-01T00:00:00Z');
    const report = collectOrphanTags([current, beta], [], current);
    expect(report.suffix).toEqual(beta);
    expect(report.formatMismatch).toBeNull();
  });

  it('detects suffix orphan when suffix tag has same coerced version as current (semver.lte)', () => {
    const rc = makeTag('v1.0.0-rc.1', null, '1.0.0', '-rc.1', '2026-03-20T00:00:00Z');
    const report = collectOrphanTags([current, rc], [], current);
    expect(report.suffix).toEqual(rc);
  });

  it('sorts suffix candidates by semver desc then createdAt desc', () => {
    const older = makeTag('v0.8.0-beta', null, '0.8.0', '-beta', '2026-03-05T00:00:00Z');
    const newer = makeTag('v0.9.0-beta', null, '0.9.0', '-beta', '2026-02-01T00:00:00Z');
    const newerTwin = makeTag('v0.9.0-rc', null, '0.9.0', '-rc', '2026-03-15T00:00:00Z');
    const report = collectOrphanTags([current, older, newer, newerTwin], [], current);
    expect(report.suffix?.raw).toBe('v0.9.0-rc');
  });

  it('excludes future-version suffix tags (semver > current)', () => {
    const future = makeTag('v2.0.0-beta', null, '2.0.0', '-beta', '2026-03-01T00:00:00Z');
    const report = collectOrphanTags([current, future], [], current);
    expect(report.suffix).toBeNull();
  });

  it('excludes the current tag itself from suffix candidates (same raw)', () => {
    const currentIsSuffixed = makeTag('v1.0.0-rc.1', null, '1.0.0', '-rc.1', '2026-04-01T00:00:00Z');
    const report = collectOrphanTags([currentIsSuffixed], [], currentIsSuffixed);
    expect(report.suffix).toBeNull();
  });

  it('excludes different-prefix suffix tags', () => {
    const mobileCurrent = makeTag('mobile-v1.0.0', 'mobile', '1.0.0', null, '2026-04-01T00:00:00Z');
    const desktopBeta = makeTag('desktop-v0.9.0-beta', 'desktop', '0.9.0', '-beta', '2026-03-01T00:00:00Z');
    const report = collectOrphanTags([mobileCurrent, desktopBeta], [], mobileCurrent);
    expect(report.suffix).toBeNull();
  });

  it('ignores prefix for unparseable tags (any unparseable counts)', () => {
    const mobileCurrent = makeTag('mobile/1.0.0', 'mobile', '1.0.0', null, '2026-04-01T00:00:00Z');
    const unparseable = [{ name: 'random-tag', createdAt: '2026-03-01T00:00:00Z' }];
    const report = collectOrphanTags([mobileCurrent], unparseable, mobileCurrent);
    expect(report.formatMismatch).toEqual(unparseable[0]);
  });

  it('returns both kinds when both exist', () => {
    const beta = makeTag('v0.9.0-beta', null, '0.9.0', '-beta', '2026-03-10T00:00:00Z');
    const unparseable = [{ name: 'old-v0.8.0', createdAt: '2026-02-01T00:00:00Z' }];
    const report = collectOrphanTags([current, beta], unparseable, current);
    expect(report.formatMismatch).toEqual(unparseable[0]);
    expect(report.suffix).toEqual(beta);
  });
});
```

### - [ ] Step 2: Run tests to verify they fail

Run: `npx vitest run tests/core/tag-parser.test.ts`

Expected: FAIL with `"collectOrphanTags" is not exported` (or equivalent import error).

### - [ ] Step 3: Implement `OrphanReport` and `collectOrphanTags`

Append to `src/core/tag-parser.ts` (after the existing `findNextSamePrefixTag` function, before `validateTag`):

```ts
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
```

### - [ ] Step 4: Run tests to verify they pass

Run: `npx vitest run tests/core/tag-parser.test.ts`

Expected: PASS. All 11 new tests plus all pre-existing tag-parser tests pass.

### - [ ] Step 5: Commit

```bash
git add src/core/tag-parser.ts tests/core/tag-parser.test.ts
git commit -m "feat(tag-parser): add collectOrphanTags helper for migration detection"
```

---

## Task 2: Add `formatOrphanError` helper (TDD)

**Files:**
- Modify: `src/core/tag-parser.ts`
- Test: `tests/core/tag-parser.test.ts` (append)

### - [ ] Step 1: Write the failing tests

Update the import in `tests/core/tag-parser.test.ts` to also pull in `formatOrphanError`:

```ts
import {
  parseTag,
  findPreviousTag,
  findNextSamePrefixTag,
  validateTag,
  tagFormatToRegex,
  collectOrphanTags,
  formatOrphanError,
} from '../../src/core/tag-parser.js';
```

Append at the end of the file:

```ts
describe('formatOrphanError', () => {
  function makeTag(
    raw: string,
    prefix: string | null,
    version: string,
    suffix: string | null,
    createdAt = '2026-04-01T00:00:00Z',
  ): TagInfo {
    return {
      raw,
      prefix,
      version,
      suffix,
      createdAt,
      commitDate: createdAt,
      dateSource: 'annotated',
    };
  }

  const current = makeTag('release/v1.0.0', null, '1.0.0', null);

  it('Case A: formats format-mismatch-only with tagFormat, count, --since and re-tag guidance', () => {
    const report = {
      formatMismatch: { name: 'v0.9.2', createdAt: '2026-03-15T00:00:00Z' },
      suffix: null,
    };
    const msg = formatOrphanError(report, current, 'release/{version}', 12);
    expect(msg).toContain('No previous tag found for "release/v1.0.0"');
    expect(msg).toContain('12 tags');
    expect(msg).toContain('do not match');
    expect(msg).toContain('"release/{version}"');
    expect(msg).toContain('Most recent non-matching tag: v0.9.2 (2026-03-15)');
    expect(msg).toContain('releasejet generate --tag release/v1.0.0 --since v0.9.2');
    expect(msg).toContain('re-tag the previous release');
    expect(msg).toContain('Aborting.');
  });

  it('Case A: singular form when unparseableCount === 1', () => {
    const report = {
      formatMismatch: { name: 'v0.9.2', createdAt: '2026-03-15T00:00:00Z' },
      suffix: null,
    };
    const msg = formatOrphanError(report, current, 'release/{version}', 1);
    expect(msg).toContain('1 tag');
    expect(msg).not.toContain('1 tags');
    expect(msg).toContain('does not match');
    expect(msg).not.toContain('do not match');
  });

  it('Case A: uses legacy fallback when tagFormat is undefined', () => {
    const report = {
      formatMismatch: { name: 'v0.9.2', createdAt: '2026-03-15T00:00:00Z' },
      suffix: null,
    };
    const msg = formatOrphanError(report, current, undefined, 3);
    expect(msg).toContain('<prefix>-v<semver> or v<semver>');
    expect(msg).not.toContain('undefined');
  });

  it('Case B: suffix-only uses "suffixed tag" wording (not "pre-release")', () => {
    const ertCurrent = makeTag('ert-v1.1.0', 'ert', '1.1.0', null);
    const orphan = makeTag(
      'ert-v1.0.0-version',
      'ert',
      '1.0.0',
      '-version',
      '2026-03-15T00:00:00Z',
    );
    const msg = formatOrphanError(
      { formatMismatch: null, suffix: orphan },
      ertCurrent,
      '{prefix}-v{version}',
      0,
    );
    expect(msg).toContain('No previous tag found for "ert-v1.1.0"');
    expect(msg).toContain('suffixed tag');
    expect(msg).not.toContain('pre-release');
    expect(msg).toContain('ert-v1.0.0-version');
    expect(msg).toContain('2026-03-15');
    expect(msg).toContain(
      'releasejet generate --tag ert-v1.1.0 --since ert-v1.0.0-version',
    );
    expect(msg).toContain('Aborting.');
  });

  it('Case C: both bullets present, remediation uses suffix orphan raw as --since', () => {
    const rc = makeTag('release/v1.0.0-rc.1', null, '1.0.0', '-rc.1', '2026-03-16T00:00:00Z');
    const msg = formatOrphanError(
      {
        formatMismatch: { name: 'v0.9.2', createdAt: '2026-03-15T00:00:00Z' },
        suffix: rc,
      },
      current,
      'release/{version}',
      5,
    );
    expect(msg).toContain('Multiple tags were skipped');
    expect(msg).toContain('Most recent non-matching tag');
    expect(msg).toContain('v0.9.2 (2026-03-15)');
    expect(msg).toContain('Most recent same-prefix suffixed tag');
    expect(msg).toContain('release/v1.0.0-rc.1 (2026-03-16)');
    expect(msg).toContain(
      'releasejet generate --tag release/v1.0.0 --since release/v1.0.0-rc.1',
    );
  });
});
```

### - [ ] Step 2: Run tests to verify they fail

Run: `npx vitest run tests/core/tag-parser.test.ts`

Expected: FAIL with `"formatOrphanError" is not exported`.

### - [ ] Step 3: Implement `formatOrphanError`

Append to `src/core/tag-parser.ts`, immediately after `collectOrphanTags`:

```ts
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
      `Error: No previous tag found for "${currentTag.raw}", but ${unparseableCount} ${noun} in this repository`,
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
      `Error: No previous tag found for "${currentTag.raw}". A same-prefix suffixed tag`,
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
    `Error: No previous tag found for "${currentTag.raw}". Multiple tags were skipped`,
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
```

### - [ ] Step 4: Run tests to verify they pass

Run: `npx vitest run tests/core/tag-parser.test.ts`

Expected: PASS. All 5 new `formatOrphanError` tests plus all earlier tests pass.

### - [ ] Step 5: Commit

```bash
git add src/core/tag-parser.ts tests/core/tag-parser.test.ts
git commit -m "feat(tag-parser): add formatOrphanError helper for migration-detection messages"
```

---

## Task 3: Wire the orphan check into `runGenerate`

**Files:**
- Modify: `src/cli/commands/generate.ts`

### - [ ] Step 1: Refactor tag-collection to preserve unparseables

Open `src/cli/commands/generate.ts`. Replace the block at lines 118–127 (the `.map + .filter` that builds `allTags`):

**Before:**

```ts
const allTags: TagInfo[] = apiTags
  .map((t) => {
    try {
      const parsed = parseTag(t.name, config.tagFormat);
      return { ...parsed, createdAt: t.createdAt, commitDate: t.commitDate, dateSource: t.dateSource };
    } catch {
      return null;
    }
  })
  .filter((t): t is TagInfo => t !== null);
```

**After:**

```ts
const allTags: TagInfo[] = [];
const unparseableTags: { name: string; createdAt: string }[] = [];
for (const t of apiTags) {
  try {
    const parsed = parseTag(t.name, config.tagFormat);
    allTags.push({
      ...parsed,
      createdAt: t.createdAt,
      commitDate: t.commitDate,
      dateSource: t.dateSource,
    });
  } catch {
    unparseableTags.push({ name: t.name, createdAt: t.createdAt });
  }
}
```

### - [ ] Step 2: Update the tag-parser import and insert the orphan check

In the same file, update the import near the top (line 8):

**Before:**

```ts
import { parseTag, findPreviousTag } from '../../core/tag-parser.js';
```

**After:**

```ts
import {
  parseTag,
  findPreviousTag,
  collectOrphanTags,
  formatOrphanError,
} from '../../core/tag-parser.js';
```

Then locate the auto-detect branch (the `else` of `if (options.since)`). Currently at lines 147–150:

**Before:**

```ts
} else {
  previousTag = findPreviousTag(allTags, currentTag);
  debug('Previous tag:', previousTag ? JSON.stringify(previousTag) : 'none (first release)');
}
```

**After:**

```ts
} else {
  previousTag = findPreviousTag(allTags, currentTag);
  debug('Previous tag:', previousTag ? JSON.stringify(previousTag) : 'none (first release)');
  if (previousTag === null) {
    const report = collectOrphanTags(allTags, unparseableTags, currentTag);
    if (report.formatMismatch || report.suffix) {
      throw new Error(
        formatOrphanError(
          report,
          currentTag,
          config.tagFormat,
          unparseableTags.length,
        ),
      );
    }
  }
}
```

### - [ ] Step 3: Run the full test suite to confirm no regression

Run: `npm test`

Expected: PASS. All existing tests still pass (the `.map + .filter` → `for` loop refactor is semantically equivalent; the new throw path fires only under orphan conditions, which no existing test constructs).

### - [ ] Step 4: Manual smoke test against the dev command

Create a scratch config and run the CLI against a local scenario to confirm the error path fires end-to-end. This is a sanity check only — no artifact.

Run (from a directory where you can invoke git, with a project that has mismatched tags, OR skip this step if no such repo is available locally):

```bash
npm run dev -- generate --tag <tag-with-no-previous> --debug
```

Expected: stderr shows the multi-line orphan error; process exits non-zero.

If no suitable repo is available: skip — unit coverage is sufficient.

### - [ ] Step 5: Commit

```bash
git add src/cli/commands/generate.ts
git commit -m "feat(generate): detect tagFormat migrations and abort with actionable error"
```

---

## Task 4: Version bump, changelog, and roadmap update

**Files:**
- Modify: `package.json`
- Modify: `CHANGELOG.md`
- Modify: `docs/ROADMAP.md`

### - [ ] Step 1: Bump version in `package.json`

Change line 3:

**Before:**

```json
  "version": "1.9.3",
```

**After:**

```json
  "version": "1.9.4",
```

### - [ ] Step 2: Add `[1.9.4]` section to `CHANGELOG.md`

Insert a new section at the top of `CHANGELOG.md`, above the existing `## [1.9.3]` entry:

```markdown
## [1.9.4] - 2026-04-17

### Added
- `generate` now detects tag-format migrations and filtered suffix tags. When no previous tag is found under the current `tagFormat` but same-prefix orphans exist in the repository (either unparseable under the new format, or parseable but with a suffix), the command aborts with an actionable error that names the most recent orphan and suggests `--since <tag>` or re-tagging. This prevents CI runs from silently publishing release notes covering every issue since the beginning of history after a `tagFormat` change. Genuine first releases (no orphans) are unaffected and still proceed as before. `--since` continues to bypass the check.
```

### - [ ] Step 3: Flip F11 in `docs/ROADMAP.md`

Locate the F11 line (~line 35):

**Before:**

```markdown
- [ ] F11. Tag-format migration detection in `generate` — ...
```

**After:**

```markdown
- [x] F11. Tag-format migration detection in `generate` — ...
```

Keep the rest of the line's descriptive text unchanged.

### - [ ] Step 4: Run the full test suite one more time

Run: `npm test`

Expected: PASS. Sanity check that docs/version edits didn't disturb anything.

### - [ ] Step 5: Commit

```bash
git add package.json CHANGELOG.md docs/ROADMAP.md
git commit -m "chore: bump to 1.9.4, document tagFormat migration detection (F11)"
```

---

## Verification checklist

Before considering this plan complete, confirm:

- [ ] `npm test` passes cleanly (no existing tests broken, all new tests pass).
- [ ] `npm run build` succeeds (tsup bundles without type errors).
- [ ] `grep -n "F11" docs/ROADMAP.md` shows `[x]`.
- [ ] `CHANGELOG.md` top entry is `[1.9.4]` with the new note.
- [ ] `package.json` version is `1.9.4`.
- [ ] A search for `collectOrphanTags` across the repo shows it defined once in `src/core/tag-parser.ts`, imported once in `src/cli/commands/generate.ts`, exercised in `tests/core/tag-parser.test.ts`.
- [ ] No dead code left in `generate.ts` from the refactor (the old `.map + .filter` is fully removed, not commented out).
