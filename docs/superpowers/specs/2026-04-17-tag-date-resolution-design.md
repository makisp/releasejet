# Tag Date Resolution — Design Spec

**Date:** 2026-04-17
**Status:** Approved, ready for implementation plan
**Version target:** v1.9.1 (bugfix release)

## Problem

Both provider clients treat `tag.createdAt` as the underlying commit's date. For
**lightweight tags** (GitLab UI default, most CI-driven workflows), this is
wrong: a tag's real creation time can be minutes, days, or weeks after its
target commit.

The tool uses `tag.createdAt` as the upper bound when filtering issues by
`closedAt`. When a lightweight tag points at a commit that predates one or more
issue closures, those issues are silently dropped from the release notes.

**Observed failure (debug trace excerpt):**

```
Current tag: client2-v11.0.0 createdAt=2026-04-17T10:20:46+03:00  (actually commit date)
Issue #72 closedAt=2026-04-17T07:21:13Z  (27s after the "tag date")
Issue #70 closedAt=2026-04-17T07:21:19Z  (33s after)
Issue #69 closedAt=2026-04-17T07:21:24Z  (38s after)
Issue #71 closedAt=2026-04-17T07:21:33Z  (47s after)
After closedAt filter: 0 issues remain
```

The bug is silent whenever a commit is newer than every issue closed for that
release (the "prepare a bump commit, then tag" workflow). It bites whenever
issues are closed after the tagged commit — e.g., GitLab UI tags, CI auto-tags,
or late hotfixes.

Both `src/gitlab/client.ts` and `src/github/client.ts` exhibit the same bug.

## Goals

1. Resolve a tag's actual creation time when the provider API gives us enough
   information (annotated tags, existing releases).
2. For lightweight tags without a release, use a **robust fallback** that
   captures the common "close issues and cut a release" workflow.
3. Warn the user when a fallback is used, so silent data loss becomes visible.
4. Fix GitHub and GitLab in a single cut.

## Non-Goals

- Changing the pipeline semantics. Window is still
  `(previousTag, currentTag]`, filter is still `closedAt`.
- Requiring users to switch to annotated tags. Lightweight tags must keep
  working.
- Rewriting `tag-parser.ts`. This spec is purely about `createdAt` resolution.

## Scope

| File | Change |
|---|---|
| `src/providers/types.ts` | Enrich the tag shape with `commitDate` + `dateSource` |
| `src/gitlab/client.ts` | Resolve annotated/release dates in `listTags()` |
| `src/github/client.ts` | Two-phase resolution: cheap `listTags()` + on-demand `resolveAnnotatedTagDate()` |
| `src/core/issue-collector.ts` | Use resolved dates; handle lightweight-tag fallback for upper bound |
| `src/cli/commands/generate.ts` | Call annotated resolver for current+previous tags; emit warning |
| `src/types.ts` | `TagInfo` gets `commitDate` + `dateSource` |
| `tests/` | Updated mocks + new coverage |

## Design

### 1. Tag date resolution

Every tag resolves to `{ createdAt, commitDate, dateSource }`.

```ts
type TagDateSource = 'annotated' | 'release' | 'commit';

interface RemoteTag {
  name: string;
  createdAt: string;        // resolved best-effort ISO timestamp
  commitDate: string;       // target commit's committer date (always available)
  dateSource: TagDateSource;
}
```

Priority (highest first):

| # | Source | Reliable? |
|---|---|---|
| 1 | `annotated` — annotated tag's tagger date | Yes |
| 2 | `release` — existing Release object's `created_at` | Yes |
| 3 | `commit` — commit committer date (current broken behavior, last resort) | No |

### 2. Window calculation

Let `currentTag` and `previousTag` be fully resolved.

**Upper bound (current tag):**

```
if currentTag.dateSource in ('annotated', 'release'):
    upper = currentTag.createdAt                     # trusted
else:  # 'commit' fallback — date is unreliable
    nextSamePrefixTag = next same-prefix tag by semver order
    if nextSamePrefixTag exists:
        upper = nextSamePrefixTag.createdAt          # bounded by next release
    else:
        upper = now()                                # latest tag → catch late closures
```

**Lower bound (previous tag):**

```
lower = previousTag.createdAt                        # trust whatever we resolved
```

The previous release's window ended at the same resolved date. Using it here
guarantees no gap and no double-count between consecutive releases.

**API `updatedAfter` param (intentionally broader than the window):**

```
updatedAfter = previousTag.commitDate                # earliest plausible time
```

The API filters on `updatedAt`, which can be ≥ `closedAt`. Using the commit
date (always ≤ actual tag date) guarantees every candidate issue comes back
from the API; the client-side `closedAt` filter does the precise work.

