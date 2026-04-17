# Tag Date Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix silent issue drops in release notes caused by lightweight tags, by resolving the real tag creation time from annotated tagger date or existing Release objects, with a robust fallback (next same-prefix tag, or `now()` for the latest tag).

**Architecture:** Enrich the tag shape with `commitDate` + `dateSource` so downstream code can tell an authoritative date from a fallback. Providers resolve the best available source in `listTags()`; GitHub adds a selective `resolveAnnotatedTagDate()` for the current+previous tags. The collector applies the lightweight fallback for the upper bound. The CLI warns when falling back.

**Tech Stack:** TypeScript (ESM), vitest, Octokit (GitHub), Gitbeaker (GitLab).

**Spec:** `docs/superpowers/specs/2026-04-17-tag-date-resolution-design.md`

**Branch:** `fix/tag-date-resolution` (already created, spec already committed).

**Target version:** v1.9.1 (patch).

---

## File Structure

| File | Role |
|---|---|
| `src/providers/types.ts` | Source of truth for `RemoteTag` + `ProviderClient` interface (adds `resolveAnnotatedTagDate`) |
| `src/types.ts` | `TagInfo` gets `commitDate` + `dateSource` |
| `src/gitlab/client.ts` | `listTags` merges `ProjectReleases` and sets `dateSource`; no annotated resolver method (single call is enough) |
| `src/github/client.ts` | `listTags` merges `listReleases` and sets `dateSource`; adds `resolveAnnotatedTagDate` |
| `src/core/tag-parser.ts` | New `findNextSamePrefixTag` helper (colocated with `findPreviousTag`) |
| `src/core/issue-collector.ts` | Uses resolved `createdAt` for bounds; applies next-tag or `now()` fallback when `dateSource='commit'`; API `updatedAfter` uses `commitDate` |
| `src/cli/commands/generate.ts` | Calls `resolveAnnotatedTagDate` for current+previous; emits stderr warning on `commit` fallback for current tag; passes `allTags` to collector |
| `tests/**/*.test.ts` | Mocks and `TagInfo` literals updated; new GitHub/GitLab coverage; new regression test |
| `package.json` + `CHANGELOG.md` | v1.9.1 bump + Fixed entry |

---

## Task 1: Type plumbing — extend `RemoteTag` and `TagInfo`, keep behavior unchanged

Make every provider return `{ name, createdAt, commitDate, dateSource }` where `createdAt === commitDate` and `dateSource === 'commit'`. This is a pure type / plumbing change: no behavior changes, all existing tests still assert what they asserted before, plus the two new fields.

**Files:**
- Modify: `src/providers/types.ts`
- Modify: `src/types.ts`
- Modify: `src/gitlab/client.ts:45-51`
- Modify: `src/github/client.ts:25-38`
- Modify: `tests/gitlab/client.test.ts:26-40`
- Modify: `tests/github/client.test.ts:38-58`
- Modify: `tests/core/issue-collector.test.ts:28-42`
- Modify: any other test constructing `TagInfo` literals or mocking `listTags` return shape

- [ ] **Step 1: Update `src/providers/types.ts`**

Replace the `listTags` signature and export the new `TagDateSource` / `RemoteTag` types:

```ts
import type { Issue, Milestone } from '../types.js';

export type TagDateSource = 'annotated' | 'release' | 'commit';

export interface RemoteTag {
  name: string;
  createdAt: string;
  commitDate: string;
  dateSource: TagDateSource;
}

export interface ProviderClient {
  listTags(projectPath: string): Promise<RemoteTag[]>;

  resolveAnnotatedTagDate?(
    projectPath: string,
    tagName: string,
  ): Promise<string | null>;

  listIssues(
    projectPath: string,
    options: {
      state?: 'opened' | 'closed';
      updatedAfter?: string;
      labels?: string;
    },
  ): Promise<Issue[]>;

  listPullRequests(
    projectPath: string,
    options: {
      state?: 'opened' | 'closed';
      updatedAfter?: string;
      labels?: string;
    },
  ): Promise<Issue[]>;

  createRelease(
    projectPath: string,
    options: {
      tagName: string;
      name: string;
      description: string;
      milestones?: string[];
    },
  ): Promise<void>;

  listMilestones(
    projectPath: string,
    options?: { search?: string; state?: string },
  ): Promise<Milestone[]>;
}
```

- [ ] **Step 2: Update `src/types.ts`**

Extend `TagInfo`:

```ts
import type { TagDateSource } from './providers/types.js';

export interface TagInfo extends ParsedTag {
  createdAt: string;
  commitDate: string;
  dateSource: TagDateSource;
}
```

(Leave all other exports untouched.)

- [ ] **Step 3: Update `src/gitlab/client.ts:45-51`**

Replace the `listTags` body so every tag carries the three fields, still using commit-date for everything:

```ts
async listTags(projectPath) {
  const tags = await api.Tags.all(projectPath);
  return tags.map((t: any) => {
    const commitDate = t.commit?.created_at ?? '';
    return {
      name: t.name,
      createdAt: commitDate,
      commitDate,
      dateSource: 'commit' as const,
    };
  });
},
```

- [ ] **Step 4: Update `src/github/client.ts:25-38`**

Same idea — add the two new fields, commit-date fallback:

```ts
async listTags(projectPath) {
  const { owner, repo } = parseOwnerRepo(projectPath);
  const { data: tags } = await octokit.repos.listTags({ owner, repo, per_page: 100 });

  const result: RemoteTag[] = [];
  for (const tag of tags) {
    const { data: commit } = await octokit.repos.getCommit({ owner, repo, ref: tag.commit.sha });
    const commitDate = commit.commit.committer?.date ?? '';
    result.push({
      name: tag.name,
      createdAt: commitDate,
      commitDate,
      dateSource: 'commit',
    });
  }
  return result;
},
```

Add the `RemoteTag` import at the top:

```ts
import type { ProviderClient, RemoteTag } from '../providers/types.js';
```

- [ ] **Step 5: Find and update every test that constructs a `TagInfo` literal or mocks `listTags` return shape**

