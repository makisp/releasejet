import type { Command } from 'commander';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { input } from '@inquirer/prompts';
import {
  generateCiBlock,
  generateGitHubActionsTemplate,
  hasCiBlock,
  appendCiBlock,
  DEFAULT_TAGS,
  GITHUB_ACTIONS_PATH,
  GITLAB_CI_PATH,
} from '../../core/ci.js';
import { hasActivePro } from '../../license/detect.js';
import { getRemoteUrl, detectProviderFromRemote } from '../../core/git.js';
import { withErrorHandler } from '../error-handler.js';
import { createLogger } from '../logger.js';

function printSecretInstructions(): void {
  console.log('');
  console.log('Add RELEASEJET_PRO_TOKEN to your repo secrets:');
  console.log('  GitHub: Settings → Secrets → Actions → New secret');
  console.log('  GitLab: Settings → CI/CD → Variables');
  console.log('  Value: your rlj_ license key');
}

export function registerCiCommand(program: Command): void {
  const ci = program
    .command('ci')
    .description('Manage CI/CD integration')
    .addHelpText('after', `
Examples:
  $ releasejet ci enable                   Interactive setup
  $ releasejet ci enable --tags ci,docker  Non-interactive with tags
  $ releasejet ci enable --pro             Generate Pro CI template
  $ releasejet ci disable                  Remove CI configuration
`);

  ci.command('enable')
    .description('Add ReleaseJet CI configuration')
    .option('--tags <tags>', 'Runner tags (comma-separated, GitLab only)')
    .option('--pro', 'Generate Pro template with private registry setup')
    .option('--debug', 'Show debug information', false)
    .action(withErrorHandler(async (options) => {
      await runCiEnable(options);
    }));

  ci.command('disable')
    .description('Remove ReleaseJet CI configuration')
    .action(withErrorHandler(async () => {
      await runCiDisable();
    }));
}

export async function runCiEnable(options: {
  tags?: string;
  pro?: boolean;
  debug?: boolean;
}): Promise<void> {
  const { debug } = createLogger(options.debug ?? false);

  // Determine if Pro template should be used
  let usePro = options.pro ?? false;
  if (!usePro) {
    usePro = await hasActivePro();
    if (usePro) {
      debug('Active Pro license detected, using Pro template');
    }
  }

  // Detect provider
  let provider: 'gitlab' | 'github' = 'gitlab';
  try {
    const remoteUrl = getRemoteUrl();
    provider = detectProviderFromRemote(remoteUrl);
    debug('Detected provider:', provider);
  } catch {
    debug('Could not detect provider from remote, defaulting to GitLab');
  }

  if (provider === 'github') {
    await enableGitHubActions(usePro, debug);
  } else {
    await enableGitLabCi(options, usePro, debug);
  }

  if (usePro) {
    printSecretInstructions();
  }
}

async function enableGitHubActions(
  pro: boolean,
  debug: (...args: unknown[]) => void,
): Promise<void> {
  let exists = false;
  try {
    await readFile(GITHUB_ACTIONS_PATH, 'utf-8');
    exists = true;
  } catch {
    // File doesn't exist
  }

  if (exists) {
    console.log('GitHub Actions workflow already exists.');
    return;
  }

  const template = generateGitHubActionsTemplate({ pro });
  debug('Generated GitHub Actions template, pro:', pro);

  await mkdir('.github/workflows', { recursive: true });
  await writeFile(GITHUB_ACTIONS_PATH, template);

  const suffix = pro ? ' (with Pro support)' : '';
  console.log(`✓ Created .github/workflows/release-notes.yml${suffix}`);
}

async function enableGitLabCi(
  options: { tags?: string; debug?: boolean },
  pro: boolean,
  debug: (...args: unknown[]) => void,
): Promise<void> {
  let existing = '';
  try {
    existing = await readFile(GITLAB_CI_PATH, 'utf-8');
    debug('Existing .gitlab-ci.yml found, length:', existing.length);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    debug('.gitlab-ci.yml not found, will create new file');
  }

  const hasMarkers = hasCiBlock(existing);
  debug('ReleaseJet markers found:', hasMarkers);

  if (hasMarkers) {
    console.log('ReleaseJet CI is already enabled.');
    return;
  }

  let tags: string[];
  if (options.tags) {
    tags = options.tags.split(',').map((t) => t.trim()).filter(Boolean);
  } else {
    const tagsInput = await input({
      message: 'Runner tags (comma-separated, or Enter for "short-duration"):',
    });
    tags = tagsInput.trim()
      ? tagsInput.split(',').map((t) => t.trim()).filter(Boolean)
      : DEFAULT_TAGS;
  }

  const block = generateCiBlock(tags, { pro });
  debug('Generated CI block, pro:', pro);

  const content = appendCiBlock(existing, block);
  await writeFile(GITLAB_CI_PATH, content);

  const suffix = pro ? ' (with Pro support)' : '';
  console.log(`✓ ReleaseJet CI configuration added to .gitlab-ci.yml${suffix}`);
}

export async function runCiDisable(): Promise<void> {
  // Try GitHub Actions first
  try {
    const ghContent = await readFile(GITHUB_ACTIONS_PATH, 'utf-8');
    if (ghContent) {
      const { unlink } = await import('node:fs/promises');
      await unlink(GITHUB_ACTIONS_PATH);
      console.log('✓ Removed .github/workflows/release-notes.yml');
      return;
    }
  } catch {
    // File doesn't exist, check GitLab
  }

  // Try GitLab CI
  let existing: string;
  try {
    existing = await readFile(GITLAB_CI_PATH, 'utf-8');
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    console.log('ReleaseJet CI is not configured.');
    return;
  }

  if (!hasCiBlock(existing)) {
    console.log('ReleaseJet CI is not configured.');
    return;
  }

  const { removeCiBlock } = await import('../../core/ci.js');
  const cleaned = removeCiBlock(existing);
  if (cleaned.trim().length === 0) {
    const { unlink } = await import('node:fs/promises');
    await unlink(GITLAB_CI_PATH);
    console.log('✓ Removed .gitlab-ci.yml (no other configuration found)');
  } else {
    await writeFile(GITLAB_CI_PATH, cleaned + '\n');
    console.log('✓ ReleaseJet CI configuration removed from .gitlab-ci.yml');
  }
}