**Display "Released" date (generate.ts:187):**

```
date = currentTag.createdAt.split('T')[0]            # resolved date, any source
```

For commit-fallback this shows the commit date — same as what GitLab/GitHub's
own UI displays for the tag. We never show `now()` as the release date; that
would be confusing.

### 3. Provider implementations

#### GitLab (`src/gitlab/client.ts`)

One pass, in a single `listTags()` call:

```ts
async listTags(projectPath) {
  const [tags, releases] = await Promise.all([
    api.Tags.all(projectPath),
    api.ProjectReleases.all(projectPath).catch(() => []),  // optional
  ]);

  const releaseByTag = new Map(
    (releases as any[]).map(r => [r.tag_name, r.created_at])
  );

  return (tags as any[]).map(t => {
    const commitDate = t.commit?.created_at ?? '';
    if (t.created_at) {
      return {
        name: t.name,
        createdAt: t.created_at,
        commitDate,
        dateSource: 'annotated' as const,
      };
    }
    const releaseDate = releaseByTag.get(t.name);
    if (releaseDate) {
      return {
        name: t.name,
        createdAt: releaseDate,
        commitDate,
        dateSource: 'release' as const,
      };
    }
    return {
      name: t.name,
      createdAt: commitDate,
      commitDate,
      dateSource: 'commit' as const,
    };
  });
}
```

`ProjectReleases.all()` is wrapped in `.catch(() => [])` so a release-list
failure degrades to commit-date fallback rather than breaking `generate`.

GitLab doesn't need a separate annotated-resolver method — `Tags.all` already
surfaces `created_at` for annotated tags in the same response.

#### GitHub (`src/github/client.ts`)

Two-phase: a cheap `listTags()` that covers every tag, plus a narrow
`resolveAnnotatedTagDate()` that's called only for the current and previous
tags.

```ts
async listTags(projectPath) {
  const { owner, repo } = parseOwnerRepo(projectPath);
  const [{ data: tags }, releases] = await Promise.all([
    octokit.repos.listTags({ owner, repo, per_page: 100 }),
    octokit.repos.listReleases({ owner, repo, per_page: 100 })
      .then(r => r.data)
      .catch(() => []),
  ]);

  const releaseByTag = new Map(
    (releases as any[]).map(r => [r.tag_name, r.created_at])
  );

  const result: RemoteTag[] = [];
  for (const tag of tags) {
    const { data: commit } = await octokit.repos.getCommit({
      owner, repo, ref: tag.commit.sha,
    });
    const commitDate = commit.commit.committer?.date ?? '';
    const releaseDate = releaseByTag.get(tag.name);
    result.push({
      name: tag.name,
      createdAt: releaseDate ?? commitDate,
      commitDate,
      dateSource: releaseDate ? 'release' : 'commit',
    });
  }
  return result;
},

async resolveAnnotatedTagDate(projectPath, tagName) {
  const { owner, repo } = parseOwnerRepo(projectPath);
  try {
    const { data: ref } = await octokit.git.getRef({
      owner, repo, ref: `tags/${tagName}`,
    });
    if (ref.object.type !== 'tag') return null;   // lightweight
    const { data: tagObj } = await octokit.git.getTag({
      owner, repo, tag_sha: ref.object.sha,
    });
    return tagObj.tagger?.date ?? null;
  } catch {
    return null;
  }
}
```

The `generate` command calls `resolveAnnotatedTagDate` for the current and
previous tags only. When it returns a value, the tag's `createdAt` and
`dateSource` are upgraded in memory from `'commit'` to `'annotated'`.

Bounded API cost: 1 release-list call + 2 ref+tag lookups per `generate` run,
regardless of how many tags the repo has.

#### Provider interface

`ProviderClient` gains one optional method:

```ts
resolveAnnotatedTagDate?(
  projectPath: string,
  tagName: string,
): Promise<string | null>;
```

Optional because GitLab's `listTags` already returns enough info. `generate`
only calls it if present.

### 4. Warnings

When the current tag resolves to `'commit'` fallback, `generate` emits a single
warning to stderr after the spinner resolves, before the markdown/JSON output:

```
⚠️  Tag "client2-v11.0.0" is lightweight and has no associated release, so
   its exact creation time isn't available. Using commit date as lower
   reference and the current time as the upper bound, which may include
   any issues closed since the commit.

   For precise timing, use annotated tags (`git tag -a <name> -m "..."`)
   or publish the release (`releasejet generate --publish`) before
   regenerating notes.
```

Rules:
- Emitted only for the current tag (not historic lightweight tags).
- Printed to stderr (stdout stays clean for `--format json` consumers).
- Not suppressed in `--quiet` mode — this is a correctness signal.

