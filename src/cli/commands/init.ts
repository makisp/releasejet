import type { Command } from 'commander';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { input, confirm, select } from '@inquirer/prompts';
import { stringify as stringifyYaml, parse as parseYaml } from 'yaml';
import { getRemoteUrl, resolveHostUrl, detectProviderFromRemote } from '../../core/git.js';
import type { ClientConfig } from '../../types.js';
import {
  generateCiBlock,
  hasCiBlock,
  appendCiBlock,
  DEFAULT_TAGS,
} from '../../core/ci.js';

const GITHUB_ACTIONS_TEMPLATE = `name: Release Notes
on:
  push:
    tags:
      - '**'
jobs:
  release-notes:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm install -g releasejet
      - run: releasejet generate --tag "\${{ github.ref_name }}" --publish
        env:
          RELEASEJET_TOKEN: \${{ secrets.RELEASEJET_TOKEN }}
`;

export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Interactive setup for ReleaseJet')
    .action(async () => {
      await runInit();
    });
}

export async function runInit(): Promise<void> {
  console.log('🚀 ReleaseJet Setup\n');

  // 1. Detect provider from remote
  let detectedProvider: 'gitlab' | 'github' = 'gitlab';
  let defaultUrl = '';
  try {
    const remoteUrl = getRemoteUrl();
    detectedProvider = detectProviderFromRemote(remoteUrl);
    defaultUrl = resolveHostUrl(remoteUrl);
  } catch {
    // No git remote available
  }

  const providerType = await select({
    message: 'Which provider are you using?',
    choices: [
      { name: 'GitLab', value: 'gitlab' as const },
      { name: 'GitHub', value: 'github' as const },
    ],
    default: detectedProvider,
  });

  // 2. Provider URL
  const urlDefault = providerType === 'github'
    ? (defaultUrl || 'https://github.com')
    : (defaultUrl || 'https://gitlab.example.com');

  const providerUrl = await input({
    message: providerType === 'github' ? 'GitHub URL:' : 'GitLab instance URL:',
    default: urlDefault,
  });

  // 3. Source (GitHub only)
  let source: 'issues' | 'pull_requests' | undefined;
  if (providerType === 'github') {
    source = await select({
      message: 'Generate release notes from:',
      choices: [
        { name: 'Issues', value: 'issues' as const },
        { name: 'Pull requests', value: 'pull_requests' as const },
      ],
      default: 'issues',
    });
  }

  // 4. Multi-client?
  const isMultiClient = await confirm({
    message: 'Is this a multi-client repository?',
    default: false,
  });

  // 5. Client definitions
  const clients: ClientConfig[] = [];
  if (isMultiClient) {
    let addMore = true;
    while (addMore) {
      const prefix = await input({
        message: 'Client tag prefix (e.g., "mobile"):',
      });
      const label = await input({
        message: `Label for "${prefix}" (e.g., "MOBILE"):`,
        default: prefix.toUpperCase(),
      });
      clients.push({ prefix, label });
      addMore = await confirm({
        message: 'Add another client?',
        default: false,
      });
    }
  }

  // 6. Uncategorized mode
  const uncategorized = await select({
    message: 'How to handle uncategorized issues?',
    choices: [
      {
        name: 'Lenient — include under "Other" with a warning',
        value: 'lenient' as const,
      },
      {
        name: 'Strict — fail release generation',
        value: 'strict' as const,
      },
    ],
  });

  // 7. Category configuration
  const defaultCategories: Record<string, string> = {
    feature: 'New Features',
    bug: 'Bug Fixes',
    improvement: 'Improvements',
    'breaking-change': 'Breaking Changes',
  };

  const categoryMode = await select({
    message: 'Issue categories (editable later in .releasejet.yml):',
    choices: [
      {
        name: 'Use defaults (feature, bug, improvement, breaking-change)',
        value: 'defaults' as const,
      },
      {
        name: 'Keep defaults and add custom categories',
        value: 'extend' as const,
      },
      {
        name: 'Define only my own categories (ignore defaults)',
        value: 'custom' as const,
      },
    ],
  });

  let categories: Record<string, string>;
  if (categoryMode === 'defaults') {
    categories = { ...defaultCategories };
  } else {
    categories = categoryMode === 'extend' ? { ...defaultCategories } : {};
    const existing = new Set(Object.keys(categories));
    let needsAtLeastOne = categoryMode === 'custom';

    while (true) {
      const label = await input({
        message: needsAtLeastOne
          ? 'At least one category is required. Label (as it appears in GitLab):'
          : 'Label (as it appears in GitLab, or press Enter when done):',
      });

      if (!label.trim()) {
        if (categoryMode === 'custom' && Object.keys(categories).length === 0) {
          needsAtLeastOne = true;
          continue;
        }
        break;
      }

      if (existing.has(label.trim())) {
        continue;
      }

      const heading = await input({
        message: `Section heading in release notes:`,
      });

      const finalLabel = label.trim();
      const finalHeading = heading.trim() || finalLabel.charAt(0).toUpperCase() + finalLabel.slice(1);
      categories[finalLabel] = finalHeading;
      existing.add(finalLabel);
      needsAtLeastOne = false;
      console.log(`  Added: ${finalLabel} → "${finalHeading}"`);
    }
  }

  // 8. Write config
  const config: Record<string, unknown> = {
    provider: { type: providerType, url: providerUrl },
    categories,
    uncategorized,
  };

  if (source && source !== 'issues') {
    config.source = source;
  }

  if (clients.length > 0) {
    config.clients = clients;
  }

  const yamlContent = stringifyYaml(config);
  await writeFile('.releasejet.yml', yamlContent);
  console.log('\n✓ Created .releasejet.yml');

  // 9. CI setup
  const ciLabel = providerType === 'github' ? 'GitHub Actions' : 'GitLab CI/CD';
  const setupCi = await confirm({
    message: `Set up ${ciLabel} integration?`,
    default: true,
  });

  if (setupCi) {
    if (providerType === 'github') {
      await setupGitHubActions();
    } else {
      await setupGitLabCi();
    }
  }

  // 10. API token
  const tokenMessage = providerType === 'github'
    ? 'GitHub personal access token (repo scope):'
    : 'GitLab API token (api scope):';

  const token = await input({ message: tokenMessage });

  // 11. Store token
  if (token) {
    const credDir = join(homedir(), '.releasejet');
    await mkdir(credDir, { recursive: true });
    const credPath = join(credDir, 'credentials.yml');

    let existingCreds: Record<string, string> = {};
    try {
      const content = await readFile(credPath, 'utf-8');
      existingCreds = parseYaml(content) ?? {};
    } catch {
      // No existing file
    }

    existingCreds[providerType] = token;
    const yamlCreds = stringifyYaml(existingCreds);
    await writeFile(credPath, yamlCreds, { mode: 0o600 });
    console.log(`✓ Token stored in ${credPath}`);
  }

  console.log('\nSetup complete! You can now run:');
  console.log(
    '  releasejet generate --tag <tag>          # Preview release notes',
  );
  console.log(
    '  releasejet generate --tag <tag> --publish # Publish release',
  );
  console.log(
    '  releasejet validate                       # Check issue labels',
  );
}

