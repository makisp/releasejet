import type { CategorizedIssues, ReleaseJetConfig, Contributor } from '../types.js';

export function extractContributors(
  issues: CategorizedIssues,
  config: ReleaseJetConfig,
  hostUrl: string,
): Contributor[] {
  const allIssues = [
    ...Object.values(issues.categorized).flat(),
    ...issues.uncategorized,
  ];

  const excludeList = config.contributors?.exclude ?? [];
  const excludeSet = new Set(excludeList.map(u => u.toLowerCase()));

  const seen = new Set<string>();
  const usernames: string[] = [];

  for (const issue of allIssues) {
    const username = config.source === 'pull_requests'
      ? issue.author
      : (issue.assignee ?? issue.closedBy);

    if (!username) continue;

    // Filter [bot] suffix (always active)
    if (username.endsWith('[bot]')) continue;

    // Filter excluded usernames (case-insensitive)
    if (excludeSet.has(username.toLowerCase())) continue;

    if (!seen.has(username.toLowerCase())) {
      seen.add(username.toLowerCase());
      usernames.push(username);
    }
  }

  return usernames
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
    .map(username => ({
      username,
      profileUrl: `${hostUrl}/${username}`,
    }));
}