### 5. Debug output

`--debug` gets the resolution source tagged explicitly:

```
[DEBUG] Current tag: {"raw":"client2-v11.0.0","prefix":"client2",
        "version":"11.0.0","createdAt":"2026-04-17T10:45:00Z",
        "commitDate":"2026-04-17T07:20:46Z","dateSource":"commit"}
[DEBUG] Upper bound: 2026-04-17T10:45:00Z (source: commit → now())
[DEBUG] Lower bound: 2026-04-09T19:52:20Z (source: commit)
```

## Edge Cases

| # | Case | Behavior |
|---|---|---|
| 1 | First release (no previous tag) | `previousTag === null` → lower bound = epoch. API `updatedAfter` omitted. Unchanged. |
| 2 | `--since <tag>` flag | The `--since` tag goes through the same annotated-resolution path as the auto-detected previous tag. No special casing. |
| 3 | Tag is annotated **and** has a Release | `annotated` wins over `release`. Tagger date is set at tag creation; release date can be published later. |
| 4 | Inverted window (`upper ≤ lower`) | Warn, return empty issue set rather than throw. Shouldn't happen in practice. |
| 5 | Commit date is in the future (clock skew) | `upper = max(commitDate, now())` still gives the commit date. Acceptable. |
| 6 | Current tag lightweight, next same-prefix tag also lightweight | Upper = next tag's commit date. Bounded and consistent across regenerations. |
| 7 | `--publish` lifecycle | First generate: `dateSource='commit'` + warning. After publish, Release exists. Re-generate: `dateSource='release'`, no warning. Self-healing. |
| 8 | GitHub tag pagination (>100 tags) | Existing limitation, not introduced here. Follow-up if it bites. |
| 9 | Mocked clients in tests | All existing `listTags()` mocks need the two new fields. Mechanical. |

Non-concerns: sub-second timezone slop, closed-reopened-closed issues (current
`closedAt` is authoritative).

## Testing

### New unit tests

`tests/gitlab/client.test.ts`:
- Annotated tag (top-level `created_at` present) → `dateSource='annotated'`
- Lightweight tag, no release → `dateSource='commit'`
- Lightweight tag, matching release → `dateSource='release'`
- Annotated tag with a release → `dateSource='annotated'` (precedence)
- `ProjectReleases.all()` throws → degrades to commit-date fallback without error
- Every returned tag carries both `createdAt` and `commitDate`

`tests/github/client.test.ts`:
- Same four precedence cases via two-phase resolution
- `resolveAnnotatedTagDate` returns `null` for lightweight tags
- `resolveAnnotatedTagDate` returns `tagger.date` for annotated tags
- `resolveAnnotatedTagDate` returns `null` on API error (doesn't throw)

### Updated unit tests

`tests/core/issue-collector.test.ts`:
- Current tag `dateSource='annotated'` → upper = `createdAt` (no `now()`)
- Current tag `dateSource='commit'`, no next same-prefix tag → upper = `now()`
- Current tag `dateSource='commit'`, next same-prefix tag exists → upper = next `createdAt`
- Lower bound = `previousTag.createdAt` (never `commitDate`)
- API `updatedAfter` = `previousTag.commitDate`
- Inverted window → empty result + warning

### Regression test

Mirror the debug trace that triggered this spec: lightweight `client2-v11.0.0`
at commit time `T`, four issues closed `T+27s` through `T+47s`. All four
present in the output. Lives under
`describe('lightweight tag with late-closed issues')`.

### Existing test sweep

Every mock returning `listTags() → { name, createdAt }` needs `commitDate` and
`dateSource` added. Expected touch-points: `tests/github/*`,
`tests/gitlab/*`, `tests/cli/*`, `tests/core/tag-parser.test.ts`. Roughly
20–30 spots; mechanical.

### Manual verification (tracked in the implementation plan)

- `npm run dev -- generate --tag client2-v11.0.0 --dry-run --debug` against
  the GitLab test repo → returns all 4 issues, shows
  `dateSource: commit → now()`.
- Create an annotated tag (`git tag -a`) on a GitHub repo → resolves to
  `annotated`, no warning.
- Publish a release, delete the release, regenerate → first run: `release`;
  second: `commit` + warning.

## Release

- Version bump: **v1.9.1** (patch — this is a bugfix)
- CHANGELOG entry:

  > ### Fixed
  >
  > - Lightweight tags no longer cause issues closed after the tagged commit
  >   to be dropped from release notes. The tool now uses annotated tag dates
  >   or release dates when available, and falls back to the current time for
  >   the latest lightweight tag so recently closed issues are captured.

## Next step

Hand off to the `writing-plans` skill to produce the implementation plan.
