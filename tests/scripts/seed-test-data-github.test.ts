import { describe, it, expect } from 'vitest';
import type { GitHubSeedClient, RunContext } from '../../scripts/seed-test-data-github.js';
import { scenarios, listScenarios, resolveGitHubUrl } from '../../scripts/seed-test-data-github.js';

interface MockCall {
  method: string;
  args: unknown[];
}

function createMockClient(): GitHubSeedClient & { calls: MockCall[] } {
  const calls: MockCall[] = [];
  let issueCount = 0;
  let milestoneCount = 0;
  let prCount = 0;

  return {
    calls,
    async createMilestone(_project, title) {
      milestoneCount++;
      calls.push({ method: 'createMilestone', args: [title] });
      return milestoneCount;
    },
    async createIssue(_project, options) {
      issueCount++;
      calls.push({ method: 'createIssue', args: [options] });
      return issueCount;
    },
    async closeIssue(_project, number) {
      calls.push({ method: 'closeIssue', args: [number] });
    },
    async createTag(_project, tagName) {
      calls.push({ method: 'createTag', args: [tagName] });
    },
    async deleteTag(_project, tagName) {
      calls.push({ method: 'deleteTag', args: [tagName] });
    },
    async createBranch(_project, branchName) {
      calls.push({ method: 'createBranch', args: [branchName] });
    },
    async createPullRequest(_project, options) {
      prCount++;
      calls.push({ method: 'createPullRequest', args: [options] });
      return prCount;
    },
    async mergePullRequest(_project, prNumber) {
      calls.push({ method: 'mergePullRequest', args: [prNumber] });
    },
    log() {},
  };
}

function createTestContext(client: GitHubSeedClient): RunContext {
  return { client, project: 'test/project', wait: async () => {} };
}

describe('GitHubSeedClient mock', () => {
  it('tracks createMilestone calls', async () => {
    const mock = createMockClient();
    const id = await mock.createMilestone('proj', 'Sprint 1');
    expect(id).toBe(1);
    expect(mock.calls).toEqual([{ method: 'createMilestone', args: ['Sprint 1'] }]);
  });

  it('tracks createIssue calls with sequential numbers', async () => {
    const mock = createMockClient();
    const n1 = await mock.createIssue('proj', { title: 'Issue 1', labels: ['bug'] });
    const n2 = await mock.createIssue('proj', { title: 'Issue 2', labels: ['feature'] });
    expect(n1).toBe(1);
    expect(n2).toBe(2);
  });

  it('tracks createBranch and createPullRequest calls', async () => {
    const mock = createMockClient();
    await mock.createBranch('proj', 'seed/test-1');
    const prNum = await mock.createPullRequest('proj', {
      title: 'Test PR',
      labels: ['feature'],
      head: 'seed/test-1',
      base: 'main',
    });
    await mock.mergePullRequest('proj', prNum);
    expect(prNum).toBe(1);
    expect(mock.calls).toEqual([
      { method: 'createBranch', args: ['seed/test-1'] },
      { method: 'createPullRequest', args: [{ title: 'Test PR', labels: ['feature'], head: 'seed/test-1', base: 'main' }] },
      { method: 'mergePullRequest', args: [1] },
    ]);
  });
});

describe('listScenarios', () => {
  it('returns sorted scenario names', () => {
    scenarios['_test-z'] = async () => {};
    scenarios['_test-a'] = async () => {};
    const list = listScenarios();
    const zIdx = list.indexOf('_test-z');
    const aIdx = list.indexOf('_test-a');
    expect(aIdx).toBeLessThan(zIdx);
    delete scenarios['_test-z'];
    delete scenarios['_test-a'];
  });
});

describe('resolveGitHubUrl', () => {
  it('returns --url flag value when provided', () => {
    const url = resolveGitHubUrl('https://github.example.com');
    expect(url).toBe('https://github.example.com');
  });

  it('returns default GitHub URL when no flag provided', () => {
    const url = resolveGitHubUrl();
    expect(url).toBe('https://github.com');
  });
});

