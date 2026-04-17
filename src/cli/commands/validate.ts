import type { Command } from 'commander';
import { loadConfig } from '../../core/config.js';
import {
  getRemoteUrl,
  resolveHostUrl,
  resolveProjectPath,
} from '../../core/git.js';
import { createClient } from '../../providers/factory.js';
import { resolveToken } from '../auth.js';
import { withErrorHandler } from '../error-handler.js';
import { createLogger } from '../logger.js';
import type { Issue } from '../../types.js';
import { validateTag } from '../../core/tag-parser.js';
import type { TagValidationResult } from '../../core/tag-parser.js';
import ora from 'ora';

export function registerValidateCommand(program: Command): void {
  program
    .command('validate')
    .description('Check issues and tags for release readiness')
    .option('--config <path>', 'Config file path', '.releasejet.yml')
    .option('--milestone <title>', 'Only check issues in this milestone')
    .option('--state <state>', 'Issue state: opened, closed, or all', 'opened')
    .option('--recent <days>', 'Only check issues updated in last N days', parseInt)
    .option('--debug', 'Show debug information', false)
    .addHelpText('after', `
Examples:
  $ releasejet validate                              Check open issues + tag format
  $ releasejet validate --milestone v1.2.0           Check issues in milestone v1.2.0
  $ releasejet validate --state closed --recent 30   Check recently closed issues
  $ releasejet validate --config my.yml              Check with custom config
`)
    .action(withErrorHandler(async (options) => {
      await runValidate(options);
    }));
}

