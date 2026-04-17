import { writeFile } from 'node:fs/promises';
import type { Command } from 'commander';
import { loadConfig } from '../../core/config.js';
import {
  getRemoteUrl,
  resolveProjectInfo,
} from '../../core/git.js';
import {
  parseTag,
  findPreviousTag,
  collectOrphanTags,
  formatOrphanError,
} from '../../core/tag-parser.js';
import {
  collectIssues,
  detectMilestone,
} from '../../core/issue-collector.js';
import { formatReleaseNotes } from '../../core/formatter.js';
import { renderCustomTemplate } from '../../core/template-engine.js';
import { extractContributors } from '../../core/contributors.js';
import { createClient } from '../../providers/factory.js';
import { resolveToken } from '../auth.js';
import { promptForUncategorized } from '../prompts.js';
import { withErrorHandler } from '../error-handler.js';
import { createLogger } from '../logger.js';
import { getPluginRuntime } from '../../plugins/loader.js';
import { formatLightweightTagWarning } from '../../core/tag-timestamps.js';
import ora from 'ora';
import type { TagInfo, ReleaseNotesData } from '../../types.js';
import type { ProviderClient } from '../../providers/types.js';

function isTemplatePath(value: string): boolean {
  return value.includes('/') || value.includes('\\') || value.endsWith('.hbs');
}

async function upgradeTagDate(
  client: ProviderClient,
  projectPath: string,
  tag: TagInfo,
): Promise<TagInfo> {
  if (tag.dateSource !== 'commit') return tag;
  if (!client.resolveAnnotatedTagDate) return tag;
  const annotated = await client.resolveAnnotatedTagDate(projectPath, tag.raw);
  if (!annotated) return tag;
  return { ...tag, createdAt: annotated, dateSource: 'annotated' };
}

export function registerGenerateCommand(program: Command): void {
  program
    .command('generate')
    .description('Generate release notes for a tag')
    .requiredOption('--tag <tag>', 'Git tag (e.g., v1.0.0 or mobile-v1.2.0)')
    .option('--publish', 'Publish release to provider', false)
    .option('--dry-run', 'Preview without publishing', false)
    .option('--format <format>', 'Output format (markdown|json)', 'markdown')
    .option('--since <tag>', 'Use this tag as the starting point instead of auto-detecting the previous tag')
    .option('--template <name>', 'Use a custom template from @releasejet/pro')
    .option('--output <file>', 'Write release notes to a file')
    .option('--config <path>', 'Config file path', '.releasejet.yml')
    .option('--debug', 'Show debug information', false)
    .addHelpText('after', `
Examples:
  $ releasejet generate --tag v1.0.0                    Preview release notes
  $ releasejet generate --tag mobile-v2.1.0             Multi-client tag
  $ releasejet generate --tag v1.0.0 --publish          Publish to provider
  $ releasejet generate --tag v1.0.0 --format json      JSON output
  $ releasejet generate --tag v1.0.0 --output notes.md  Write to file
  $ releasejet generate --tag v2.0.0 --since v1.5.0     Notes from v1.5.0 to v2.0.0

The --since flag overrides automatic previous tag detection. Useful for:
  - Spanning multiple versions (e.g., --since v1.5.0 to cover v1.5.0 through v2.0.0)
  - First-time adoption when previous tags don't follow the expected format
  - Hotfix branches where the automatic tag chain doesn't match

Tag format:
  Configured via tagFormat in .releasejet.yml (default: v<semver> or <prefix>-v<semver>)
`)
    .action(withErrorHandler(async (options) => {
      await runGenerate(options);
    }));
}

