import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockTagsAll = vi.fn();
const mockIssuesAll = vi.fn();
const mockReleasesCreate = vi.fn();
const mockReleasesEdit = vi.fn();
const mockMilestonesAll = vi.fn();

vi.mock('@gitbeaker/rest', () => ({
  Gitlab: vi.fn().mockImplementation(() => ({
    Tags: { all: mockTagsAll },
    Issues: { all: mockIssuesAll },
    ProjectReleases: { create: mockReleasesCreate, edit: mockReleasesEdit },
    ProjectMilestones: { all: mockMilestonesAll },
  })),
}));

import { createGitLabClient } from '../../src/gitlab/client.js';

describe('createGitLabClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listTags', () => {
    it('maps API response to internal format', async () => {
      mockTagsAll.mockResolvedValue([
        { name: 'mobile-v0.1.17', commit: { created_at: '2026-04-08T10:00:00Z' } },
        { name: 'mobile-v0.1.16', commit: { created_at: '2026-03-01T10:00:00Z' } },
      ]);

      const client = createGitLabClient('https://gitlab.example.com', 'token');
      const tags = await client.listTags('mobile/app');

      expect(tags).toEqual([
        { name: 'mobile-v0.1.17', createdAt: '2026-04-08T10:00:00Z', commitDate: '2026-04-08T10:00:00Z', dateSource: 'commit' },
        { name: 'mobile-v0.1.16', createdAt: '2026-03-01T10:00:00Z', commitDate: '2026-03-01T10:00:00Z', dateSource: 'commit' },
      ]);
      expect(mockTagsAll).toHaveBeenCalledWith('mobile/app');
    });
  });

  describe('listIssues', () => {
    it('queries closed issues and maps response', async () => {
      mockIssuesAll.mockResolvedValue([
        {
          iid: 142,
          title: 'Dark mode support',
          labels: ['feature', 'MOBILE'],
          closed_at: '2026-04-07T15:00:00Z',
          web_url: 'https://gitlab.example.com/mobile/app/-/issues/142',
          milestone: { title: '[MOBILE] Demo 13', web_url: 'https://gitlab.example.com/mobile/app/-/milestones/13' },
          author: { username: 'elena' },
          assignees: [{ username: 'makisp' }],
          assignee: { username: 'makisp' },
          closed_by: { username: 'nikos' },
        },
      ]);

      const client = createGitLabClient('https://gitlab.example.com', 'token');
      const issues = await client.listIssues('mobile/app', {
        state: 'closed',
        updatedAfter: '2026-03-01T00:00:00Z',
        updatedBefore: '2026-04-08T00:00:00Z',
      });

      expect(issues).toHaveLength(1);
      expect(issues[0]).toEqual({
        number: 142,
        title: 'Dark mode support',
        labels: ['feature', 'MOBILE'],
        closedAt: '2026-04-07T15:00:00Z',
        webUrl: 'https://gitlab.example.com/mobile/app/-/issues/142',
        milestone: { title: '[MOBILE] Demo 13', url: 'https://gitlab.example.com/mobile/app/-/milestones/13' },
        author: 'elena',
        assignee: 'makisp',
        closedBy: 'nikos',
      });
    });

    it('passes label filter to API', async () => {
      mockIssuesAll.mockResolvedValue([]);

      const client = createGitLabClient('https://gitlab.example.com', 'token');
      await client.listIssues('mobile/app', {
        state: 'closed',
        labels: 'MOBILE',
      });

      expect(mockIssuesAll).toHaveBeenCalledWith(
        expect.objectContaining({ labels: 'MOBILE' }),
      );
    });
  });

  describe('createRelease', () => {
    it('calls the releases API', async () => {
      mockReleasesCreate.mockResolvedValue({});

      const client = createGitLabClient('https://gitlab.example.com', 'token');
      await client.createRelease('mobile/app', {
        tagName: 'mobile-v0.1.17',
        name: 'MOBILE v0.1.17',
        description: '# Release notes',
      });

      expect(mockReleasesCreate).toHaveBeenCalledWith('mobile/app', {
        tag_name: 'mobile-v0.1.17',
        name: 'MOBILE v0.1.17',
        description: '# Release notes',
      });
    });

    it('updates existing release on conflict', async () => {
      mockReleasesCreate.mockRejectedValue(new Error('Release already exists'));

      const client = createGitLabClient('https://gitlab.example.com', 'token');
      await client.createRelease('mobile/app', {
        tagName: 'mobile-v0.1.17',
        name: 'MOBILE v0.1.17',
        description: '# Updated notes',
      });

      expect(mockReleasesEdit).toHaveBeenCalledWith('mobile/app', 'mobile-v0.1.17', {
        name: 'MOBILE v0.1.17',
        description: '# Updated notes',
        milestones: undefined,
      });
    });

    it('rethrows non-conflict errors', async () => {
      mockReleasesCreate.mockRejectedValue(new Error('Forbidden'));

      const client = createGitLabClient('https://gitlab.example.com', 'token');
      await expect(
        client.createRelease('mobile/app', {
          tagName: 'mobile-v0.1.17',
          name: 'MOBILE v0.1.17',
          description: '# Notes',
        }),
      ).rejects.toThrow('Forbidden');
    });
  });

  describe('listMilestones', () => {
    it('queries and maps milestones', async () => {
      mockMilestonesAll.mockResolvedValue([
        { id: 1, title: '[MOBILE] Demo 1', state: 'active' },
      ]);

      const client = createGitLabClient('https://gitlab.example.com', 'token');
      const milestones = await client.listMilestones('mobile/app', {
        search: 'MOBILE',
      });

      expect(milestones).toEqual([
        { id: 1, title: '[MOBILE] Demo 1', state: 'active' },
      ]);
    });
  });
});
