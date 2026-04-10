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
import type { TagInfo, ReleaseNotesData } from '../../types.js';

export function registerGenerateCommand(program: Command): void {
  program
    .command('generate')
    .description('Generate release notes for a tag')
    .requiredOption('--tag <tag>', 'Git tag to generate release notes for')
    .option('--publish', 'Publish release', false)
    .option('--dry-run', 'Preview without publishing', false)
    .option('--format <format>', 'Output format (markdown|json)', 'markdown')
    .option('--config <path>', 'Config file path', '.releasejet.yml')
    .option('--debug', 'Show debug information', false)
    .action(async (options) => {
      await runGenerate(options);
    });
}

export async function runGenerate(options: {
  tag: string;
  publish: boolean;
  dryRun: boolean;
  format: string;
  config: string;
  debug?: boolean;
}): Promise<void> {
  const debug = options.debug ? (...args: unknown[]) => console.error('[DEBUG]', ...args) : () => {};

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

  const apiTags = await client.listTags(projectPath);
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

  const issues = await collectIssues(
    client,
    projectPath,
    currentTag,
    previousTag,
    config,
    debug,
  );

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
      await client.createRelease(projectPath, {
        tagName: options.tag,
        name: releaseName,
        description: markdown,
        milestones: milestone ? [milestone] : undefined,
      });
      console.log(`\n✓ Release published for ${options.tag}`);
    }
  }
}