export async function runGenerate(options: {
  tag: string;
  since?: string;
  publish: boolean;
  dryRun: boolean;
  format: string;
  template?: string;
  output?: string;
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

  const currentParsed = parseTag(options.tag, config.tagFormat);
  debug('Parsed tag:', JSON.stringify(currentParsed));

  let apiTags: Awaited<ReturnType<typeof client.listTags>>;
  try {
    spinner?.start('Fetching tags...');
    apiTags = await client.listTags(projectPath);
    spinner?.succeed(`Fetched ${apiTags.length} tags`);
  } catch (err) {
    spinner?.fail('Failed to fetch tags');
    throw err;
  }
  debug('All remote tags:', apiTags.map(t => `${t.name} (${t.createdAt})`).join(', '));

  const allTags: TagInfo[] = [];
  const unparseableTags: { name: string; createdAt: string }[] = [];
  for (const t of apiTags) {
    try {
      const parsed = parseTag(t.name, config.tagFormat);
      allTags.push({
        ...parsed,
        createdAt: t.createdAt,
        commitDate: t.commitDate,
        dateSource: t.dateSource,
      });
    } catch {
      unparseableTags.push({ name: t.name, createdAt: t.createdAt });
    }
  }

  let currentTag = allTags.find((t) => t.raw === options.tag);
  if (!currentTag) {
    throw new Error(
      `Tag "${options.tag}" not found in remote repository.`,
    );
  }
  currentTag = await upgradeTagDate(client, projectPath, currentTag);
  debug('Current tag:', JSON.stringify(currentTag));

  let previousTag: TagInfo | null;
  if (options.since) {
    previousTag = allTags.find((t) => t.raw === options.since) ?? null;
    if (!previousTag) {
      throw new Error(
        `Tag "${options.since}" (specified by --since) not found in remote repository.`,
      );
    }
    debug('Previous tag (from --since):', JSON.stringify(previousTag));
  } else {
    previousTag = findPreviousTag(allTags, currentTag);
    debug('Previous tag:', previousTag ? JSON.stringify(previousTag) : 'none (first release)');
    if (previousTag === null) {
      const report = collectOrphanTags(allTags, unparseableTags, currentTag);
      if (report.formatMismatch || report.suffix) {
        throw new Error(
          formatOrphanError(
            report,
            currentTag,
            config.tagFormat,
            unparseableTags.length,
          ),
        );
      }
    }
  }
  if (previousTag) {
    previousTag = await upgradeTagDate(client, projectPath, previousTag);
    debug('Previous tag (resolved):', JSON.stringify(previousTag));
  }
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
      allTags,
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

  if (currentTag.dateSource === 'commit') {
    console.error(formatLightweightTagWarning(options.tag));
  }

  const totalCount =
    Object.values(issues.categorized).reduce(
      (sum, arr) => sum + arr.length,
      0,
    ) + issues.uncategorized.length;

  const contributors = config.contributors?.enabled
    ? extractContributors(issues, config, hostUrl)
    : [];

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
    contributors,
  };

  const pluginRuntime = getPluginRuntime();

  const templateName = options.template ?? config.template;

  // Format output
  let output: string;
  if (options.format === 'json') {
    output = JSON.stringify(data, null, 2);
  } else if (templateName && templateName !== 'default') {
    await pluginRuntime?.hooks.beforeFormat.run({ data, config });
    if (isTemplatePath(templateName)) {
      if (!pluginRuntime) {
        throw new Error(
          'Custom templates require @releasejet/pro. Install the plugin and activate a license.',
        );
      }
      output = renderCustomTemplate(templateName, data, config);
    } else {
      if (!pluginRuntime?.hasFormatter(templateName)) {
        throw new Error(
          `Template "${templateName}" not available. Custom templates require @releasejet/pro.`,
        );
      }
      output = pluginRuntime.runFormatter(templateName, data, config);
    }
  } else {
    await pluginRuntime?.hooks.beforeFormat.run({ data, config });
    output = formatReleaseNotes(data, config);
  }

  if (options.output) {
    await writeFile(options.output, output, 'utf-8');
    spinner?.succeed(`Release notes written to ${options.output}`);
  } else {
    console.log(output);
  }

  if (options.format !== 'json') {
    if (options.publish && !options.dryRun) {
      const releaseName = currentParsed.prefix
        ? `${currentParsed.prefix.toUpperCase()} v${currentParsed.version}`
        : `v${currentParsed.version}`;
      try {
        spinner?.start('Publishing release...');
        await client.createRelease(projectPath, {
          tagName: options.tag,
          name: releaseName,
          description: output,
          milestones: milestone ? [milestone.title] : undefined,
        });
        spinner?.succeed(`Release published for ${options.tag}`);
      } catch (err) {
        spinner?.fail('Failed to publish release');
        throw err;
      }
      await pluginRuntime?.hooks.afterPublish.run({
        tagName: options.tag,
        releaseName,
        markdown: output,
        projectUrl: data.projectUrl,
      });
    }
  }
}
