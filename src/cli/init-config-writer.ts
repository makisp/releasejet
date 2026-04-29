import type { ClientConfig } from '../types.js';

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

export function buildConfigYaml(_answers: InitAnswers): string {
  throw new Error('not implemented');
}