Run:
```bash
grep -rn "createdAt:" tests/ | grep -v ".d.ts"
```

For each hit, if it's a `TagInfo` or `listTags` mock return, add the two new fields. Pattern:

**Before:**
```ts
{ name: 'v1.0.0', createdAt: '2026-04-08T10:00:00Z' }
```
**After:**
```ts
{ name: 'v1.0.0', createdAt: '2026-04-08T10:00:00Z', commitDate: '2026-04-08T10:00:00Z', dateSource: 'commit' as const }
```

**Before (TagInfo literal):**
```ts
const currentTag: TagInfo = {
  raw: 'mobile-v0.1.17',
  prefix: 'mobile',
  version: '0.1.17',
  suffix: null,
  createdAt: '2026-04-08T10:00:00Z',
};
```
**After:**
```ts
const currentTag: TagInfo = {
  raw: 'mobile-v0.1.17',
  prefix: 'mobile',
  version: '0.1.17',
  suffix: null,
  createdAt: '2026-04-08T10:00:00Z',
  commitDate: '2026-04-08T10:00:00Z',
  dateSource: 'commit',
};
```

Known touch-points (verify with grep above — there may be more):
- `tests/core/issue-collector.test.ts:28-42` (two TagInfo literals)
- `tests/core/issue-collector.test.ts:79-85` (singleTag)
- `tests/gitlab/client.test.ts:26-40`
- `tests/github/client.test.ts:38-58`
- `tests/core/tag-parser.test.ts` (any `findPreviousTag` call sites)

- [ ] **Step 6: Run the full test suite**

```bash
npm test
```

Expected: all previously-passing tests still pass. Type errors only where you missed a literal — fix those, re-run.

- [ ] **Step 7: Commit**

```bash
git add src/providers/types.ts src/types.ts src/gitlab/client.ts src/github/client.ts tests/
git commit -m "refactor(tags): extend RemoteTag and TagInfo with commitDate and dateSource

Adds the plumbing for tag-date source tracking. Every tag carries
commitDate alongside createdAt and a dateSource discriminator
('annotated' | 'release' | 'commit'). Providers still return commit
dates in this commit — subsequent commits add the annotated and
release resolution paths.

No behavior change."
```

---

## Task 2: GitLab — resolve annotated and release dates in `listTags`

**Files:**
- Modify: `src/gitlab/client.ts:45-55`
- Modify: `tests/gitlab/client.test.ts` (new describe block)

- [ ] **Step 1: Write failing tests in `tests/gitlab/client.test.ts`**

Expand the existing `describe('listTags', ...)` block. Also mock `ProjectReleases.all`:

```ts
// Add at top with other mocks:
const mockReleasesAll = vi.fn();

// Extend the Gitlab mock return object:
vi.mock('@gitbeaker/rest', () => ({
  Gitlab: vi.fn().mockImplementation(() => ({
    Tags: { all: mockTagsAll },
    Issues: { all: mockIssuesAll },
    ProjectReleases: { create: mockReleasesCreate, edit: mockReleasesEdit, all: mockReleasesAll },
    ProjectMilestones: { all: mockMilestonesAll },
  })),
}));
```

Then add these tests inside `describe('listTags', ...)`:

```ts
it('uses annotated tag date when top-level created_at is present', async () => {
  mockTagsAll.mockResolvedValue([
    {
      name: 'v1.0.0',
      created_at: '2026-04-10T12:00:00Z',             // annotated tagger date
      commit: { created_at: '2026-04-01T10:00:00Z' }, // older commit
    },
  ]);
  mockReleasesAll.mockResolvedValue([]);

  const client = createGitLabClient('https://gitlab.example.com', 'token');
  const tags = await client.listTags('owner/repo');

  expect(tags).toEqual([{
    name: 'v1.0.0',
    createdAt: '2026-04-10T12:00:00Z',
    commitDate: '2026-04-01T10:00:00Z',
    dateSource: 'annotated',
  }]);
});

it('uses release date when tag is lightweight but release exists', async () => {
  mockTagsAll.mockResolvedValue([
    {
      name: 'v1.0.0',
      created_at: null,                                // lightweight
      commit: { created_at: '2026-04-01T10:00:00Z' },
    },
  ]);
  mockReleasesAll.mockResolvedValue([
    { tag_name: 'v1.0.0', created_at: '2026-04-12T09:00:00Z' },
  ]);

  const client = createGitLabClient('https://gitlab.example.com', 'token');
  const tags = await client.listTags('owner/repo');

  expect(tags).toEqual([{
    name: 'v1.0.0',
    createdAt: '2026-04-12T09:00:00Z',
    commitDate: '2026-04-01T10:00:00Z',
    dateSource: 'release',
  }]);
});

it('falls back to commit date for lightweight tag with no release', async () => {
  mockTagsAll.mockResolvedValue([
    {
      name: 'v1.0.0',
      created_at: null,
      commit: { created_at: '2026-04-01T10:00:00Z' },
    },
  ]);
  mockReleasesAll.mockResolvedValue([]);

  const client = createGitLabClient('https://gitlab.example.com', 'token');
  const tags = await client.listTags('owner/repo');

  expect(tags[0].dateSource).toBe('commit');
  expect(tags[0].createdAt).toBe('2026-04-01T10:00:00Z');
  expect(tags[0].commitDate).toBe('2026-04-01T10:00:00Z');
});

it('prefers annotated over release when both are available', async () => {
  mockTagsAll.mockResolvedValue([
    {
      name: 'v1.0.0',
      created_at: '2026-04-10T12:00:00Z',
      commit: { created_at: '2026-04-01T10:00:00Z' },
    },
  ]);
  mockReleasesAll.mockResolvedValue([
    { tag_name: 'v1.0.0', created_at: '2026-04-15T09:00:00Z' },
  ]);

  const client = createGitLabClient('https://gitlab.example.com', 'token');
  const tags = await client.listTags('owner/repo');

  expect(tags[0].dateSource).toBe('annotated');
  expect(tags[0].createdAt).toBe('2026-04-10T12:00:00Z');
});

it('degrades to commit-date fallback when ProjectReleases.all throws', async () => {
  mockTagsAll.mockResolvedValue([
    { name: 'v1.0.0', created_at: null, commit: { created_at: '2026-04-01T10:00:00Z' } },
  ]);
  mockReleasesAll.mockRejectedValue(new Error('403 Forbidden'));

  const client = createGitLabClient('https://gitlab.example.com', 'token');
  const tags = await client.listTags('owner/repo');

  expect(tags[0].dateSource).toBe('commit');
});
```

