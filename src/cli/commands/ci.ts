import type { Command } from 'commander';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { input } from '@inquirer/prompts';
import {
  generateCiBlock,
  hasCiBlock,
  appendCiBlock,
  removeCiBlock,
  DEFAULT_TAGS,
} from '../../core/ci.js';
import { withErrorHandler } from '../error-handler.js';
import { createLogger } from '../logger.js';

const CI_FILE = '.gitlab-ci.yml';

export function registerCiCommand(program: Command): void {
  const ci = program
    .command('ci')
    .description('Manage GitLab CI/CD integration')
    .addHelpText('after', `
Examples:
  $ releasejet ci enable                   Interactive setup
  $ releasejet ci enable --tags ci,docker  Non-interactive with tags
  $ releasejet ci disable                  Remove CI configuration
`);

  ci.command('enable')
    .description('Add ReleaseJet CI configuration to .gitlab-ci.yml')
    .option('--tags <tags>', 'Runner tags (comma-separated)')
    .option('--debug', 'Show debug information', false)
    .action(withErrorHandler(async (options) => {
      await runCiEnable(options);
    }));

  ci.command('disable')
    .description('Remove ReleaseJet CI configuration from .gitlab-ci.yml')
    .action(withErrorHandler(async () => {
      await runCiDisable();
    }));
}

export async function runCiEnable(options: { tags?: string; debug?: boolean }): Promise<void> {
  const { debug } = createLogger(options.debug ?? false);

  let existing = '';
  try {
    existing = await readFile(CI_FILE, 'utf-8');
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

  const block = generateCiBlock(tags);
  debug('Generated CI block:\n' + block);

  const content = appendCiBlock(existing, block);
  await writeFile(CI_FILE, content);
  console.log('✓ ReleaseJet CI configuration added to .gitlab-ci.yml');
}

export async function runCiDisable(): Promise<void> {
  let existing: string;
  try {
    existing = await readFile(CI_FILE, 'utf-8');
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    console.log('ReleaseJet CI is not configured.');
    return;
  }

  if (!hasCiBlock(existing)) {
    console.log('ReleaseJet CI is not configured.');
    return;
  }

  const cleaned = removeCiBlock(existing);
  if (cleaned.trim().length === 0) {
    await unlink(CI_FILE);
    console.log('✓ Removed .gitlab-ci.yml (no other configuration found)');
  } else {
    await writeFile(CI_FILE, cleaned + '\n');
    console.log('✓ ReleaseJet CI configuration removed from .gitlab-ci.yml');
  }
}
