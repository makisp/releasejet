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

  if (problems.length === 0) {
    console.log('✓ All open issues are properly labeled.');
    return;
  }

  console.log(`⚠ ${problems.length} issues with missing labels:\n`);
  for (const p of problems) {
    console.log(`  #${p.number} - ${p.title}`);
    console.log(`    Missing: ${p.missing.join(', ')}`);
  }
  process.exitCode = 1;
}