Also update the existing test on line 26-40 to include `created_at: null` (or a date) on each tag and mock `ProjectReleases.all` to return `[]`.

- [ ] **Step 2: Run tests — expect failures**

```bash
npx vitest run tests/gitlab/client.test.ts
```

Expected: the 5 new tests fail. Messages will reference `dateSource` mismatches (current code always returns `'commit'`).

- [ ] **Step 3: Implement — replace `listTags` in `src/gitlab/client.ts:45-55`**

```ts
async listTags(projectPath) {
  const [tags, releases] = await Promise.all([
    api.Tags.all(projectPath),
    (api.ProjectReleases.all(projectPath) as Promise<any[]>).catch(() => [] as any[]),
  ]);

  const releaseByTag = new Map<string, string>(
    (releases as any[]).map((r) => [r.tag_name, r.created_at]),
  );

  return (tags as any[]).map((t) => {
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
},
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npx vitest run tests/gitlab/client.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/gitlab/client.ts tests/gitlab/client.test.ts
git commit -m "feat(gitlab): resolve annotated and release dates in listTags

GitLab's Tags API returns top-level created_at for annotated tags;
merges ProjectReleases.all() for lightweight tags that have a
published release. Falls back to commit date (previous behavior)
otherwise. ProjectReleases failures degrade gracefully."
```

---

## Task 3: GitHub — resolve release dates in `listTags`

**Files:**
- Modify: `src/github/client.ts:25-38`
- Modify: `tests/github/client.test.ts`

- [ ] **Step 1: Write failing tests**

Add the releases mock at the top of `tests/github/client.test.ts`:

```ts
const mockListReleases = vi.fn();

// Extend the Octokit mock:
vi.mock('@octokit/rest', () => ({
  Octokit: vi.fn().mockImplementation(() => ({
    repos: {
      listTags: mockListTags,
      getCommit: mockGetCommit,
      createRelease: mockCreateRelease,
      getReleaseByTag: mockGetReleaseByTag,
      updateRelease: mockUpdateRelease,
      listReleases: mockListReleases,
    },
    issues: { listForRepo: mockListForRepo, listMilestones: mockListMilestones },
    pulls: { list: mockPullsList },
    git: { getRef: vi.fn(), getTag: vi.fn() }, // placeholders for Task 4
  })),
}));
```

Update the existing test on lines 38-58 so `mockListReleases` returns `{ data: [] }`:

```ts
it('maps API response and fetches commit dates', async () => {
  mockListTags.mockResolvedValue({
    data: [
      { name: 'v1.0.0', commit: { sha: 'abc123' } },
      { name: 'v0.9.0', commit: { sha: 'def456' } },
    ],
  });
  mockListReleases.mockResolvedValue({ data: [] });
  mockGetCommit
    .mockResolvedValueOnce({ data: { commit: { committer: { date: '2026-04-08T10:00:00Z' } } } })
    .mockResolvedValueOnce({ data: { commit: { committer: { date: '2026-03-01T10:00:00Z' } } } });

  const client = createGitHubClient('https://github.com', 'token');
  const tags = await client.listTags('owner/repo');

  expect(tags).toEqual([
    { name: 'v1.0.0', createdAt: '2026-04-08T10:00:00Z', commitDate: '2026-04-08T10:00:00Z', dateSource: 'commit' },
    { name: 'v0.9.0', createdAt: '2026-03-01T10:00:00Z', commitDate: '2026-03-01T10:00:00Z', dateSource: 'commit' },
  ]);
});
```

Add new tests inside `describe('listTags', ...)`:

```ts
it('uses release date when a Release exists for the tag', async () => {
  mockListTags.mockResolvedValue({
    data: [{ name: 'v1.0.0', commit: { sha: 'abc' } }],
  });
  mockListReleases.mockResolvedValue({
    data: [{ tag_name: 'v1.0.0', created_at: '2026-04-12T09:00:00Z' }],
  });
  mockGetCommit.mockResolvedValueOnce({
    data: { commit: { committer: { date: '2026-04-01T10:00:00Z' } } },
  });

  const client = createGitHubClient('https://github.com', 'token');
  const tags = await client.listTags('owner/repo');

  expect(tags).toEqual([{
    name: 'v1.0.0',
    createdAt: '2026-04-12T09:00:00Z',
    commitDate: '2026-04-01T10:00:00Z',
    dateSource: 'release',
  }]);
});

it('degrades to commit-date fallback when listReleases throws', async () => {
  mockListTags.mockResolvedValue({
    data: [{ name: 'v1.0.0', commit: { sha: 'abc' } }],
  });
  mockListReleases.mockRejectedValue(new Error('404 Not Found'));
  mockGetCommit.mockResolvedValueOnce({
    data: { commit: { committer: { date: '2026-04-01T10:00:00Z' } } },
  });

  const client = createGitHubClient('https://github.com', 'token');
  const tags = await client.listTags('owner/repo');

  expect(tags[0].dateSource).toBe('commit');
});
```

- [ ] **Step 2: Run tests — expect failures**

```bash
npx vitest run tests/github/client.test.ts
```

Expected: the 2 new tests fail.

- [ ] **Step 3: Implement — replace `listTags` in `src/github/client.ts:25-38`**