describe('scenarios', () => {
  describe('happy-path', () => {
    it('creates milestone, two tags, and 4 issues with correct labels', async () => {
      const mock = createMockClient();
      const ctx = createTestContext(mock);
      await scenarios['happy-path'](ctx);

      const milestones = mock.calls.filter((c) => c.method === 'createMilestone');
      expect(milestones).toEqual([{ method: 'createMilestone', args: ['Release 10.1'] }]);

      const tags = mock.calls.filter((c) => c.method === 'createTag');
      expect(tags).toEqual([
        { method: 'createTag', args: ['client1-v10.0.0'] },
        { method: 'createTag', args: ['client1-v10.1.0'] },
      ]);

      const issues = mock.calls.filter((c) => c.method === 'createIssue');
      expect(issues).toHaveLength(4);
      expect(issues[0].args[0]).toEqual({
        title: 'Add dark mode',
        labels: ['CLIENT1', 'feature'],
        milestoneId: 1,
      });
      expect(issues[1].args[0]).toEqual({
        title: 'Fix login crash',
        labels: ['CLIENT1', 'bug'],
        milestoneId: 1,
      });
      expect(issues[2].args[0]).toEqual({
        title: 'Investigate memory leak',
        labels: ['CLIENT1', 'investigation'],
        milestoneId: 1,
      });
      expect(issues[3].args[0]).toEqual({
        title: 'Migrate to new API',
        labels: ['CLIENT1', 'change-request'],
        milestoneId: 1,
      });

      expect(mock.calls.filter((c) => c.method === 'closeIssue')).toHaveLength(4);
    });

    it('creates previous tag before issues and current tag after', async () => {
      const mock = createMockClient();
      const ctx = createTestContext(mock);
      await scenarios['happy-path'](ctx);

      const tagIndices = mock.calls
        .map((c, i) => (c.method === 'createTag' ? i : -1))
        .filter((i) => i >= 0);
      const issueIndices = mock.calls
        .map((c, i) => (c.method === 'createIssue' ? i : -1))
        .filter((i) => i >= 0);

      expect(tagIndices[0]).toBeLessThan(issueIndices[0]);
      expect(tagIndices[1]).toBeGreaterThan(issueIndices[issueIndices.length - 1]);
    });
  });

  describe('second-client', () => {
    it('creates CLIENT2 tags and 3 issues without milestone', async () => {
      const mock = createMockClient();
      const ctx = createTestContext(mock);
      await scenarios['second-client'](ctx);

      const tags = mock.calls.filter((c) => c.method === 'createTag');
      expect(tags).toEqual([
        { method: 'createTag', args: ['client2-v10.0.0'] },
        { method: 'createTag', args: ['client2-v10.1.0'] },
      ]);

      const issues = mock.calls.filter((c) => c.method === 'createIssue');
      expect(issues).toHaveLength(3);
      expect(issues.every((c) => (c.args[0] as any).labels[0] === 'CLIENT2')).toBe(true);

      expect(mock.calls.filter((c) => c.method === 'createMilestone')).toHaveLength(0);
      expect(mock.calls.filter((c) => c.method === 'closeIssue')).toHaveLength(3);
    });
  });

  describe('uncategorized-lenient', () => {
    it('creates 2 categorized issues and 1 uncategorized issue', async () => {
      const mock = createMockClient();
      const ctx = createTestContext(mock);
      await scenarios['uncategorized-lenient'](ctx);

      const tags = mock.calls.filter((c) => c.method === 'createTag');
      expect(tags).toEqual([
        { method: 'createTag', args: ['client1-v11.0.0'] },
        { method: 'createTag', args: ['client1-v11.1.0'] },
      ]);

      const issues = mock.calls.filter((c) => c.method === 'createIssue');
      expect(issues).toHaveLength(3);
      // Third issue has only CLIENT1 label (no category)
      expect((issues[2].args[0] as any).labels).toEqual(['CLIENT1']);
    });
  });

  describe('uncategorized-strict', () => {
    it('creates no API calls and only logs instructions', async () => {
      const mock = createMockClient();
      const ctx = createTestContext(mock);
      await scenarios['uncategorized-strict'](ctx);

      expect(mock.calls).toHaveLength(0);
    });
  });

  describe('no-milestone', () => {
    it('creates issues without milestoneId', async () => {
      const mock = createMockClient();
      const ctx = createTestContext(mock);
      await scenarios['no-milestone'](ctx);

      const tags = mock.calls.filter((c) => c.method === 'createTag');
      expect(tags).toEqual([
        { method: 'createTag', args: ['client1-v12.0.0'] },
        { method: 'createTag', args: ['client1-v12.1.0'] },
      ]);

      const issues = mock.calls.filter((c) => c.method === 'createIssue');
      expect(issues).toHaveLength(2);
      expect(issues.every((c) => (c.args[0] as any).milestoneId === undefined)).toBe(true);

      expect(mock.calls.filter((c) => c.method === 'createMilestone')).toHaveLength(0);
    });
  });

  describe('mixed-milestones', () => {
    it('creates 2 milestones and assigns issues to different ones', async () => {
      const mock = createMockClient();
      const ctx = createTestContext(mock);
      await scenarios['mixed-milestones'](ctx);

      const milestones = mock.calls.filter((c) => c.method === 'createMilestone');
      expect(milestones).toHaveLength(2);
      expect(milestones[0].args[0]).toBe('Sprint 10');
      expect(milestones[1].args[0]).toBe('Sprint 9');

      const tags = mock.calls.filter((c) => c.method === 'createTag');
      expect(tags).toEqual([
        { method: 'createTag', args: ['client1-v12.2.0'] },
        { method: 'createTag', args: ['client1-v12.3.0'] },
      ]);

      const issues = mock.calls.filter((c) => c.method === 'createIssue');
      expect(issues).toHaveLength(4);
      expect(issues.filter((c) => (c.args[0] as any).milestoneId === 1)).toHaveLength(3);
      expect(issues.filter((c) => (c.args[0] as any).milestoneId === 2)).toHaveLength(1);
    });
  });

  describe('first-tag', () => {
    it('creates issues then a single tag (no previous tag)', async () => {
      const mock = createMockClient();
      const ctx = createTestContext(mock);
      await scenarios['first-tag'](ctx);

      const tags = mock.calls.filter((c) => c.method === 'createTag');
      expect(tags).toEqual([{ method: 'createTag', args: ['client3-v20.0.0'] }]);

      const issues = mock.calls.filter((c) => c.method === 'createIssue');
      expect(issues).toHaveLength(2);
      expect(issues.every((c) => (c.args[0] as any).labels[0] === 'CLIENT3')).toBe(true);

      const tagIndex = mock.calls.findIndex((c) => c.method === 'createTag');
      const lastCloseIndex = mock.calls
        .map((c, i) => (c.method === 'closeIssue' ? i : -1))
        .filter((i) => i >= 0)
        .pop()!;
      expect(tagIndex).toBeGreaterThan(lastCloseIndex);
    });
  });

  describe('empty-release', () => {
    it('creates two tags with no issues', async () => {
      const mock = createMockClient();
      const ctx = createTestContext(mock);
      await scenarios['empty-release'](ctx);

      const tags = mock.calls.filter((c) => c.method === 'createTag');
      expect(tags).toEqual([
        { method: 'createTag', args: ['client1-v14.0.0'] },
        { method: 'createTag', args: ['client1-v14.1.0'] },
      ]);

      expect(mock.calls.filter((c) => c.method === 'createIssue')).toHaveLength(0);
      expect(mock.calls.filter((c) => c.method === 'closeIssue')).toHaveLength(0);
    });
  });

  describe('suffix-tag', () => {
    it('creates three tags including a hotfix suffix tag', async () => {
      const mock = createMockClient();
      const ctx = createTestContext(mock);
      await scenarios['suffix-tag'](ctx);

      const tags = mock.calls.filter((c) => c.method === 'createTag');
      expect(tags).toEqual([
        { method: 'createTag', args: ['client1-v13.0.0'] },
        { method: 'createTag', args: ['client1-v13.0.0-hotfix1'] },
        { method: 'createTag', args: ['client1-v13.1.0'] },
      ]);

      expect(mock.calls.filter((c) => c.method === 'createIssue')).toHaveLength(3);
    });

    it('places 1 issue after base tag and 2 after hotfix tag', async () => {
      const mock = createMockClient();
      const ctx = createTestContext(mock);
      await scenarios['suffix-tag'](ctx);

      const tagIndices = mock.calls
        .map((c, i) => (c.method === 'createTag' ? i : -1))
        .filter((i) => i >= 0);
      const issueIndices = mock.calls
        .map((c, i) => (c.method === 'createIssue' ? i : -1))
        .filter((i) => i >= 0);

      expect(
        issueIndices.filter((i) => i > tagIndices[0] && i < tagIndices[1]),
      ).toHaveLength(1);
      expect(
        issueIndices.filter((i) => i > tagIndices[1] && i < tagIndices[2]),
      ).toHaveLength(2);
    });
  });

  describe('issue-outside-window', () => {
    it('creates 3 issues and 2 tags', async () => {
      const mock = createMockClient();
      const ctx = createTestContext(mock);
      await scenarios['issue-outside-window'](ctx);

      const tags = mock.calls.filter((c) => c.method === 'createTag');
      expect(tags).toEqual([
        { method: 'createTag', args: ['client1-v15.0.0'] },
        { method: 'createTag', args: ['client1-v15.1.0'] },
      ]);

      expect(mock.calls.filter((c) => c.method === 'createIssue')).toHaveLength(3);
    });

    it('closes issues before, between, and after tags', async () => {
      const mock = createMockClient();
      const ctx = createTestContext(mock);
      await scenarios['issue-outside-window'](ctx);

      const tagIndices = mock.calls
        .map((c, i) => (c.method === 'createTag' ? i : -1))
        .filter((i) => i >= 0);
      const closeIndices = mock.calls
        .map((c, i) => (c.method === 'closeIssue' ? i : -1))
        .filter((i) => i >= 0);

      expect(closeIndices[0]).toBeLessThan(tagIndices[0]);
      expect(closeIndices[1]).toBeGreaterThan(tagIndices[0]);
      expect(closeIndices[1]).toBeLessThan(tagIndices[1]);
      expect(closeIndices[2]).toBeGreaterThan(tagIndices[1]);
    });
  });

  describe('pr-happy-path', () => {
    it('creates milestone, two tags, 4 branches, 4 PRs, and merges all', async () => {
      const mock = createMockClient();
      const ctx = createTestContext(mock);
      await scenarios['pr-happy-path'](ctx);

      const milestones = mock.calls.filter((c) => c.method === 'createMilestone');
      expect(milestones).toEqual([{ method: 'createMilestone', args: ['Release 30.1'] }]);

      const tags = mock.calls.filter((c) => c.method === 'createTag');
      expect(tags).toEqual([
        { method: 'createTag', args: ['client1-v30.0.0'] },
        { method: 'createTag', args: ['client1-v30.1.0'] },
      ]);

      const branches = mock.calls.filter((c) => c.method === 'createBranch');
      expect(branches).toHaveLength(4);

      const prs = mock.calls.filter((c) => c.method === 'createPullRequest');
      expect(prs).toHaveLength(4);
      expect(prs[0].args[0]).toEqual({
        title: 'Add dark mode',
        labels: ['CLIENT1', 'feature'],
        milestoneId: 1,
        head: 'seed/pr-happy-path-1',
        base: 'main',
      });
      expect(prs[1].args[0]).toEqual({
        title: 'Fix login crash',
        labels: ['CLIENT1', 'bug'],
        milestoneId: 1,
        head: 'seed/pr-happy-path-2',
        base: 'main',
      });
      expect(prs[2].args[0]).toEqual({
        title: 'Investigate memory leak',
        labels: ['CLIENT1', 'investigation'],
        milestoneId: 1,
        head: 'seed/pr-happy-path-3',
        base: 'main',
      });
      expect(prs[3].args[0]).toEqual({
        title: 'Migrate to new API',
        labels: ['CLIENT1', 'change-request'],
        milestoneId: 1,
        head: 'seed/pr-happy-path-4',
        base: 'main',
      });

      const merges = mock.calls.filter((c) => c.method === 'mergePullRequest');
      expect(merges).toHaveLength(4);
    });

    it('creates previous tag before PRs and current tag after merges', async () => {
      const mock = createMockClient();
      const ctx = createTestContext(mock);
      await scenarios['pr-happy-path'](ctx);

      const tagIndices = mock.calls
        .map((c, i) => (c.method === 'createTag' ? i : -1))
        .filter((i) => i >= 0);
      const prIndices = mock.calls
        .map((c, i) => (c.method === 'createPullRequest' ? i : -1))
        .filter((i) => i >= 0);
      const mergeIndices = mock.calls
        .map((c, i) => (c.method === 'mergePullRequest' ? i : -1))
        .filter((i) => i >= 0);

      expect(tagIndices[0]).toBeLessThan(prIndices[0]);
      expect(tagIndices[1]).toBeGreaterThan(mergeIndices[mergeIndices.length - 1]);
    });
  });

  describe('pr-second-client', () => {
    it('creates CLIENT2 tags, 3 branches, 3 PRs without milestone', async () => {
      const mock = createMockClient();
      const ctx = createTestContext(mock);
      await scenarios['pr-second-client'](ctx);

      const tags = mock.calls.filter((c) => c.method === 'createTag');
      expect(tags).toEqual([
        { method: 'createTag', args: ['client2-v30.0.0'] },
        { method: 'createTag', args: ['client2-v30.1.0'] },
      ]);

      const prs = mock.calls.filter((c) => c.method === 'createPullRequest');
      expect(prs).toHaveLength(3);
      expect(prs.every((c) => (c.args[0] as any).labels[0] === 'CLIENT2')).toBe(true);

      const merges = mock.calls.filter((c) => c.method === 'mergePullRequest');
      expect(merges).toHaveLength(3);

      expect(mock.calls.filter((c) => c.method === 'createMilestone')).toHaveLength(0);
      expect(mock.calls.filter((c) => c.method === 'createBranch')).toHaveLength(3);
    });
  });

  describe('pr-uncategorized-lenient', () => {
    it('creates 2 categorized PRs and 1 uncategorized PR', async () => {
      const mock = createMockClient();
      const ctx = createTestContext(mock);
      await scenarios['pr-uncategorized-lenient'](ctx);

      const tags = mock.calls.filter((c) => c.method === 'createTag');
      expect(tags).toEqual([
        { method: 'createTag', args: ['client1-v31.0.0'] },
        { method: 'createTag', args: ['client1-v31.1.0'] },
      ]);

      const prs = mock.calls.filter((c) => c.method === 'createPullRequest');
      expect(prs).toHaveLength(3);
      // Third PR has only CLIENT1 label (no category)
      expect((prs[2].args[0] as any).labels).toEqual(['CLIENT1']);

      expect(mock.calls.filter((c) => c.method === 'mergePullRequest')).toHaveLength(3);
    });
  });

  describe('pr-first-tag', () => {
    it('creates PRs then a single tag (no previous tag)', async () => {
      const mock = createMockClient();
      const ctx = createTestContext(mock);
      await scenarios['pr-first-tag'](ctx);

      const tags = mock.calls.filter((c) => c.method === 'createTag');
      expect(tags).toEqual([{ method: 'createTag', args: ['client3-v30.0.0'] }]);

      const prs = mock.calls.filter((c) => c.method === 'createPullRequest');
      expect(prs).toHaveLength(2);
      expect(prs.every((c) => (c.args[0] as any).labels[0] === 'CLIENT3')).toBe(true);

      const merges = mock.calls.filter((c) => c.method === 'mergePullRequest');
      expect(merges).toHaveLength(2);

      const tagIndex = mock.calls.findIndex((c) => c.method === 'createTag');
      const lastMergeIndex = mock.calls
        .map((c, i) => (c.method === 'mergePullRequest' ? i : -1))
        .filter((i) => i >= 0)
        .pop()!;
      expect(tagIndex).toBeGreaterThan(lastMergeIndex);
    });
  });

  describe('pr-empty-release', () => {
    it('creates two tags with no PRs', async () => {
      const mock = createMockClient();
      const ctx = createTestContext(mock);
      await scenarios['pr-empty-release'](ctx);

      const tags = mock.calls.filter((c) => c.method === 'createTag');
      expect(tags).toEqual([
        { method: 'createTag', args: ['client1-v34.0.0'] },
        { method: 'createTag', args: ['client1-v34.1.0'] },
      ]);

      expect(mock.calls.filter((c) => c.method === 'createPullRequest')).toHaveLength(0);
      expect(mock.calls.filter((c) => c.method === 'mergePullRequest')).toHaveLength(0);
      expect(mock.calls.filter((c) => c.method === 'createBranch')).toHaveLength(0);
    });
  });
});
