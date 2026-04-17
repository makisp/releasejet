import type { ProviderClient } from '../providers/types.js';
import type {
  TagInfo,
  ReleaseJetConfig,
  CategorizedIssues,
  Issue,
} from '../types.js';
import { findNextSamePrefixTag } from './tag-parser.js';

export async function collectIssues(
  client: ProviderClient,
  projectPath: string,
  currentTag: TagInfo,
  previousTag: TagInfo | null,
  allTags: TagInfo[],
  config: ReleaseJetConfig,
  debug: (...args: unknown[]) => void = () => {},
): Promise<CategorizedIssues> {
  const clientLabel = currentTag.prefix
    ? config.clients.find((c) => c.prefix === currentTag.prefix)?.label
    : undefined;

  // Upper bound: trust resolved createdAt for annotated/release; for commit
  // fallback, expand to next same-prefix tag's createdAt or now().
  let upperBoundIso: string;
  if (currentTag.dateSource === 'commit') {
    const next = findNextSamePrefixTag(allTags, currentTag);
    upperBoundIso = next ? next.createdAt : new Date().toISOString();
    debug(
      'Upper bound:', upperBoundIso,
      `(source: commit → ${next ? 'next same-prefix tag' : 'now()'})`,
    );
  } else {
    upperBoundIso = currentTag.createdAt;
    debug('Upper bound:', upperBoundIso, `(source: ${currentTag.dateSource})`);
  }

  // Lower bound: resolved createdAt of previous tag.
  const lowerBoundIso = previousTag?.createdAt;
  if (previousTag) {
    debug('Lower bound:', lowerBoundIso, `(source: ${previousTag.dateSource})`);
  }

  // API query: use previousTag.commitDate (always ≤ actual tag time) so we
  // don't miss issues whose updatedAt sits between commit and tag-creation.
  const updatedAfter = previousTag?.commitDate;

  debug('Client label filter:', clientLabel ?? 'none (single-client)');
  debug('API query: state=closed, updatedAfter=' + (updatedAfter ?? 'none'));

  const fetchOptions = {
    state: 'closed' as const,
    updatedAfter,
    labels: clientLabel,
  };

  const issues = config.source === 'pull_requests'
    ? await client.listPullRequests(projectPath, fetchOptions)
    : await client.listIssues(projectPath, fetchOptions);

  debug(`API returned ${issues.length} issues:`);
  for (const issue of issues) {
    debug(`  #${issue.number} "${issue.title}" closedAt=${issue.closedAt} labels=[${issue.labels.join(', ')}]`);
  }

  const upperBoundMs = new Date(upperBoundIso).getTime();
  const lowerBoundMs = lowerBoundIso
    ? new Date(lowerBoundIso).getTime()
    : null;

  // Inverted window guard.
  if (lowerBoundMs !== null && upperBoundMs <= lowerBoundMs) {
    debug('Inverted window — returning empty set');
    return { categorized: {}, uncategorized: [] };
  }

  const filtered = issues.filter((issue) => {
    if (!issue.closedAt) return false;
    const closed = new Date(issue.closedAt).getTime();
    if (closed > upperBoundMs) return false;
    if (lowerBoundMs !== null && closed <= lowerBoundMs) return false;
    return true;
  });

  debug(`After closedAt filter: ${filtered.length} issues remain`);

  const categoryLabels = Object.keys(config.categories);
  const categorized: Record<string, Issue[]> = {};
  const uncategorized: Issue[] = [];

  for (const issue of filtered) {
    const matchedLabel = issue.labels.find((l) => categoryLabels.includes(l));
    if (matchedLabel) {
      const heading = config.categories[matchedLabel];
      if (!categorized[heading]) categorized[heading] = [];
      categorized[heading].push(issue);
    } else {
      uncategorized.push(issue);
    }
  }

  return { categorized, uncategorized };
}

export function detectMilestone(
  issues: CategorizedIssues,
): { title: string; url: string } | null {
  const allIssues = [
    ...Object.values(issues.categorized).flat(),
    ...issues.uncategorized,
  ];

  const counts = new Map<string, { count: number; url: string }>();
  for (const issue of allIssues) {
    if (issue.milestone) {
      const existing = counts.get(issue.milestone.title);
      counts.set(issue.milestone.title, {
        count: (existing?.count ?? 0) + 1,
        url: issue.milestone.url,
      });
    }
  }

  if (counts.size === 0) return null;

  // Return the most common milestone
  const [title, { url }] = [...counts.entries()].sort((a, b) => b[1].count - a[1].count)[0];
  return { title, url };
}
