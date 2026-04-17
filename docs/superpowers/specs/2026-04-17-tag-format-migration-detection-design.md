# F11 — Tag-format migration detection in `generate`

**Date:** 2026-04-17
**Status:** Draft — awaiting user review
**Roadmap item:** F11 (docs/ROADMAP.md)

## Motivation

When `releasejet generate --tag <tag>` cannot find a previous tag, it currently proceeds silently as a "first release" and fetches every issue since the beginning of history. This is correct for a genuine first release, but wrong — and silently catastrophic in CI — when the user has recently changed their `tagFormat` or when the previous release is a suffixed/pre-release tag.

The fix is to distinguish:

- **Genuine first release** — no same-prefix tags exist at all in the repository → proceed as today.
- **Tag-format migration or filtered previous** — same-prefix tags *do* exist but were filtered out by `findPreviousTag` (either because they failed `parseTag` under the current `tagFormat`, or because they have a non-null suffix) → abort with an actionable error that names the most-recent orphan tag and suggests `--since <tag>` or re-tagging.

This protects CI runs and gives local users a clear next step instead of a confusingly enormous notes file.

## Non-goals

- No new flag. `--since <tag>` is the existing, sufficient escape hatch.
- No change to `findPreviousTag`, `parseTag`, or `tagFormatToRegex` behavior.
- No change to the provider layer or the issue-collection pipeline.
- No JSON-mode special case — the error throws through the existing `withErrorHandler`, same as all other command errors.
- No heuristic substring matching on unparseable tag names to guess their prefix (see decisions).

## Current state

**`src/cli/commands/generate.ts`**, lines 118–150 — relevant excerpt:

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
// ...
let previousTag: TagInfo | null;
if (options.since) {
  previousTag = allTags.find((t) => t.raw === options.since) ?? null;
  if (!previousTag) {
    throw new Error(`Tag "${options.since}" (specified by --since) not found in remote repository.`);
  }
} else {
  previousTag = findPreviousTag(allTags, currentTag);
}
```

Unparseable tags are silently dropped. If `findPreviousTag` returns `null`, the pipeline proceeds with `previousTag = null`, which `collectIssues` interprets as "everything from the beginning".

**`src/core/tag-parser.ts`**, `findPreviousTag` (lines 87–104):

```ts
export function findPreviousTag(allTags, current) {
  const candidates = allTags
    .filter((t) => t.prefix === current.prefix && t.raw !== current.raw)
    .filter((t) => t.suffix === null)
    .filter((t) => semver.lt(t.version, current.version))
    .sort(/* version desc, then createdAt desc */);
  return candidates[0] ?? null;
}
```

Two ways a same-prefix tag becomes invisible here: (1) `parseTag` threw at the callsite above, so the tag never entered `allTags` at all; (2) `parseTag` succeeded but produced a non-null `suffix` (e.g., `v1.0.0-beta.2`, `ert-v1.0.0-version`).

## Decisions (from brainstorming)

1. **Orphan scope = format-mismatch OR suffix.** Both failure modes trigger the abort. Matches F11's literal wording ("suffix/format mismatch") and catches the pre-release-orphan foot-gun as well as the tagFormat-migration case.
2. **Unparseable tags are not prefix-filtered.** We cannot know the prefix of a tag that failed `parseTag`. Any unparseable tag is treated as a potential orphan. The `--since` escape hatch covers the rare case where an unrelated tag triggers a false positive.
3. **Contextual error message.** Name the single most-recent orphan of each kind; distinguish the two causes in the text; include copyable `--since` and (for format-mismatch) re-tag commands.
4. **Single escape hatch.** No new flag. `--since <tag>` already exists and is sufficient. The new check skips entirely when `--since` is passed.
5. **Softened wording.** The error refers to "suffixed tags" / "tags with a suffix", not "pre-release tags" — users whose suffix convention is semantic (e.g., `-version`, `-hotfix`) do not read as pre-releases.

## Design

Three files change. One test file added or extended. No new modules.

### 1. `src/core/tag-parser.ts` — new pure helpers

Append two exported functions and one interface alongside the existing `findPreviousTag`.

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
  const formatMismatch = unparseableTags.length === 0
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

  const suffix = suffixCandidates.length === 0
    ? null
    : suffixCandidates.sort((a, b) => {
        const cmp = semver.rcompare(a.version, b.version);
        if (cmp !== 0) return cmp;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      })[0];

  return { formatMismatch, suffix };
}

export function formatOrphanError(
  report: OrphanReport,
  currentTag: TagInfo,
  tagFormat: string | undefined,
  unparseableCount: number,
): string {
  // See "Error message format" below.
}
```

**Key behaviors:**

