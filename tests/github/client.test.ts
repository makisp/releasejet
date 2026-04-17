import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockListTags = vi.fn();
const mockGetCommit = vi.fn();
const mockListForRepo = vi.fn();
const mockPullsList = vi.fn();
const mockCreateRelease = vi.fn();
const mockGetReleaseByTag = vi.fn();
const mockUpdateRelease = vi.fn();
const mockListMilestones = vi.fn();
const mockListReleases = vi.fn();
const mockGetRef = vi.fn();
const mockGetTag = vi.fn();

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
    issues: {
      listForRepo: mockListForRepo,
      listMilestones: mockListMilestones,
    },
    pulls: {
      list: mockPullsList,
    },
    git: { getRef: mockGetRef, getTag: mockGetTag },
  })),
}));

import { createGitHubClient } from '../../src/github/client.js';

describe('createGitHubClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listTags', () => {
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
      expect(mockListTags).toHaveBeenCalledWith({ owner: 'owner', repo: 'repo', per_page: 100 });
    });

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
  });

  describe('listIssues', () => {
    it('queries closed issues and filters out PRs', async () => {
      mockListForRepo.mockResolvedValue({
        data: [
          {
            number: 42,
            title: 'Real issue',
            labels: [{ name: 'bug' }],
            closed_at: '2026-04-07T15:00:00Z',
            html_url: 'https://github.com/owner/repo/issues/42',
            milestone: { title: 'v1.0', html_url: 'https://github.com/owner/repo/milestone/1' },
            user: { login: 'elena' },
            assignees: [{ login: 'makisp' }],
            assignee: { login: 'makisp' },
            closed_by: { login: 'makisp' },
          },
          {
            number: 43,
            title: 'This is a PR',
            labels: [{ name: 'feature' }],
            closed_at: '2026-04-07T16:00:00Z',
            html_url: 'https://github.com/owner/repo/pull/43',
            milestone: null,
            pull_request: { url: 'https://api.github.com/repos/owner/repo/pulls/43' },
            user: { login: 'nikos' },
            assignees: [],
            assignee: null,
            closed_by: null,
          },
        ],
      });

      const client = createGitHubClient('https://github.com', 'token');
      const issues = await client.listIssues('owner/repo', {
        state: 'closed',
        updatedAfter: '2026-03-01T00:00:00Z',
        labels: 'bug',
      });

      expect(issues).toHaveLength(1);
      expect(issues[0]).toEqual({
        number: 42,
        title: 'Real issue',
        labels: ['bug'],
        closedAt: '2026-04-07T15:00:00Z',
        webUrl: 'https://github.com/owner/repo/issues/42',
        milestone: { title: 'v1.0', url: 'https://github.com/owner/repo/milestone/1' },
        author: 'elena',
        assignee: 'makisp',
        closedBy: 'makisp',
      });
    });
  });

  describe('listPullRequests', () => {
    it('queries closed PRs and maps to Issue shape', async () => {
      mockPullsList.mockResolvedValue({
        data: [
          {
            number: 50,
            title: 'Add feature X',
            labels: [{ name: 'feature' }],
            closed_at: '2026-04-07T15:00:00Z',
            html_url: 'https://github.com/owner/repo/pull/50',
            milestone: { title: 'v1.0', html_url: 'https://github.com/owner/repo/milestone/1' },
            merged_at: '2026-04-07T15:00:00Z',
            user: { login: 'elena' },
            assignees: [{ login: 'nikos' }],
            assignee: { login: 'nikos' },
          },
          {
            number: 51,
            title: 'Rejected PR',
            labels: [],
            closed_at: '2026-04-06T10:00:00Z',
            html_url: 'https://github.com/owner/repo/pull/51',
            milestone: null,
            merged_at: null,
            user: { login: 'bot' },
            assignees: [],
            assignee: null,
          },
        ],
      });

      const client = createGitHubClient('https://github.com', 'token');
      const prs = await client.listPullRequests('owner/repo', {
        state: 'closed',
      });

      // Only merged PRs are included
      expect(prs).toHaveLength(1);
      expect(prs[0]).toEqual({
        number: 50,
        title: 'Add feature X',
        labels: ['feature'],
        closedAt: '2026-04-07T15:00:00Z',
        webUrl: 'https://github.com/owner/repo/pull/50',
        milestone: { title: 'v1.0', url: 'https://github.com/owner/repo/milestone/1' },
        author: 'elena',
        assignee: 'nikos',
        closedBy: null,
      });
    });
  });

  describe('createRelease', () => {
    it('calls the GitHub releases API', async () => {
      mockCreateRelease.mockResolvedValue({ data: {} });

      const client = createGitHubClient('https://github.com', 'token');
      await client.createRelease('owner/repo', {
        tagName: 'v1.0.0',
        name: 'v1.0.0',
        description: '# Release notes',
      });

      expect(mockCreateRelease).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        tag_name: 'v1.0.0',
        name: 'v1.0.0',
        body: '# Release notes',
      });
    });

    it('updates existing release on 422 conflict', async () => {
      const err = new Error('Validation Failed') as any;
      err.status = 422;
      mockCreateRelease.mockRejectedValue(err);
      mockGetReleaseByTag.mockResolvedValue({ data: { id: 99 } });
      mockUpdateRelease.mockResolvedValue({ data: {} });

      const client = createGitHubClient('https://github.com', 'token');
      await client.createRelease('owner/repo', {
        tagName: 'v1.0.0',
        name: 'v1.0.0',
        description: '# Updated notes',
      });

      expect(mockGetReleaseByTag).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        tag: 'v1.0.0',
      });
      expect(mockUpdateRelease).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        release_id: 99,
        name: 'v1.0.0',
        body: '# Updated notes',
      });
    });

    it('rethrows non-422 errors', async () => {
      const err = new Error('Server error') as any;
      err.status = 500;
      mockCreateRelease.mockRejectedValue(err);

      const client = createGitHubClient('https://github.com', 'token');
      await expect(
        client.createRelease('owner/repo', {
          tagName: 'v1.0.0',
          name: 'v1.0.0',
          description: '# Notes',
        }),
      ).rejects.toThrow('Server error');
    });
  });

  describe('listMilestones', () => {
    it('queries and maps milestones', async () => {
      mockListMilestones.mockResolvedValue({
        data: [
          { number: 1, title: 'v1.0', state: 'open' },
        ],
      });

      const client = createGitHubClient('https://github.com', 'token');
      const milestones = await client.listMilestones('owner/repo');

      expect(milestones).toEqual([
        { id: 1, title: 'v1.0', state: 'open' },
      ]);
    });
  });

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
});