```ts
async listTags(projectPath) {
  const { owner, repo } = parseOwnerRepo(projectPath);
  const [{ data: tags }, releases] = await Promise.all([
    octokit.repos.listTags({ owner, repo, per_page: 100 }),
    octokit.repos.listReleases({ owner, repo, per_page: 100 })
      .then((r) => r.data)
      .catch(() => [] as any[]),
  ]);

  const releaseByTag = new Map<string, string>(
    (releases as any[]).map((r) => [r.tag_name, r.created_at]),
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
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npx vitest run tests/github/client.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/github/client.ts tests/github/client.test.ts
git commit -m "feat(github): merge Release dates into listTags

One extra listReleases() call per generate() run. Tags that have a
published Release inherit its created_at; others keep the commit
date. Failures to fetch releases degrade to commit-date fallback."
```

---

## Task 4: GitHub — add `resolveAnnotatedTagDate`

**Files:**
- Modify: `src/github/client.ts` (new method)
- Modify: `tests/github/client.test.ts` (new describe block)

- [ ] **Step 1: Write failing tests**

Add at the top of the file, extend the git mocks:

```ts
const mockGetRef = vi.fn();
const mockGetTag = vi.fn();

vi.mock('@octokit/rest', () => ({
  Octokit: vi.fn().mockImplementation(() => ({
    repos: { /* same as before */ },
    issues: { /* same */ },
    pulls: { /* same */ },
    git: { getRef: mockGetRef, getTag: mockGetTag },
  })),
}));
```

Add a new `describe` block at the bottom of the file:

```ts
describe('resolveAnnotatedTagDate', () => {
  it('returns tagger date for annotated tags', async () => {
    mockGetRef.mockResolvedValue({
      data: { object: { type: 'tag', sha: 'tag-sha-123' } },
    });
    mockGetTag.mockResolvedValue({
      data: { tagger: { date: '2026-04-10T12:00:00Z' } },
    });

    const client = createGitHubClient('https://github.com', 'token');
    const date = await client.resolveAnnotatedTagDate!('owner/repo', 'v1.0.0');

    expect(date).toBe('2026-04-10T12:00:00Z');
    expect(mockGetRef).toHaveBeenCalledWith({
      owner: 'owner', repo: 'repo', ref: 'tags/v1.0.0',
    });
    expect(mockGetTag).toHaveBeenCalledWith({
      owner: 'owner', repo: 'repo', tag_sha: 'tag-sha-123',
    });
  });

  it('returns null for lightweight tags (ref.object.type !== "tag")', async () => {
    mockGetRef.mockResolvedValue({
      data: { object: { type: 'commit', sha: 'commit-sha' } },
    });

    const client = createGitHubClient('https://github.com', 'token');
    const date = await client.resolveAnnotatedTagDate!('owner/repo', 'v1.0.0');

    expect(date).toBeNull();
    expect(mockGetTag).not.toHaveBeenCalled();
  });

  it('returns null on API error', async () => {
    mockGetRef.mockRejectedValue(new Error('404'));

    const client = createGitHubClient('https://github.com', 'token');
    const date = await client.resolveAnnotatedTagDate!('owner/repo', 'v1.0.0');

    expect(date).toBeNull();
  });

  it('returns null when tagger is missing', async () => {
    mockGetRef.mockResolvedValue({
      data: { object: { type: 'tag', sha: 'tag-sha-123' } },
    });
    mockGetTag.mockResolvedValue({ data: {} });

    const client = createGitHubClient('https://github.com', 'token');
    const date = await client.resolveAnnotatedTagDate!('owner/repo', 'v1.0.0');

    expect(date).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests — expect failures**

```bash
npx vitest run tests/github/client.test.ts
```

Expected: the 4 new tests fail (`resolveAnnotatedTagDate is not a function`).

- [ ] **Step 3: Implement — add the method inside the `return { ... }` block of `createGitHubClient`**

Place alongside the other methods in `src/github/client.ts`:

```ts
async resolveAnnotatedTagDate(projectPath, tagName) {
  const { owner, repo } = parseOwnerRepo(projectPath);
  try {
    const { data: ref } = await octokit.git.getRef({
      owner, repo, ref: `tags/${tagName}`,
    });
    if (ref.object.type !== 'tag') return null;
    const { data: tagObj } = await octokit.git.getTag({
      owner, repo, tag_sha: ref.object.sha,
    });
    return tagObj.tagger?.date ?? null;
  } catch {
    return null;
  }
},
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npx vitest run tests/github/client.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/github/client.ts tests/github/client.test.ts
git commit -m "feat(github): add resolveAnnotatedTagDate

