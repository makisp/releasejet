import type { Issue, Milestone, TagDateSource } from '../types.js';

export type { TagDateSource };

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
