import type { Command } from 'commander';
import { loadConfig } from '../../core/config.js';
import {
  getRemoteUrl,
  resolveProjectInfo,
} from '../../core/git.js';
import { parseTag, findPreviousTag } from '../../core/tag-parser.js';
import {
  collectIssues,
  detectMilestone,
} from '../../core/issue-collector.js';
import { formatReleaseNotes } from '../../core/formatter.js';
import { createClient } from '../../providers/factory.js';
import { resolveToken } from '../auth.js';
import { promptForUncategorized } from '../prompts.js';
import { withErrorHandler } from '../error-handler.js';
import { createLogger } from '../logger.js';
import ora from 'ora';
import type { TagInfo, ReleaseNotesData } from '../../types.js';

export function registerGenerateCommand(program: Command): void {
  program
    .command('generate')
    .description('Generate release notes for a tag')
    .requiredOption('--tag <tag>', 'Git tag (e.g., v1.0.0 or mobile-v1.2.0)')
    .option('--publish', 'Publish release to provider', false)
    .option('--dry-run', 'Preview without publishing', false)
    .option('--format <format>', 'Output format (markdown|json)', 'markdown')
    .option('--config <path>', 'Config file path', '.releasejet.yml')
    .option('--debug', 'Show debug information', false)
    .addHelpText('after', `
Examples:
  $ releasejet generate --tag v1.0.0                Preview release notes
  $ releasejet generate --tag mobile-v2.1.0         Multi-client tag
  $ releasejet generate --tag v1.0.0 --publish      Publish to provider
  $ releasejet generate --tag v1.0.0 --format json  JSON output

Tag format:
  Multi-client:  <prefix>-v<semver>  (e.g., mobile-v1.2.0)
  Single-client: v<semver>           (e.g., v1.2.0)
`)
    .action(withErrorHandler(async (options) => {
      await runGenerate(options);
    }));
}

export async function runGenerate(options: {
  tag: string;
  publish: boolean;
  dryRun: boolean;
  format: string;
  config: string;
  debug?: boolean;
}): Promise<void> {
  const { debug } = createLogger(options.debug ?? false);
  const spinner = options.debug ? null : ora({ stream: process.stderr });

  const config = await loadConfig(options.config);
  debug('Config loaded:', JSON.stringify(config, null, 2));

  const remoteUrl = process.env.CI_SERVER_URL || process.env.GITHUB_SERVER_URL ? '' : getRemoteUrl();
  const { hostUrl: detectedUrl, projectPath } = resolveProjectInfo(remoteUrl);
  const hostUrl = config.provider.url || detectedUrl;
  debug('Host URL:', hostUrl);
  debug('Project path:', projectPath);

  const token = await resolveToken(config.provider.type);
  const client = createClient(config, token);

  const currentParsed = parseTag(options.tag);
  debug('Parsed tag:', JSON.stringify(currentParsed));

  let apiTags: Array<{ name: string; createdAt: string }>;
  try {
    spinner?.start('Fetching tags...');
    apiTags = await client.listTags(projectPath);
    spinner?.succeed(`Fetched ${apiTags.length} tags`);
  } catch (err) {
    spinner?.fail('Failed to fetch tags');
    throw err;
  }
  debug('All remote tags:', apiTags.map(t => `${t.name} (${t.createdAt})`).join(', '));

  const allTags: TagInfo[] = apiTags
    .map((t) => {
      try {
        const parsed = parseTag(t.name);
        return { ...parsed, createdAt: t.createdAt };
      } catch {
        return null;
      }
    })
    .filter((t): t is TagInfo => t !== null);

  const currentTag = allTags.find((t) => t.raw === options.tag);
  if (!currentTag) {
    throw new Error(
      `Tag "${options.tag}" not found in remote repository.`,
    );
  }
  debug('Current tag:', JSON.stringify(currentTag));

  const previousTag = findPreviousTag(allTags, currentTag);
  debug('Previous tag:', previousTag ? JSON.stringify(previousTag) : 'none (first release)');
  debug('Date range:', previousTag?.createdAt ?? 'beginning', '->', currentTag.createdAt);

  const sourceLabel = config.source === 'pull_requests' ? 'pull requests' : 'issues';
  let issues;
  try {
    spinner?.start(`Collecting ${sourceLabel}...`);
    issues = await collectIssues(
      client,
      projectPath,
      currentTag,
      previousTag,
      config,
      debug,
    );
    const issueCount = Object.values(issues.categorized).reduce((sum, arr) => sum + arr.length, 0) + issues.uncategorized.length;
    spinner?.succeed(`Collected ${issueCount} ${sourceLabel}`);
  } catch (err) {
    spinner?.fail(`Failed to collect ${sourceLabel}`);
    throw err;
  }

  // Handle uncategorized issues
  if (issues.uncategorized.length > 0) {
    if (process.stdin.isTTY) {
      await promptForUncategorized(issues, config);
    } else if (config.uncategorized === 'strict') {
      console.error('Error: Uncategorized issues found (strict mode):');
      for (const issue of issues.uncategorized) {
        console.error(`  #${issue.number} - ${issue.title}`);
      }
      process.exitCode = 1;
      return;
    }
  }

  const milestone = detectMilestone(issues);

  const totalCount =
    Object.values(issues.categorized).reduce(
      (sum, arr) => sum + arr.length,
      0,
    ) + issues.uncategorized.length;

  const data: ReleaseNotesData = {
    tagName: options.tag,
    version: currentParsed.version,
    clientPrefix: currentParsed.prefix,
    date: currentTag.createdAt.split('T')[0],
    milestone,
    projectUrl: `${hostUrl}/${projectPath}`,
    issues,
    totalCount,
    uncategorizedCount: issues.uncategorized.length,
  };

  if (options.format === 'json') {
    console.log(JSON.stringify(data, null, 2));
  } else {
    const markdown = formatReleaseNotes(data, config);
    console.log(markdown);

    if (options.publish && !options.dryRun) {
      const releaseName = currentParsed.prefix
        ? `${currentParsed.prefix.toUpperCase()} v${currentParsed.version}`
        : `v${currentParsed.version}`;
      try {
        spinner?.start('Publishing release...');
        await client.createRelease(projectPath, {
          tagName: options.tag,
          name: releaseName,
          description: markdown,
          milestones: milestone ? [milestone] : undefined,
        });
        spinner?.succeed(`Release published for ${options.tag}`);
      } catch (err) {
        spinner?.fail('Failed to publish release');
        throw err;
      }
    }
  }
}