Optional provider method. Uses git.getRef + git.getTag to surface
an annotated tag's tagger date. Returns null for lightweight tags
and on API errors — callers degrade silently to existing behavior."
```

---

## Task 5: `findNextSamePrefixTag` helper

**Files:**
- Modify: `src/core/tag-parser.ts`
- Modify: `tests/core/tag-parser.test.ts`

- [ ] **Step 1: Write failing tests**

Add at the bottom of `tests/core/tag-parser.test.ts`:

```ts
describe('findNextSamePrefixTag', () => {
  const make = (raw: string, prefix: string | null, version: string, createdAt: string): TagInfo => ({
    raw, prefix, version, suffix: null, createdAt,
    commitDate: createdAt, dateSource: 'commit',
  });

  it('returns the next-higher same-prefix tag by semver', () => {
    const current = make('client2-v11.0.0', 'client2', '11.0.0', '2026-04-17T10:00:00Z');
    const tags = [
      make('client2-v10.1.0', 'client2', '10.1.0', '2026-04-09T00:00:00Z'),
      current,
      make('client2-v11.1.0', 'client2', '11.1.0', '2026-04-20T10:00:00Z'),
      make('client2-v12.0.0', 'client2', '12.0.0', '2026-04-25T10:00:00Z'),
    ];

    const next = findNextSamePrefixTag(tags, current);
    expect(next?.raw).toBe('client2-v11.1.0');
  });

  it('returns null when current is the latest same-prefix tag', () => {
    const current = make('client2-v11.0.0', 'client2', '11.0.0', '2026-04-17T10:00:00Z');
    const tags = [
      make('client1-v15.0.0', 'client1', '15.0.0', '2026-04-09T00:00:00Z'),
      make('client2-v10.1.0', 'client2', '10.1.0', '2026-04-01T00:00:00Z'),
      current,
    ];

    expect(findNextSamePrefixTag(tags, current)).toBeNull();
  });

  it('ignores different-prefix tags even if semver is higher', () => {
    const current = make('client2-v11.0.0', 'client2', '11.0.0', '2026-04-17T10:00:00Z');
    const tags = [
      current,
      make('client1-v20.0.0', 'client1', '20.0.0', '2026-04-20T00:00:00Z'),
    ];

    expect(findNextSamePrefixTag(tags, current)).toBeNull();
  });

  it('handles null prefix (single-client mode)', () => {
    const current = make('v1.0.0', null, '1.0.0', '2026-04-17T10:00:00Z');
    const tags = [
      current,
      make('v1.1.0', null, '1.1.0', '2026-04-20T10:00:00Z'),
      make('client1-v5.0.0', 'client1', '5.0.0', '2026-04-25T10:00:00Z'),
    ];

    const next = findNextSamePrefixTag(tags, current);
    expect(next?.raw).toBe('v1.1.0');
  });

  it('ignores tags with suffix (pre-releases)', () => {
    const current = make('v1.0.0', null, '1.0.0', '2026-04-17T10:00:00Z');
    const tags = [
      current,
      { ...make('v1.1.0-beta', null, '1.1.0', '2026-04-20T10:00:00Z'), suffix: '-beta' },
      make('v1.2.0', null, '1.2.0', '2026-04-25T10:00:00Z'),
    ];

    expect(findNextSamePrefixTag(tags, current)?.raw).toBe('v1.2.0');
  });
});
```

Make sure `findNextSamePrefixTag` is imported at the top alongside `findPreviousTag`.

- [ ] **Step 2: Run tests — expect failures**

```bash
npx vitest run tests/core/tag-parser.test.ts
```

Expected: import error (`findNextSamePrefixTag` is not exported).

- [ ] **Step 3: Implement — add at the end of `src/core/tag-parser.ts`**

```ts
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
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npx vitest run tests/core/tag-parser.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/core/tag-parser.ts tests/core/tag-parser.test.ts
git commit -m "feat(tag-parser): add findNextSamePrefixTag helper

Mirrors findPreviousTag but looks forward. Returns the lowest-semver
same-prefix tag whose version is greater than current.version and
whose suffix is null. Used by the collector to bound the upper end
of the window when the current tag's date source is 'commit'."
```

---

## Task 6: Issue collector — lightweight fallback for upper bound

**Files:**
- Modify: `src/core/issue-collector.ts`
- Modify: `tests/core/issue-collector.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `tests/core/issue-collector.test.ts`:

```ts
describe('collectIssues — tag date resolution', () => {
  let client: ProviderClient;
  beforeEach(() => { client = createMockClient(); });

  const mkTag = (raw: string, prefix: string | null, version: string, createdAt: string, dateSource: 'annotated' | 'release' | 'commit' = 'commit'): TagInfo => ({
    raw, prefix, version, suffix: null, createdAt,
    commitDate: dateSource === 'commit' ? createdAt : '2026-04-01T00:00:00Z',
    dateSource,
  });

  it('upper bound = createdAt when dateSource is annotated (no now() involvement)', async () => {
    const current = mkTag('v1.0.0', null, '1.0.0', '2026-04-08T10:00:00Z', 'annotated');

    vi.mocked(client.listIssues).mockResolvedValue([
      { number: 1, title: 'Before tag', labels: ['feature'], closedAt: '2026-04-08T09:00:00Z', webUrl: '', milestone: null, author: null, assignee: null, closedBy: null },
      { number: 2, title: 'After annotated tag', labels: ['feature'], closedAt: '2026-04-08T11:00:00Z', webUrl: '', milestone: null, author: null, assignee: null, closedBy: null },
    ]);

    const result = await collectIssues(client, 'owner/repo', current, null, [current], { ...config, clients: [] });

    const all = [...Object.values(result.categorized).flat(), ...result.uncategorized];
    expect(all.map(i => i.number)).toEqual([1]);
  });

  it('upper bound = now() when current is latest and dateSource is commit', async () => {
    const current = mkTag('v1.0.0', null, '1.0.0', '2026-04-08T10:00:00Z', 'commit');
    // Issue closed 30s AFTER commit/tag, mirrors the real bug
    vi.mocked(client.listIssues).mockResolvedValue([
      { number: 1, title: 'Late-close', labels: ['feature'], closedAt: '2026-04-08T10:00:30Z', webUrl: '', milestone: null, author: null, assignee: null, closedBy: null },
    ]);

    const result = await collectIssues(client, 'owner/repo', current, null, [current], { ...config, clients: [] });

    const all = [...Object.values(result.categorized).flat(), ...result.uncategorized];
    expect(all.map(i => i.number)).toEqual([1]);
  });

  it('upper bound = next same-prefix tag when current is not the latest', async () => {
    const current = mkTag('v1.0.0', null, '1.0.0', '2026-04-08T10:00:00Z', 'commit');
    const next = mkTag('v1.1.0', null, '1.1.0', '2026-04-10T10:00:00Z', 'commit');

    vi.mocked(client.listIssues).mockResolvedValue([
      { number: 1, title: 'Before next', labels: ['feature'], closedAt: '2026-04-09T10:00:00Z', webUrl: '', milestone: null, author: null, assignee: null, closedBy: null },
      { number: 2, title: 'After next',  labels: ['feature'], closedAt: '2026-04-11T10:00:00Z', webUrl: '', milestone: null, author: null, assignee: null, closedBy: null },
    ]);

    const result = await collectIssues(client, 'owner/repo', current, null, [current, next], { ...config, clients: [] });

    const all = [...Object.values(result.categorized).flat(), ...result.uncategorized];
    expect(all.map(i => i.number)).toEqual([1]);
  });

  it('passes previousTag.commitDate to API updatedAfter (not createdAt)', async () => {
    const current = mkTag('v2.0.0', null, '2.0.0', '2026-04-15T10:00:00Z', 'annotated');
    const previous: TagInfo = {
      raw: 'v1.0.0', prefix: null, version: '1.0.0', suffix: null,
      createdAt: '2026-04-10T12:00:00Z',     // annotated tagger date
      commitDate: '2026-04-01T10:00:00Z',    // older commit
      dateSource: 'annotated',
    };

    await collectIssues(client, 'owner/repo', current, previous, [previous, current], { ...config, clients: [] });

    expect(client.listIssues).toHaveBeenCalledWith('owner/repo', {
      state: 'closed',
      updatedAfter: '2026-04-01T10:00:00Z',  // commitDate, not createdAt
      labels: undefined,
    });
  });

  it('lower-bound filter uses previousTag.createdAt (resolved date)', async () => {
    const current = mkTag('v2.0.0', null, '2.0.0', '2026-04-15T10:00:00Z', 'annotated');
    const previous: TagInfo = {
      raw: 'v1.0.0', prefix: null, version: '1.0.0', suffix: null,
      createdAt: '2026-04-10T12:00:00Z',
      commitDate: '2026-04-01T10:00:00Z',
      dateSource: 'annotated',
    };

    vi.mocked(client.listIssues).mockResolvedValue([
      { number: 1, title: 'Between commit and tagger — excluded', labels: ['feature'], closedAt: '2026-04-05T00:00:00Z', webUrl: '', milestone: null, author: null, assignee: null, closedBy: null },
      { number: 2, title: 'After tagger — included',              labels: ['feature'], closedAt: '2026-04-11T00:00:00Z', webUrl: '', milestone: null, author: null, assignee: null, closedBy: null },
    ]);

    const result = await collectIssues(client, 'owner/repo', current, previous, [previous, current], { ...config, clients: [] });

    const all = [...Object.values(result.categorized).flat(), ...result.uncategorized];
    expect(all.map(i => i.number)).toEqual([2]);
  });
});
```