- `collectOrphanTags` returns `{ null, null }` when there is neither an unparseable nor a same-prefix suffixed tag — the caller treats that as "genuine first release" and proceeds as today.
- Suffix filter uses `semver.lte`, not `lt`, because a tag like `v1.0.0-beta.2` coerces to version `1.0.0` with `suffix="-beta.2"`. When current is `v1.0.0`, `lt` would wrongly exclude it. The `t.raw !== currentTag.raw` guard prevents the current tag from matching itself.
- Sort order for the suffix case mirrors `findPreviousTag` (version desc, then createdAt desc), so the "most recent" orphan is the release-track neighbor the user most likely wants as `--since`.
- Format-mismatch picks the most recent unparseable by wall-clock `createdAt` — we have no semver to sort on.
- `unparseableCount` is passed separately into `formatOrphanError` so the message can show total scale ("12 tags do not match…") without `collectOrphanTags` holding the whole array.

### 2. `src/cli/commands/generate.ts` — preserve unparseables, invoke the check

Replace the `.map(...).filter(...)` block (lines 118–127) with a single-pass loop that accumulates both arrays:

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

Then, only in the auto-detect branch (`else` of `if (options.since)`), immediately after `previousTag = findPreviousTag(allTags, currentTag)`, insert the orphan check:

```ts
previousTag = findPreviousTag(allTags, currentTag);
debug('Previous tag:', previousTag ? JSON.stringify(previousTag) : 'none (first release)');

if (previousTag === null) {
  const report = collectOrphanTags(allTags, unparseableTags, currentTag);
  if (report.formatMismatch || report.suffix) {
    throw new Error(
      formatOrphanError(report, currentTag, config.tagFormat, unparseableTags.length),
    );
  }
  // Otherwise: genuine first release — proceed as today.
}
```

Import `collectOrphanTags` and `formatOrphanError` from `../../core/tag-parser.js`.

No other changes to `runGenerate`. The check does not run under `--since` (the user explicitly declared the starting point), does not run when `previousTag` was found, and does not interact with `--dry-run`, `--format`, `--publish`, or templates.

### 3. `docs/ROADMAP.md` — mark F11 shipped

Flip the F11 line from `[ ]` to `[x]` as part of the same change. No other roadmap edits.

## Error message format

The error is a single multi-line string thrown as `new Error(...)`. It surfaces through the existing `withErrorHandler` which already prints command errors to stderr and sets a non-zero exit code.

Three sub-cases, driven by which fields of `OrphanReport` are non-null.

### Case A — format-mismatch only

```
Error: No previous tag found for "release/v1.0.0", but 12 tags in this repository
do not match the configured tagFormat ("release/{version}").

Most recent non-matching tag: v0.9.2 (2026-03-15)

This usually means tagFormat was changed after previous releases were tagged.
To avoid publishing release notes covering every issue since the beginning of
history, either:

  - Specify an explicit starting point:
      releasejet generate --tag release/v1.0.0 --since v0.9.2

  - Or re-tag the previous release to match the new tagFormat and re-run
    this command.

Aborting.
```

When `unparseableCount === 1`, the lead sentence reads "…1 tag in this repository does not match…" (singular noun, singular verb).

### Case B — suffix only

```
Error: No previous tag found for "ert-v1.1.0". A same-prefix suffixed tag
exists (ert-v1.0.0-version, 2026-03-15) and suffixed tags are filtered out
when detecting the previous release.

To generate release notes against that tag, pass --since:

  releasejet generate --tag ert-v1.1.0 --since ert-v1.0.0-version

Aborting.
```

### Case C — both

```
Error: No previous tag found for "release/v1.0.0". Multiple tags were skipped
during previous-tag detection:

  - Most recent non-matching tag (not in configured tagFormat "release/{version}"):
      v0.9.2 (2026-03-15)
  - Most recent same-prefix suffixed tag (filtered out):
      release/v1.0.0-rc.1 (2026-03-16)

To proceed, specify an explicit starting point with --since, e.g.:

  releasejet generate --tag release/v1.0.0 --since release/v1.0.0-rc.1

Aborting.
```

### Formatting rules

