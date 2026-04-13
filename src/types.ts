export interface ClientConfig {
  prefix: string;
  label: string;
}

export interface ContributorsConfig {
  enabled: boolean;
  exclude: string[];
}

export interface Contributor {
  username: string;
  profileUrl: string;
}

export interface ReleaseJetConfig {
  provider: {
    type: 'gitlab' | 'github';
    url: string;
  };
  source: 'issues' | 'pull_requests';
  clients: ClientConfig[];
  categories: Record<string, string>;
  uncategorized: 'lenient' | 'strict';
  contributors?: ContributorsConfig;
}

export interface ParsedTag {
  raw: string;
  prefix: string | null;
  version: string;
  suffix: string | null;
}

export interface TagInfo extends ParsedTag {
  createdAt: string;
}

export interface Issue {
  number: number;
  title: string;
  labels: string[];
  closedAt: string;
  webUrl: string;
  milestone: { title: string; url: string } | null;
  author: string | null;
  assignee: string | null;
  closedBy: string | null;
}

export interface Milestone {
  id: number;
  title: string;
  state: string;
}

export interface CategorizedIssues {
  categorized: Record<string, Issue[]>;
  uncategorized: Issue[];
}

export interface ReleaseNotesData {
  tagName: string;
  version: string;
  clientPrefix: string | null;
  date: string;
  milestone: { title: string; url: string } | null;
  projectUrl: string;
  issues: CategorizedIssues;
  totalCount: number;
  uncategorizedCount: number;
  contributors: Contributor[];
}
