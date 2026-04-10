import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockListTags = vi.fn();
const mockGetCommit = vi.fn();
const mockListForRepo = vi.fn();
const mockPullsList = vi.fn();
const mockCreateRelease = vi.fn();
const mockListMilestones = vi.fn();

vi.mock('@octokit/rest', () => ({
  Octokit: vi.fn().mockImplementation(() => ({
    repos: {
      listTags: mockListTags,
      getCommit: mockGetCommit,
      createRelease: mockCreateRelease,
    },
    issues: {
      listForRepo: mockListForRepo,
      listMilestones: mockListMilestones,
    },
    pulls: {
      list: mockPullsList,
    },
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
      mockGetCommit
        .mockResolvedValueOnce({ data: { commit: { committer: { date: '2026-04-08T10:00:00Z' } } } })
        .mockResolvedValueOnce({ data: { commit: { committer: { date: '2026-03-01T10:00:00Z' } } } });

      const client = createGitHubClient('https://github.com', 'token');
      const tags = await client.listTags('owner/repo');

      expect(tags).toEqual([
        { name: 'v1.0.0', createdAt: '2026-04-08T10:00:00Z' },
        { name: 'v0.9.0', createdAt: '2026-03-01T10:00:00Z' },
      ]);
      expect(mockListTags).toHaveBeenCalledWith({ owner: 'owner', repo: 'repo', per_page: 100 });
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
          },
          {
            number: 43,
            title: 'This is a PR',
            labels: [{ name: 'feature' }],
            closed_at: '2026-04-07T16:00:00Z',
            html_url: 'https://github.com/owner/repo/pull/43',
            milestone: null,
            pull_request: { url: 'https://api.github.com/repos/owner/repo/pulls/43' },
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
          },
          {
            number: 51,
            title: 'Rejected PR',
            labels: [],
            closed_at: '2026-04-06T10:00:00Z',
            html_url: 'https://github.com/owner/repo/pull/51',
            milestone: null,
            merged_at: null,
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
});