- When `config.tagFormat` is undefined (legacy mode), substitute the literal string `<prefix>-v<semver> or v<semver>` wherever the format string is shown.
- Grammatical number: singular form ("1 tag … does not match") when `unparseableCount === 1`, plural form ("N tags … do not match") otherwise. No parenthesised `(s)`. Unparseable count of 0 never reaches Case A or C (guarded by the `formatMismatch` null check).
- The Case A re-tag suggestion is wording-only, not a copyable command. A correct `git tag` command would require constructing the orphan's name under the new tagFormat, and we cannot reliably do that: the orphan failed `parseTag`, so its `{version}` component is unknown, and tagFormat templates can have arbitrary shapes.
- Dates are printed as `YYYY-MM-DD`, derived by splitting `createdAt` on `T` — matching the existing convention in `generate.ts` (line 211: `currentTag.createdAt.split('T')[0]`).
- The suggested `--since` value in Case C uses the *most recent* of the two orphans by wall-clock date when they differ, or the suffix orphan when they tie. (The suffix orphan is usually the one the user actually wants as a start point because it's a parseable neighbor on the same prefix.) — Implementation detail: the Case C template always uses `report.suffix.raw` as the `--since` suggestion, because by construction it is a parseable same-prefix tag; this is the safer default.

## Testing

All existing tests must continue to pass without modification.

**`tests/core/tag-parser.test.ts`** — new `describe` blocks:

```
describe('collectOrphanTags')
  - returns { null, null } when allTags has no same-prefix suffix tag AND unparseable is empty (genuine first release)
  - detects a single format-mismatch orphan (picks most recent by createdAt)
  - picks most recent unparseable when multiple exist
  - detects a suffix orphan (same prefix, suffix != null, semver.lte current)
  - sorts suffix candidates by semver desc then createdAt desc (matches findPreviousTag ordering)
  - excludes future-version suffix tags (e.g., v2.0.0-beta when current is v1.0.0)
  - excludes the current tag itself from suffix candidates
  - ignores prefix for unparseable tags (decision #2)
  - returns both kinds when both exist

describe('formatOrphanError')
  - Case A: formats single format-mismatch, includes tagFormat string, count, suggested --since and re-tag commands
  - Case A: uses "<prefix>-v<semver> or v<semver>" when tagFormat is undefined
  - Case A: correct singular/plural for "1 tag" vs "N tags"
  - Case B: suffix-only message uses "suffixed tag" wording (not "pre-release")
  - Case B: --since suggestion uses the orphan's raw tag name
  - Case C: both bullets present, single remediation block, --since suggestion uses suffix orphan's raw
```

**`tests/cli/commands/generate.test.ts`** (if the test harness already supports driving `runGenerate` end-to-end; otherwise defer) — one case:
- Fake provider returns `[v0.9.0-beta.1 (parseable, suffix), v1.0.0 (current)]`. `runGenerate` with `--tag v1.0.0` (no `--since`) throws an error whose message contains `--since v0.9.0-beta.1`. Purpose: regression guard on the glue code in `generate.ts`.

If `tests/cli/commands/generate.test.ts` does not already exist or would require significant harness scaffolding, skip it — the two unit suites above are sufficient. To be confirmed when writing the plan.

**Regressions to verify by running the full suite:**
- `findPreviousTag` cases (unchanged).
- `parseTag` cases (unchanged).
- `--since` flow (should never reach the new code path).
- Existing `generate` happy-path tests (the `.map + .filter` → `for` loop refactor is semantically equivalent but exercised by every `generate` test).

## Risks & edge cases

- **Unrelated legacy tags** (e.g., a stray `docker-v1.0.0` in a repo whose tagFormat is `release/{version}`): would be flagged as a format-mismatch orphan. Remediation: `--since <right-tag>`. Acceptable per decision #2.
- **First release of a *new* client prefix in an existing multi-client repo**: e.g., config already has `desktop` tags, user tags first `mobile-v1.0.0`. `findPreviousTag` returns null (no `mobile` tags). Suffix orphan check: no same-prefix suffixed tags → null. Unparseable check: `desktop-v1.0.0` is parseable → unparseableTags is empty. Result: `{ null, null }` → proceed as genuine first release. **Correct.**
- **Non-standard tagFormat change where new tags still parse as old tags** — e.g., user had `v1.0.0` and now uses `v{version}` (same thing). No migration, no orphans. **No-op.**
- **Annotated vs lightweight tag dates**: `createdAt` comes from the provider's initial tag listing, before `upgradeTagDate` is called. That's fine — we only use it for picking "most recent" and for display in the error; the displayed date is good enough, and an annotated-date upgrade happens later only for tags that actually flow into the pipeline.
- **Zero tags in the repo at all**: `findPreviousTag` returns null, `collectOrphanTags` returns `{ null, null }` → proceed as genuine first release. **Unchanged behavior.**

## Version + docs

- Patch bump: `1.9.3` → `1.9.4`. No API surface changes. User-visible behavior change: CI runs that previously "succeeded" on the first post-migration tag (by producing a gigantic notes file) will now abort with an actionable message. This is a bug fix; mention in the changelog entry.
- `CHANGELOG.md`: new `1.9.4` section. Title: "Detect tag-format migrations in `generate`". Describe the new error, note that `--since` remains the escape hatch, reference ROADMAP F11.
- `README.md`: if the README has a "Troubleshooting" or "FAQ" subsection about first-release detection, add a short note. Otherwise leave README unchanged — the error message itself is self-documenting. To be confirmed when writing the plan.
- `docs/ROADMAP.md`: flip F11 to `[x]`.

## Out of scope / deferred

- Prefix-aware matching for unparseable tags (decision #2 chose the simple path).
- A `--allow-orphans` or `--force-first-release` flag (decision #4 chose no new flag).
- Warnings at `validate` time for orphan tags discovered before a `generate` run — could be a natural F-series follow-up, but is not required for F11.
- Any changes to how `collectIssues` interprets `previousTag === null` (we're short-circuiting before that call; its behavior is untouched).
