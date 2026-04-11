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
import ora from 'ora';

export function registerValidateCommand(program: Command): void {
  program
    .command('validate')
    .description('Check open issues for proper labeling')
    .option('--config <path>', 'Config file path', '.releasejet.yml')
    .option('--debug', 'Show debug information', false)
    .addHelpText('after', `
Examples:
  $ releasejet validate                   Check with default config
  $ releasejet validate --config my.yml   Check with custom config
`)
    .action(withErrorHandler(async (options) => {
      await runValidate(options);
    }));
}

export async function runValidate(options: {
  config: string;
  debug?: boolean;
}): Promise<void> {
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

  let issues;
  try {
    spinner?.start('Fetching open issues...');
    issues = await client.listIssues(projectPath, {
      state: 'opened',
    });
    spinner?.succeed(`Fetched ${issues.length} open issues`);
  } catch (err) {
    spinner?.fail('Failed to fetch issues');
    throw err;
  }

  debug('Fetched', issues.length, 'open issues');

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