Also update the existing test on line 68-76 so the `updatedAfter` expectation uses the tag's `commitDate` (same value in this test since `dateSource='commit'`, but pass `allTags` = `[previousTag, currentTag]` to the new signature).

Update the "first release" test (line 100-108) with the new signature (pass `[currentTag]` as allTags).

Update the "label filter" test (line 78-98) similarly.

- [ ] **Step 2: Run tests — expect failures**

```bash
npx vitest run tests/core/issue-collector.test.ts
```

Expected: TypeScript errors about `collectIssues` not accepting `allTags`, and new test assertions failing.

- [ ] **Step 3: Implement — rewrite `collectIssues` signature and window logic in `src/core/issue-collector.ts`**

Replace the whole function:

```ts
import type { ProviderClient } from '../providers/types.js';
import type {
  TagInfo,
  ReleaseJetConfig,
  CategorizedIssues,
  Issue,
} from '../types.js';
import { findNextSamePrefixTag } from './tag-parser.js';

export async function collectIssues(
  client: ProviderClient,
  projectPath: string,
  currentTag: TagInfo,
  previousTag: TagInfo | null,
  allTags: TagInfo[],
  config: ReleaseJetConfig,
  debug: (...args: unknown[]) => void = () => {},
): Promise<CategorizedIssues> {
  const clientLabel = currentTag.prefix
    ? config.clients.find((c) => c.prefix === currentTag.prefix)?.label
    : undefined;

  // Upper bound: trust resolved createdAt for annotated/release; for commit
  // fallback, expand to next same-prefix tag's createdAt or now().
  let upperBoundIso: string;
  if (currentTag.dateSource === 'commit') {
    const next = findNextSamePrefixTag(allTags, currentTag);
    upperBoundIso = next ? next.createdAt : new Date().toISOString();
    debug(
      'Upper bound:', upperBoundIso,
      `(source: commit → ${next ? 'next same-prefix tag' : 'now()'})`,
    );
  } else {
    upperBoundIso = currentTag.createdAt;
    debug('Upper bound:', upperBoundIso, `(source: ${currentTag.dateSource})`);
  }

  // Lower bound: resolved createdAt of previous tag.
  const lowerBoundIso = previousTag?.createdAt;
  if (previousTag) {
    debug('Lower bound:', lowerBoundIso, `(source: ${previousTag.dateSource})`);
  }

  // API query: use previousTag.commitDate (always ≤ actual tag time) so we
  // don't miss issues whose updatedAt sits between commit and tag-creation.
  const updatedAfter = previousTag?.commitDate;

  debug('Client label filter:', clientLabel ?? 'none (single-client)');
  debug('API query: state=closed, updatedAfter=' + (updatedAfter ?? 'none'));

  const fetchOptions = {
    state: 'closed' as const,
    updatedAfter,
    labels: clientLabel,
  };

  const issues = config.source === 'pull_requests'
    ? await client.listPullRequests(projectPath, fetchOptions)
    : await client.listIssues(projectPath, fetchOptions);

  debug(`API returned ${issues.length} issues:`);
  for (const issue of issues) {
    debug(`  #${issue.number} "${issue.title}" closedAt=${issue.closedAt} labels=[${issue.labels.join(', ')}]`);
  }

  const upperBoundMs = new Date(upperBoundIso).getTime();
  const lowerBoundMs = lowerBoundIso
    ? new Date(lowerBoundIso).getTime()
    : null;

  // Inverted window guard.
  if (lowerBoundMs !== null && upperBoundMs <= lowerBoundMs) {
    debug('Inverted window — returning empty set');
    return { categorized: {}, uncategorized: [] };
  }

  const filtered = issues.filter((issue) => {
    if (!issue.closedAt) return false;
    const closed = new Date(issue.closedAt).getTime();
    if (closed > upperBoundMs) return false;
    if (lowerBoundMs !== null && closed <= lowerBoundMs) return false;
    return true;
  });

  debug(`After closedAt filter: ${filtered.length} issues remain`);

  const categoryLabels = Object.keys(config.categories);
  const categorized: Record<string, Issue[]> = {};
  const uncategorized: Issue[] = [];

  for (const issue of filtered) {
    const matchedLabel = issue.labels.find((l) => categoryLabels.includes(l));
    if (matchedLabel) {
      const heading = config.categories[matchedLabel];
      if (!categorized[heading]) categorized[heading] = [];
      categorized[heading].push(issue);
    } else {
      uncategorized.push(issue);
    }
  }

  return { categorized, uncategorized };
}