async function setupGitLabCi(): Promise<void> {
  const tagsInput = await input({
    message: 'Runner tags (comma-separated, or Enter for "short-duration"):',
  });
  const ciTags = tagsInput.trim()
    ? tagsInput.split(',').map((t) => t.trim()).filter(Boolean)
    : DEFAULT_TAGS;

  let existingCi = '';
  try {
    existingCi = await readFile('.gitlab-ci.yml', 'utf-8');
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }

  if (hasCiBlock(existingCi)) {
    console.log('  ReleaseJet CI is already configured.');
  } else {
    const block = generateCiBlock(ciTags);
    const ciContent = appendCiBlock(existingCi, block);
    await writeFile('.gitlab-ci.yml', ciContent);
    console.log('✓ Created .gitlab-ci.yml with ReleaseJet CI configuration');
  }
}

async function setupGitHubActions(): Promise<void> {
  const workflowPath = '.github/workflows/release-notes.yml';

  let exists = false;
  try {
    await readFile(workflowPath, 'utf-8');
    exists = true;
  } catch {
    // File doesn't exist
  }

  if (exists) {
    console.log('  GitHub Actions workflow already exists.');
    return;
  }

  await mkdir('.github/workflows', { recursive: true });
  await writeFile(workflowPath, GITHUB_ACTIONS_TEMPLATE);
  console.log('✓ Created .github/workflows/release-notes.yml');
}
