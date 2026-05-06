import type { ClientConfig, JiraConfig } from '../types.js';

export interface InitAnswers {
  providerType: 'github' | 'gitlab';
  providerUrl: string;
  /** Set only when providerType === 'github'. */
  source?: 'issues' | 'pull_requests';
  /** Empty array for single-client repos. */
  clients: ClientConfig[];
  tagFormat: string;
  /** Insertion order is preserved in output. */
  categories: Record<string, string>;
  uncategorized: 'lenient' | 'strict';
  contributors: { enabled: boolean; exclude: string[] };
  /** Optional Jira ticket-linking config (F3). When undefined, the writer
   *  emits a commented-out placeholder for discoverability. */
  jira?: JiraConfig;
}

export function projectNameSection(): string {
  return [
    '# Optional. Overrides the project name shown in notifications.',
    '# Defaults to the last path segment of projectUrl.',
    '# projectName: "My Project"',
  ].join('\n');
}

export function providerSection(
  type: 'github' | 'gitlab',
  url: string,
): string {
  return [
    '# Which provider hosts your repository.',
    'provider:',
    `  type: ${type}            # github | gitlab`,
    `  url: ${url}`,
  ].join('\n');
}

export function sourceSection(source: 'issues' | 'pull_requests'): string {
  // Pad value to width 18 so the '#' aligns across all values.
  const padded = source.padEnd(18, ' ');
  return [
    '# What to summarise in release notes.',
    `source: ${padded}# issues | pull_requests`,
  ].join('\n');
}

export function clientsSection(clients: ClientConfig[]): string {
  if (clients.length === 0) {
    return [
      '# Multi-client repos: define tag prefixes and labels.',
      '# clients:',
      '#   - prefix: mobile',
      '#     label: MOBILE',
    ].join('\n');
  }
  const entries = clients.flatMap((c) => [
    `  - prefix: ${c.prefix}`,
    `    label: ${c.label}`,
  ]);
  return [
    '# Define tag prefixes and labels for each client.',
    'clients:',
    ...entries,
  ].join('\n');
}

export function tagFormatSection(format: string): string {
  // Pad to a minimum width of 13 so the inline comment aligns with other sections.
  const padded = format.length < 13 ? format.padEnd(13, ' ') : format;
  return [
    '# How your git tags are structured. {version} is required; {prefix} is multi-client only.',
    `tagFormat: ${padded}  # e.g. v{version}, {version}, {prefix}-v{version}`,
  ].join('\n');
}

export function categoriesSection(map: Record<string, string>): string {
  const entries = Object.entries(map).map(
    ([label, heading]) => `  ${label}: ${JSON.stringify(heading)}`,
  );
  return [
    '# Map issue/PR labels to release-note section headings. Output order matches this map.',
    'categories:',
    ...entries,
  ].join('\n');
}

export function uncategorizedSection(mode: 'lenient' | 'strict'): string {
  // Pad to width of 'lenient' (7) so '#' aligns; trailing 4 spaces before '#'.
  const padded = mode.padEnd(7, ' ');
  return [
    '# How to handle issues with no matching label.',
    `uncategorized: ${padded}    # lenient | strict`,
  ].join('\n');
}

export function descriptionSection(): string {
  return [
    '# Issue/PR description rendering. Renders cleaned body as a sub-bullet under each item.',
    'description: none         # none | extract',
  ].join('\n');
}

export function templateSection(): string {
  return [
    '# Release notes template. "default" is built-in; named/path values require @releasejet/pro.',
    'template: default',
  ].join('\n');
}

export function contributorsSection(
  cfg: { enabled: boolean; exclude: string[] },
): string {
  const enabledStr = String(cfg.enabled);
  const excludeStr =
    cfg.exclude.length === 0 ? '[]' : `[${cfg.exclude.join(', ')}]`;
  // Ensure at least 6 spaces of gap between any value and the '#' comment,
  // with a floor of 15 to match the visual rhythm of adjacent sections.
  const width = Math.max(15, enabledStr.length + 6, excludeStr.length + 6);
  const padEnabled = enabledStr.padEnd(width, ' ');
  const padExclude = excludeStr.padEnd(width, ' ');
  return [
    '# Contributors section in release notes.',
    'contributors:',
    `  enabled: ${padEnabled}# true | false`,
    `  exclude: ${padExclude}# usernames to skip (e.g. dependabot, renovate)`,
  ].join('\n');
}

export function aiSection(): string {
  return [
    '# AI-powered descriptions and release overview (Pro M3).',
    '# Sends issue titles, bodies, and labels to releasejet.dev for summarisation.',
    '# See https://releasejet.dev/docs/pro/ai',
    '# ai:',
    '#   allowDataEgress: true',
    '# description: ai',
    '# aiSummary:',
    '#   enabled: true',
  ].join('\n');
}

export function jiraSection(jira: JiraConfig | undefined): string {
  const header = [
    '# Jira ticket linking — append [PROJ-123] links next to each issue/PR',
    '# when a configured project key is detected in the title or body.',
  ];
  if (!jira) {
    return [
      ...header,
      '#',
      '# jira:',
      '#   baseUrl: https://acme.atlassian.net',
      '#   projects: [PROJ, BUG]',
    ].join('\n');
  }
  const projectsList = `[${jira.projects.join(', ')}]`;
  return [
    ...header,
    'jira:',
    `  baseUrl: ${jira.baseUrl}`,
    `  projects: ${projectsList}`,
  ].join('\n');
}

export function buildConfigYaml(answers: InitAnswers): string {
  const parts: string[] = [
    projectNameSection(),
    providerSection(answers.providerType, answers.providerUrl),
  ];

  if (answers.providerType === 'github') {
    parts.push(sourceSection(answers.source ?? 'issues'));
  }

  parts.push(clientsSection(answers.clients));
  parts.push(tagFormatSection(answers.tagFormat));
  parts.push(categoriesSection(answers.categories));
  parts.push(uncategorizedSection(answers.uncategorized));
  parts.push(descriptionSection());
  parts.push(templateSection());
  parts.push(contributorsSection(answers.contributors));
  parts.push(jiraSection(answers.jira));
  parts.push(aiSection());

  return parts.join('\n\n') + '\n';
}
