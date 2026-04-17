import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockTagsAll = vi.fn();
const mockIssuesAll = vi.fn();
const mockReleasesCreate = vi.fn();
const mockReleasesEdit = vi.fn();
const mockReleasesAll = vi.fn();
const mockMilestonesAll = vi.fn();

vi.mock('@gitbeaker/rest', () => ({
  Gitlab: vi.fn().mockImplementation(() => ({
    Tags: { all: mockTagsAll },
    Issues: { all: mockIssuesAll },
    ProjectReleases: { create: mockReleasesCreate, edit: mockReleasesEdit, all: mockReleasesAll },
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
        { name: 'mobile-v0.1.17', created_at: null, commit: { created_at: '2026-04-08T10:00:00Z' } },
        { name: 'mobile-v0.1.16', created_at: null, commit: { created_at: '2026-03-01T10:00:00Z' } },
      ]);
      mockReleasesAll.mockResolvedValue([]);

      const client = createGitLabClient('https://gitlab.example.com', 'token');
      const tags = await client.listTags('mobile/app');

      expect(tags).toEqual([
        { name: 'mobile-v0.1.17', createdAt: '2026-04-08T10:00:00Z', commitDate: '2026-04-08T10:00:00Z', dateSource: 'commit' },
        { name: 'mobile-v0.1.16', createdAt: '2026-03-01T10:00:00Z', commitDate: '2026-03-01T10:00:00Z', dateSource: 'commit' },
      ]);
      expect(mockTagsAll).toHaveBeenCalledWith('mobile/app');
    });

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
