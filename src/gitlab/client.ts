import { Gitlab } from '@gitbeaker/rest';
import type { Issue, Milestone } from '../types.js';
import type { RemoteTag } from '../providers/types.js';

export interface GitLabClientInterface {
  listTags(
    projectPath: string,
  ): Promise<RemoteTag[]>;

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
    options?: {
      state?: 'opened' | 'closed';
      updatedAfter?: string;
      labels?: string;
    },
  ): Promise<Issue[]>;

  createRelease(
    projectPath: string,
    options: { tagName: string; name: string; description: string; milestones?: string[] },
  ): Promise<void>;

  listMilestones(
    projectPath: string,
    options?: { search?: string; state?: string },
  ): Promise<Milestone[]>;
}

export function createGitLabClient(
  url: string,
  token: string,
): GitLabClientInterface {
  const api = new Gitlab({ host: url, token });

  return {
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

    async listIssues(projectPath, options) {
      const params: Record<string, unknown> = {
        projectId: projectPath,
        state: options.state ?? 'closed',
      };
      if (options.updatedAfter) params.updatedAfter = options.updatedAfter;
      if (options.labels) params.labels = options.labels;

      const issues = await api.Issues.all(params);

      return (issues as any[]).map((i) => ({
        number: i.iid,
        title: i.title,
        labels: i.labels as string[],
        closedAt: i.closed_at ?? '',
        webUrl: i.web_url,
        milestone: i.milestone ? { title: i.milestone.title, url: i.milestone.web_url } : null,
        author: i.author?.username ?? null,
        assignee: i.assignees?.[0]?.username ?? i.assignee?.username ?? null,
        closedBy: i.closed_by?.username ?? null,
      }));
    },

    async listPullRequests(_projectPath, _options) {
      throw new Error('listPullRequests is not supported by the GitLab provider');
    },

    async createRelease(projectPath, options) {
      const params: Record<string, unknown> = {
        tag_name: options.tagName,
        name: options.name,
        description: options.description,
      };
      if (options.milestones?.length) {
        params.milestones = options.milestones;
      }
      try {
        await api.ProjectReleases.create(projectPath, params as any);
      } catch (err: any) {
        if (err.cause?.response?.status === 409 || err.message?.includes('already exists')) {
          await api.ProjectReleases.edit(projectPath, options.tagName, {
            name: options.name,
            description: options.description,
            milestones: options.milestones,
          } as any);
        } else {
          throw err;
        }
      }
    },

    async listMilestones(projectPath, options) {
      const params: Record<string, unknown> = {};
      if (options?.search) params.search = options.search;
      if (options?.state) params.state = options.state;

      const milestones = await api.ProjectMilestones.all(projectPath, params);

      return (milestones as any[]).map((m) => ({
        id: m.id,
        title: m.title,
        state: m.state,
      }));
    },
  };
}
