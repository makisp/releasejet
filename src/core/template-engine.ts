import Handlebars from 'handlebars';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ReleaseNotesData, ReleaseJetConfig } from '../types.js';
import { defaultTemplate as defaultTemplateSource } from './templates/default-template.js';

const builtinTemplates: Record<string, string> = {
  default: defaultTemplateSource,
};

const compiledCache = new Map<string, HandlebarsTemplateDelegate>();

export interface TemplateContext {
  data: ReleaseNotesData;
  config: ReleaseJetConfig;
  title: string;
  tagUrl: string;
  metaLine: string;
  categoryEntries: Array<{ heading: string; issues: Array<{ title: string; number: number; url: string }> }>;
  uncategorizedEntries: Array<{ title: string; number: number; url: string }>;
  showUncategorized: boolean;
  hasContributors: boolean;
  contributorsList: string;
}

function buildIssueUrl(
  projectUrl: string,
  number: number,
  providerType: 'github' | 'gitlab',
  source: 'issues' | 'pull_requests',
): string {
  if (providerType === 'github') {
    return source === 'pull_requests'
      ? `${projectUrl}/pull/${number}`
      : `${projectUrl}/issues/${number}`;
  } else {
    return source === 'pull_requests'
      ? `${projectUrl}/-/merge_requests/${number}`
      : `${projectUrl}/-/issues/${number}`;
  }
}

export function buildTemplateContext(
  data: ReleaseNotesData,
  config: ReleaseJetConfig,
): TemplateContext {
  const title = data.clientPrefix
    ? `${data.clientPrefix.toUpperCase()} v${data.version}`
    : `v${data.version}`;

  const tagUrl = config.provider.type === 'github'
    ? `${data.projectUrl}/releases/tag/${data.tagName}`
    : `${data.projectUrl}/-/tags/${data.tagName}`;

  const metaParts = [
    `**Released:** ${data.date}`,
    `**Tag:** [${data.tagName}](${tagUrl})`,
  ];
  if (data.milestone) {
    metaParts.push(`**Milestone:** [${data.milestone.title}](${data.milestone.url})`);
  }
  const issuesSummary = data.uncategorizedCount > 0
    ? `${data.totalCount} closed | ${data.uncategorizedCount} uncategorized`
    : `${data.totalCount} closed`;
  metaParts.push(`**Issues:** ${issuesSummary}`);
  const metaLine = metaParts.join(' | ');

  const categoryOrder = Object.values(config.categories);
  const categoryEntries = categoryOrder
    .filter(heading => {
      const issues = data.issues.categorized[heading];
      return issues && issues.length > 0;
    })
    .map(heading => ({
      heading,
      issues: data.issues.categorized[heading].map(i => ({
        title: i.title,
        number: i.number,
        url: buildIssueUrl(data.projectUrl, i.number, config.provider.type, config.source),
      })),
    }));

  const uncategorizedEntries = data.issues.uncategorized.map(i => ({
    title: i.title,
    number: i.number,
    url: buildIssueUrl(data.projectUrl, i.number, config.provider.type, config.source),
  }));

  const showUncategorized =
    data.issues.uncategorized.length > 0 && config.uncategorized === 'lenient';

  const hasContributors = data.contributors.length > 0;

  const contributorsList = data.contributors
    .map(c => `[@${c.username}](${c.profileUrl})`)
    .join(', ');

  return {
    data,
    config,
    title,
    tagUrl,
    metaLine,
    categoryEntries,
    uncategorizedEntries,
    showUncategorized,
    hasContributors,
    contributorsList,
  };
}

function compileTemplate(key: string, source: string): HandlebarsTemplateDelegate {
  const cached = compiledCache.get(key);
  if (cached) return cached;

  const compiled = Handlebars.compile(source, { noEscape: true });
  compiledCache.set(key, compiled);
  return compiled;
}

export function renderTemplate(
  templateName: string,
  data: ReleaseNotesData,
  config: ReleaseJetConfig,
): string {
  const source = builtinTemplates[templateName];
  if (!source) {
    throw new Error(`Built-in template "${templateName}" not found.`);
  }
  const template = compileTemplate(templateName, source);
  const context = buildTemplateContext(data, config);
  return template(context);
}

export function renderCustomTemplate(
  filePath: string,
  data: ReleaseNotesData,
  config: ReleaseJetConfig,
): string {
  const fullPath = resolve(filePath);
  const source = readFileSync(fullPath, 'utf-8');
  const template = compileTemplate(`custom:${fullPath}`, source);
  const context = buildTemplateContext(data, config);
  return template(context);
}

export function registerBuiltinTemplate(name: string, source: string): void {
  builtinTemplates[name] = source;
  compiledCache.delete(name);
}

export function hasBuiltinTemplate(name: string): boolean {
  return name in builtinTemplates;
}

/** Clear caches (for testing). */
export function clearTemplateCache(): void {
  compiledCache.clear();
}