export async function runValidate(options: {
  config: string;
  debug?: boolean;
  milestone?: string;
  state?: 'opened' | 'closed' | 'all';
  recent?: number;
}): Promise<void> {
  const state = options.state ?? 'opened';

  if ((state === 'closed' || state === 'all') && options.recent === undefined) {
    throw new Error('--recent is required when --state is "closed" or "all" to prevent unbounded queries.');
  }

  const { debug } = createLogger(options.debug ?? false);
  const spinner = options.debug ? null : ora({ stream: process.stderr });

  const config = await loadConfig(options.config);
  debug('Config loaded:', JSON.stringify(config, null, 2));

  const remoteUrl = getRemoteUrl();
  const hostUrl = config.provider.url || resolveHostUrl(remoteUrl);
  const projectPath = resolveProjectPath(remoteUrl);
  debug('Host URL:', hostUrl);
  debug('Project path:', projectPath);

  const token = await resolveToken(config.provider.type);
  const client = createClient(config, token);

  // --- Tag Format Check ---
  let tagResults: TagValidationResult[] = [];
  let remoteTags: Awaited<ReturnType<typeof client.listTags>> = [];
  try {
    spinner?.start('Fetching tags...');
    remoteTags = await client.listTags(projectPath);
    tagResults = remoteTags.map((t) => validateTag(t.name, config));
    spinner?.succeed(`Fetched ${remoteTags.length} tags`);
  } catch (err) {
    spinner?.fail('Failed to fetch tags');
    throw err;
  }

  // Fetch issues based on state
  const fetchStates: Array<'opened' | 'closed'> = state === 'all'
    ? ['opened', 'closed']
    : [state as 'opened' | 'closed'];

  let issues: Issue[] = [];
  try {
    spinner?.start('Fetching issues...');
    for (const s of fetchStates) {
      const batch = await client.listIssues(projectPath, { state: s });
      issues.push(...batch);
    }
    spinner?.succeed(`Fetched ${issues.length} issues`);
  } catch (err) {
    spinner?.fail('Failed to fetch issues');
    throw err;
  }

  debug('Fetched', issues.length, 'issues');

  // Apply milestone filter (client-side)
  if (options.milestone) {
    issues = issues.filter((i) => i.milestone?.title === options.milestone);
    debug(`After milestone filter "${options.milestone}": ${issues.length} issues`);
  }

  // Apply recency filter (client-side)
  if (options.recent !== undefined) {
    const cutoff = new Date(Date.now() - options.recent * 24 * 60 * 60 * 1000);
    issues = issues.filter((i) => {
      const date = i.closedAt ? new Date(i.closedAt) : new Date(); // open issues are "recent"
      return date >= cutoff;
    });
    debug(`After recency filter (${options.recent} days): ${issues.length} issues`);
  }

  const categoryLabels = Object.keys(config.categories);
  const clientLabels = config.clients.map((c) => c.label);
  const isMultiClient = clientLabels.length > 0;

  debug('Category labels:', categoryLabels);
  debug('Client labels:', clientLabels.length > 0 ? clientLabels : 'none (single-client)');

  const problems: Array<{
    number: number;
    title: string;
    missing: string[];
  }> = [];

  for (const issue of issues) {
    const missing: string[] = [];

    if (
      isMultiClient &&
      !issue.labels.some((l) => clientLabels.includes(l))
    ) {
      missing.push('client label');
    }

    if (!issue.labels.some((l) => categoryLabels.includes(l))) {
      missing.push('category label');
    }

    if (missing.length > 0) {
      debug(`  #${issue.number} "${issue.title}" labels=[${issue.labels.join(', ')}] missing=[${missing.join(', ')}]`);
      problems.push({ number: issue.number, title: issue.title, missing });
    }
  }

  // --- Output ---
  const validTags = tagResults.filter((t) => t.valid);
  const invalidTags = tagResults.filter((t) => !t.valid);

  // Tag Format section
  console.log('Tag Format');
  if (validTags.length > 0) {
    console.log(`  \u2713 ${validTags.length} ${validTags.length === 1 ? 'tag' : 'tags'} OK`);
  }
  if (invalidTags.length > 0) {
    console.log(`  \u26a0 ${invalidTags.length} ${invalidTags.length === 1 ? 'tag' : 'tags'} with issues:`);
    for (const t of invalidTags) {
      console.log(`    ${t.tag}  \u2014 ${t.reason}`);
    }
  }

  // Tag Timestamps section
  const annotatedTags = remoteTags.filter((t) => t.dateSource === 'annotated');
  const releaseTags = remoteTags.filter((t) => t.dateSource === 'release');
  const commitTags = remoteTags.filter((t) => t.dateSource === 'commit');
  const timestampWarnings = commitTags.length;

  if (remoteTags.length > 0) {
    console.log('');
    console.log('Tag Timestamps');
    if (annotatedTags.length > 0) {
      console.log(`  \u2713 ${annotatedTags.length} annotated ${annotatedTags.length === 1 ? 'tag' : 'tags'}`);
    }
    if (releaseTags.length > 0) {
      console.log(
        `  \u2713 ${releaseTags.length} ${releaseTags.length === 1 ? 'tag' : 'tags'} resolved via release object`,
      );
    }
    if (commitTags.length > 0) {
      console.log(
        `  \u26a0 ${commitTags.length} lightweight ${commitTags.length === 1 ? 'tag' : 'tags'} without a release (commit-date fallback):`,
      );
      for (const t of commitTags) {
        console.log(`    ${t.name}`);
      }
      console.log('    Tip: create annotated tags or attach a release object.');
      console.log('    See README > Tag Timestamps.');
    }
  }

  // Issue Labels section
  const milestoneLabel = options.milestone ? `, milestone: ${options.milestone}` : '';
  console.log('');
  console.log(`Issue Labels (${state}${milestoneLabel})`);

  const okCount = issues.length - problems.length;
  if (okCount > 0) {
    console.log(`  \u2713 ${okCount} ${okCount === 1 ? 'issue' : 'issues'} properly labeled`);
  }
  if (problems.length > 0) {
    console.log(`  \u26a0 ${problems.length} ${problems.length === 1 ? 'issue' : 'issues'} with missing labels:`);
    for (const p of problems) {
      console.log(`    #${p.number} - ${p.title}`);
      console.log(`      Missing: ${p.missing.join(', ')}`);
    }
  }

  // Summary
  console.log('');
  console.log(
    `Summary: ${invalidTags.length} tag ${invalidTags.length === 1 ? 'warning' : 'warnings'}, ` +
    `${timestampWarnings} tag timestamp ${timestampWarnings === 1 ? 'warning' : 'warnings'}, ` +
    `${problems.length} label ${problems.length === 1 ? 'problem' : 'problems'}`,
  );

  if (problems.length > 0) {
    process.exitCode = 1;
  }
}
