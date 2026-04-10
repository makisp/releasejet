import { describe, it, expect } from 'vitest';
import type { SeedClient, RunContext } from '../../scripts/seed-test-data-gitlab.js';
import { scenarios, listScenarios, resolveGitLabUrl } from '../../scripts/seed-test-data-gitlab.js';

interface MockCall {
  method: string;
  args: unknown[];
}

function createMockClient(): SeedClient & { calls: MockCall[] } {
  const calls: MockCall[] = [];
  let issueCount = 0;
  let milestoneCount = 0;

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
    async closeIssue(_project, iid) {
      calls.push({ method: 'closeIssue', args: [iid] });
    },
    async createTag(_project, tagName) {
      calls.push({ method: 'createTag', args: [tagName] });
    },
    async deleteTag(_project, tagName) {
      calls.push({ method: 'deleteTag', args: [tagName] });
    },
    log() {},
  };
}

function createTestContext(client: SeedClient): RunContext {
  return { client, project: 'test/project', wait: async () => {} };
}

describe('SeedClient interface', () => {
  it('mock client tracks createMilestone calls', async () => {
    const mock = createMockClient();
    const id = await mock.createMilestone('proj', 'Sprint 1');
    expect(id).toBe(1);
    expect(mock.calls).toEqual([{ method: 'createMilestone', args: ['Sprint 1'] }]);
  });

  it('mock client tracks createIssue calls with sequential iids', async () => {
    const mock = createMockClient();
    const iid1 = await mock.createIssue('proj', { title: 'Issue 1', labels: ['bug'] });
    const iid2 = await mock.createIssue('proj', { title: 'Issue 2', labels: ['feature'] });
    expect(iid1).toBe(1);
    expect(iid2).toBe(2);
  });

  it('mock client tracks closeIssue and createTag calls', async () => {
    const mock = createMockClient();
    await mock.closeIssue('proj', 42);
    await mock.createTag('proj', 'v1.0.0');
    expect(mock.calls).toEqual([
      { method: 'closeIssue', args: [42] },
      { method: 'createTag', args: ['v1.0.0'] },
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

describe('resolveGitLabUrl', () => {
  it('returns --url flag value when provided', async () => {
    const url = await resolveGitLabUrl('https://custom.gitlab.com');
    expect(url).toBe('https://custom.gitlab.com');
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

      // No API calls — this scenario only prints instructions
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
      // 3 issues with Sprint 10 (milestoneId 1), 1 with Sprint 9 (milestoneId 2)
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

      // Tag comes after all issues are closed
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

      // 1 issue between base tag (index 0) and hotfix tag (index 1)
      expect(
        issueIndices.filter((i) => i > tagIndices[0] && i < tagIndices[1]),
      ).toHaveLength(1);
      // 2 issues between hotfix tag (index 1) and final tag (index 2)
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

      // Issue A closed before first tag
      expect(closeIndices[0]).toBeLessThan(tagIndices[0]);
      // Issue B closed between tags
      expect(closeIndices[1]).toBeGreaterThan(tagIndices[0]);
      expect(closeIndices[1]).toBeLessThan(tagIndices[1]);
      // Issue C closed after second tag
      expect(closeIndices[2]).toBeGreaterThan(tagIndices[1]);
    });
  });
});