// detectMilestone unchanged — leave as-is
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npx vitest run tests/core/issue-collector.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/core/issue-collector.ts tests/core/issue-collector.test.ts
git commit -m "feat(collector): lightweight-tag fallback and resolved-date bounds

collectIssues now takes allTags. Upper bound:
  - annotated/release → use resolved createdAt
  - commit fallback   → next same-prefix tag's date, else now()
Lower bound uses previousTag.createdAt (resolved). API updatedAfter
uses previousTag.commitDate to stay broad enough to catch candidates.
Inverted-window guard returns an empty set rather than throwing."
```

---

## Task 7: Generate command — wire annotated resolution and emit warning

**Files:**
- Modify: `src/cli/commands/generate.ts`
- Modify: `tests/cli/generate.test.ts` (if present) — otherwise cover via integration-style test of collectIssues

- [ ] **Step 1: Update `src/cli/commands/generate.ts:104-113`**

After constructing `allTags`, upgrade the current + previous tag dates via `resolveAnnotatedTagDate`. Place this block right after the `allTags` initialization:

```ts
async function upgradeTagDate(
  client: ProviderClient,
  projectPath: string,
  tag: TagInfo,
): Promise<TagInfo> {
  if (tag.dateSource !== 'commit') return tag;
  if (!client.resolveAnnotatedTagDate) return tag;
  const annotated = await client.resolveAnnotatedTagDate(projectPath, tag.raw);
  if (!annotated) return tag;
  return { ...tag, createdAt: annotated, dateSource: 'annotated' };
}
```

Put that helper at the top of `generate.ts` (after imports). Import `ProviderClient`:

```ts
import type { ProviderClient } from '../../providers/types.js';
```

- [ ] **Step 2: Wire the helper after resolving current + previous tags**

Replace the section from `const currentTag = allTags.find(...)` (line 115) through the end of the previous-tag resolution (line 135) with:

```ts
let currentTag = allTags.find((t) => t.raw === options.tag);
if (!currentTag) {
  throw new Error(
    `Tag "${options.tag}" not found in remote repository.`,
  );
}
currentTag = await upgradeTagDate(client, projectPath, currentTag);
debug('Current tag:', JSON.stringify(currentTag));

let previousTag: TagInfo | null;
if (options.since) {
  previousTag = allTags.find((t) => t.raw === options.since) ?? null;
  if (!previousTag) {
    throw new Error(
      `Tag "${options.since}" (specified by --since) not found in remote repository.`,
    );
  }
  debug('Previous tag (from --since):', JSON.stringify(previousTag));
} else {
  previousTag = findPreviousTag(allTags, currentTag);
  debug('Previous tag:', previousTag ? JSON.stringify(previousTag) : 'none (first release)');
}
if (previousTag) {
  previousTag = await upgradeTagDate(client, projectPath, previousTag);
  debug('Previous tag (resolved):', JSON.stringify(previousTag));
}
```

- [ ] **Step 3: Update the `collectIssues` call to pass `allTags`**

Replace line 142-149:

```ts
issues = await collectIssues(
  client,
  projectPath,
  currentTag,
  previousTag,
  allTags,
  config,
  debug,
);
```

- [ ] **Step 4: Emit warning when the current tag's dateSource is 'commit'**

Insert after the `collectIssues` call returns, before `console.log(output)` or `writeFile`:

```ts
if (currentTag.dateSource === 'commit') {
  const warningLines = [
    `⚠️  Tag "${options.tag}" is lightweight and has no associated release,`,
    `   so its exact creation time isn't available. Using the commit date as`,
    `   a lower reference and the current time as the upper bound, which may`,
    `   include any issues closed since the commit.`,
    ``,
    `   For precise timing, use annotated tags (\`git tag -a <name> -m "..."\`)`,
    `   or publish the release (\`releasejet generate --publish\`) before`,
    `   regenerating notes.`,
  ];
  if (options.format !== 'json') {
    console.error(warningLines.join('\n'));
  } else {
    // JSON output: still emit to stderr so stdout stays clean
    process.stderr.write(warningLines.join('\n') + '\n');
  }
}
```

Note: `console.error` already writes to stderr, so both branches put the warning on stderr. Kept the branch so future-us can change JSON-mode behavior if needed.

- [ ] **Step 5: Run the full suite**

```bash
npm test
```

Expected: all tests pass. If any generate.ts-adjacent test broke due to signature changes, fix by passing `allTags` to collectIssues.

- [ ] **Step 6: Typecheck + build**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/cli/commands/generate.ts tests/
git commit -m "feat(generate): resolve annotated dates and warn on commit fallback

- Calls client.resolveAnnotatedTagDate (when provided) on the current
  and previous tags, upgrading dateSource from commit to annotated
  when a tagger date is available.
- Passes allTags to collectIssues so the collector can look up the
  next same-prefix tag for upper-bound fallback.
- Emits a stderr warning when the current tag still resolves to
  commit-date fallback, pointing users at annotated tags and
  --publish."
```

---

## Task 8: Regression test — the exact bug scenario

**Files:**
- Modify: `tests/core/issue-collector.test.ts`

- [ ] **Step 1: Add the scenario test**

Add to `tests/core/issue-collector.test.ts` inside the existing `describe('collectIssues — tag date resolution', ...)` block:

