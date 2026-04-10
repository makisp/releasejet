import type { Issue, Milestone } from '../types.js';

export interface ProviderClient {
  listTags(
    projectPath: string,
  ): Promise<Array<{ name: string; createdAt: string }>>;

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
    options?: {
      search?: string;
      state?: string;
    },
  ): Promise<Milestone[]>;
}
