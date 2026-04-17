import { Octokit } from '@octokit/rest';
import type { ProviderClient, RemoteTag } from '../providers/types.js';

function parseOwnerRepo(projectPath: string): { owner: string; repo: string } {
  const [owner, repo] = projectPath.split('/');
  return { owner, repo };
}

/** GitLab uses "opened"; GitHub uses "open". */
function toGitHubState(state: string): string {
  return state === 'opened' ? 'open' : state;
}

export function createGitHubClient(
  url: string,
  token: string,
): ProviderClient {
  const baseUrl = url && url !== 'https://github.com'
    ? `${url.replace(/\/$/, '')}/api/v3`
    : undefined;

  const octokit = new Octokit({ auth: token, baseUrl });

  return {
    async listTags(projectPath) {
      const { owner, repo } = parseOwnerRepo(projectPath);
      const [{ data: tags }, releases] = await Promise.all([
        octokit.repos.listTags({ owner, repo, per_page: 100 }),
        octokit.repos.listReleases({ owner, repo, per_page: 100 })
          .then((r) => r.data)
          .catch(() => [] as any[]),
      ]);

      const releaseByTag = new Map<string, string>(
        (releases as any[]).map((r) => [r.tag_name, r.created_at]),
      );

      const result: RemoteTag[] = [];
      for (const tag of tags) {
        const { data: commit } = await octokit.repos.getCommit({
          owner, repo, ref: tag.commit.sha,
        });
        const commitDate = commit.commit.committer?.date ?? '';
        const releaseDate = releaseByTag.get(tag.name);
        result.push({
          name: tag.name,
          createdAt: releaseDate ?? commitDate,
          commitDate,
          dateSource: releaseDate ? 'release' : 'commit',
        });
      }
      return result;
    },

    async listIssues(projectPath, options) {
      const { owner, repo } = parseOwnerRepo(projectPath);
      const params: Record<string, unknown> = {
        owner,
        repo,
        state: toGitHubState(options.state ?? 'closed'),
        per_page: 100,
      };
      if (options.updatedAfter) params.since = options.updatedAfter;
      if (options.labels) params.labels = options.labels;

      const { data: issues } = await octokit.issues.listForRepo(params as any);

      return issues
        .filter((i: any) => !i.pull_request)
        .map((i: any) => ({
          number: i.number,
          title: i.title,
          labels: (i.labels as any[]).map((l: any) => (typeof l === 'string' ? l : l.name)),
          closedAt: i.closed_at ?? '',
          webUrl: i.html_url,
          milestone: i.milestone ? { title: i.milestone.title, url: i.milestone.html_url } : null,
          author: i.user?.login ?? null,
          assignee: i.assignees?.[0]?.login ?? i.assignee?.login ?? null,
          closedBy: i.closed_by?.login ?? null,
        }));
    },

    async listPullRequests(projectPath, options) {
      const { owner, repo } = parseOwnerRepo(projectPath);
      const params: Record<string, unknown> = {
        owner,
        repo,
        state: toGitHubState(options.state ?? 'closed'),
        per_page: 100,
      };

      const { data: prs } = await octokit.pulls.list(params as any);

      return prs
        .filter((pr: any) => pr.merged_at !== null)
        .map((pr: any) => ({
          number: pr.number,
          title: pr.title,
          labels: (pr.labels as any[]).map((l: any) => (typeof l === 'string' ? l : l.name)),
          closedAt: pr.closed_at ?? '',
          webUrl: pr.html_url,
          milestone: pr.milestone ? { title: pr.milestone.title, url: pr.milestone.html_url } : null,
          author: pr.user?.login ?? null,
          assignee: pr.assignees?.[0]?.login ?? pr.assignee?.login ?? null,
          closedBy: null,
        }));
    },

    async createRelease(projectPath, options) {
      const { owner, repo } = parseOwnerRepo(projectPath);
      try {
        await octokit.repos.createRelease({
          owner,
          repo,
          tag_name: options.tagName,
          name: options.name,
          body: options.description,
        });
      } catch (err: any) {
        if (err.status === 422) {
          const { data: existing } = await octokit.repos.getReleaseByTag({
            owner,
            repo,
            tag: options.tagName,
          });
          await octokit.repos.updateRelease({
            owner,
            repo,
            release_id: existing.id,
            name: options.name,
            body: options.description,
          });
        } else {
          throw err;
        }
      }
    },

    async listMilestones(projectPath, options) {
      const { owner, repo } = parseOwnerRepo(projectPath);
      const params: Record<string, unknown> = { owner, repo, per_page: 100 };
      if (options?.state) params.state = toGitHubState(options.state) as any;

      const { data: milestones } = await octokit.issues.listMilestones(params as any);

      return milestones.map((m: any) => ({
        id: m.number,
        title: m.title,
        state: m.state,
      }));
    },
  };
}