```ts
it('regression — 4 issues closed 27-47s after a lightweight tag are all included (GitLab UI scenario)', async () => {
  const current: TagInfo = {
    raw: 'client2-v11.0.0', prefix: 'client2', version: '11.0.0', suffix: null,
    createdAt: '2026-04-17T07:20:46Z',       // commit date (wrong as "tag time")
    commitDate: '2026-04-17T07:20:46Z',
    dateSource: 'commit',
  };
  const previous: TagInfo = {
    raw: 'client2-v10.1.0', prefix: 'client2', version: '10.1.0', suffix: null,
    createdAt: '2026-04-09T19:52:20Z',
    commitDate: '2026-04-09T19:52:20Z',
    dateSource: 'commit',
  };

  vi.mocked(client.listIssues).mockResolvedValue([
    { number: 72, title: 'Migrate API v1 endpoints', labels: ['CLIENT2', 'breaking-change'], closedAt: '2026-04-17T07:21:13.079Z', webUrl: '', milestone: null, author: null, assignee: null, closedBy: null },
    { number: 71, title: 'Reduce dashboard initial load time', labels: ['CLIENT2', 'improvement'], closedAt: '2026-04-17T07:21:33.119Z', webUrl: '', milestone: null, author: null, assignee: null, closedBy: null },
    { number: 70, title: 'Login fails with 500', labels: ['CLIENT2', 'bug'], closedAt: '2026-04-17T07:21:19.901Z', webUrl: '', milestone: null, author: null, assignee: null, closedBy: null },
    { number: 69, title: 'Add dark mode toggle', labels: ['CLIENT2', 'feature'], closedAt: '2026-04-17T07:21:24.976Z', webUrl: '', milestone: null, author: null, assignee: null, closedBy: null },
  ]);

  const multiClientConfig: ReleaseJetConfig = {
    ...config,
    clients: [{ prefix: 'client2', label: 'CLIENT2' }],
    categories: {
      feature: 'New Features',
      bug: 'Bug Fixes',
      improvement: 'Improvements',
      'breaking-change': 'Breaking Changes',
    },
  };

  const result = await collectIssues(
    client, 'owner/repo', current, previous, [previous, current], multiClientConfig,
  );

  const all = [
    ...Object.values(result.categorized).flat(),
    ...result.uncategorized,
  ];
  expect(all.map(i => i.number).sort()).toEqual([69, 70, 71, 72]);
});
```

- [ ] **Step 2: Run the test — expect pass**

```bash
npx vitest run tests/core/issue-collector.test.ts -t "regression"
```

Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add tests/core/issue-collector.test.ts
git commit -m "test(collector): regression test for lightweight-tag late-close bug

Mirrors the debug trace reported on 2026-04-17: lightweight tag on a
commit at 07:20:46Z, four CLIENT2 issues closed 27-47s later. All
four must appear in the release notes."
```

---

## Task 9: Version bump and CHANGELOG

**Files:**
- Modify: `package.json`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Bump version in `package.json`**

Change `"version": "1.9.0"` to `"version": "1.9.1"`.

- [ ] **Step 2: Add CHANGELOG entry**

Insert at the top of `CHANGELOG.md`, above `## [1.9.0] - 2026-04-16`:

```markdown
## [1.9.1] - 2026-04-17

### Fixed

- **Lightweight tags no longer drop issues from release notes.** When a tag was created after its target commit (common with GitLab UI tagging and CI auto-tag workflows), issues closed between the commit and the tag's real creation time were silently excluded. The tool now resolves annotated tag dates and existing release dates when available, and falls back to the current time for the latest lightweight tag so recently closed issues are captured.
- Emit a stderr warning when the current tag's date can't be resolved authoritatively, pointing users at annotated tags or `--publish` as the robust fix.
```

- [ ] **Step 3: Commit**

```bash
git add package.json CHANGELOG.md
git commit -m "chore: bump version to 1.9.1 with changelog for tag date resolution fix"
```

---

## Task 10: Manual verification

Not auto-testable. Track these in the PR description as a checklist.

- [ ] **Step 1: Real-repo smoke test — GitLab lightweight tag**

```bash
cd C:\Users\makpa\Documents\Projects\test-project
npm link @makispps/releasejet  # or point at local build
releasejet generate --tag client2-v11.0.0 --dry-run --debug
```

Expected:
- Debug output shows `dateSource: "commit"` for `client2-v11.0.0`
- Debug output shows `Upper bound: <now iso> (source: commit → now())`
- All 4 CLIENT2 issues appear in the output markdown
- stderr shows the `⚠️ Tag "client2-v11.0.0" is lightweight...` warning

- [ ] **Step 2: Annotated tag happy path — GitLab**

```bash
git tag -a client2-v11.1.0 -m "Release v11.1.0"
git push origin client2-v11.1.0
releasejet generate --tag client2-v11.1.0 --dry-run --debug
```

Expected:
- `dateSource: "annotated"`
- No warning emitted
- Issues closed after the tag's tagger date are correctly excluded

- [ ] **Step 3: Release-date self-healing — any provider**

```bash
releasejet generate --tag <lightweight-tag> --publish  # warning emitted
releasejet generate --tag <same-tag> --dry-run         # dateSource=release, no warning
```

- [ ] **Step 4: Regenerating historic notes**

```bash
releasejet generate --tag client2-v10.0.0 --dry-run --debug
```

Expected: Upper bound is `client2-v10.1.0`'s createdAt (not `now()`), stable output.

- [ ] **Step 5: Open PR**

```bash
gh pr create --base main --title "fix: lightweight-tag release notes drop issues (v1.9.1)" \
  --body-file docs/superpowers/specs/2026-04-17-tag-date-resolution-design.md
```

(Edit the PR body down to summary + test plan before submitting — the full spec goes in the linked file.)

---

## Self-Review Notes

- Every spec section maps to a task: types (1), GitLab resolution (2), GitHub resolution (3, 4), next-tag helper (5), collector logic (6), wiring + warning (7), regression (8), release (9, 10).
- No `TBD` / `TODO` / vague steps.
- Every code step shows real code; every command has expected output.
- Method names consistent across tasks: `findNextSamePrefixTag`, `resolveAnnotatedTagDate`, `upgradeTagDate`, `collectIssues(..., allTags, ...)`.
- Types consistent: `RemoteTag` has 4 fields everywhere; `TagInfo` gets 2 new fields everywhere; `TagDateSource` is a string-literal union.
- Manual verification is tracked as a PR checklist (Task 10), not auto-tests.
