import type { Command } from 'commander';
import { readFile, writeFile } from 'node:fs/promises';
import { readLicense, writeLicense, removeLicense } from '../../license/store.js';
import { verifyLicense } from '../../license/validator.js';
import { isNpmrcConfigured, writeNpmrcConfig, removeNpmrcConfig } from '../../license/npmrc.js';
import {
  generateGitHubActionsTemplate,
  generateCiBlock,
  hasCiBlock,
  hasProLines,
  removeCiBlock,
  appendCiBlock,
  DEFAULT_TAGS,
  GITHUB_ACTIONS_PATH,
  GITLAB_CI_PATH,
} from '../../core/ci.js';
import { withErrorHandler } from '../error-handler.js';

const LICENSE_API_URL =
  process.env.RELEASEJET_LICENSE_API || 'https://releasejet.dev/api/license';

const KEY_PATTERN = /^rlj_[a-zA-Z0-9]{32}$/;

interface ActivateOptions {
  confirmNpmrc?: () => Promise<boolean>;
  confirmCiUpgrade?: (filePath: string) => Promise<boolean>;
}

interface DeactivateOptions {
  confirmCiDowngrade?: (filePath: string) => Promise<boolean>;
}

async function defaultConfirmNpmrc(): Promise<boolean> {
  const { createInterface } = await import('node:readline');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve, reject) => {
    rl.question(
      '\nConfigure npm to install Pro packages automatically? (Y/n) ',
      (answer) => {
        rl.close();
        resolve(answer.trim().toLowerCase() !== 'n');
      },
    );
    rl.once('error', (err) => {
      rl.close();
      reject(err);
    });
  });
}

async function defaultConfirmCi(filePath: string): Promise<boolean> {
  const { createInterface } = await import('node:readline');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve, reject) => {
    rl.question(
      `\nExisting CI workflow found (${filePath}).\nUpgrade to include Pro support? (Y/n) `,
      (answer) => {
        rl.close();
        resolve(answer.trim().toLowerCase() !== 'n');
      },
    );
    rl.once('error', (err) => {
      rl.close();
      reject(err);
    });
  });
}

async function defaultConfirmCiDowngrade(filePath: string): Promise<boolean> {
  const { createInterface } = await import('node:readline');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve, reject) => {
    rl.question(
      `\nPro CI workflow found (${filePath}).\nDowngrade to free version? (Y/n) `,
      (answer) => {
        rl.close();
        resolve(answer.trim().toLowerCase() !== 'n');
      },
    );
    rl.once('error', (err) => {
      rl.close();
      reject(err);
    });
  });
}

async function readFileSafe(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf-8');
  } catch {
    return null;
  }
}

function printSecretInstructions(): void {
  console.log('');
  console.log('Add RELEASEJET_PRO_TOKEN to your repo secrets:');
  console.log('  GitHub: Settings → Secrets → Actions → New secret');
  console.log('  GitLab: Settings → CI/CD → Variables');
  console.log('  Value: your rlj_ license key');
}

function printCiInstructions(): void {
  console.log('');
  console.log('To use Pro in CI:');
  console.log('');
  console.log('  1. Add secret RELEASEJET_PRO_TOKEN (value: your rlj_ license key) to your repo');
  console.log('  2. Run `releasejet ci enable --pro` to generate the CI template');
  console.log('');
  console.log('  Pro activates automatically when RELEASEJET_PRO_TOKEN is in the environment.');
}

async function handleCiUpgrade(options: ActivateOptions): Promise<void> {
  const confirm = options.confirmCiUpgrade ?? defaultConfirmCi;

  // Check GitHub Actions
  const ghContent = await readFileSafe(GITHUB_ACTIONS_PATH);
  if (ghContent !== null) {
    if (hasProLines(ghContent)) return; // Already Pro
    const shouldUpgrade = await confirm(GITHUB_ACTIONS_PATH);
    if (shouldUpgrade) {
      const proTemplate = generateGitHubActionsTemplate({ pro: true });
      await writeFile(GITHUB_ACTIONS_PATH, proTemplate);
      console.log('✓ CI workflow updated with Pro registry setup.');
      printSecretInstructions();
      return;
    }
    printCiInstructions();
    return;
  }

  // Check GitLab CI
  const glContent = await readFileSafe(GITLAB_CI_PATH);
  if (glContent !== null && hasCiBlock(glContent)) {
    if (hasProLines(glContent)) return; // Already Pro
    const shouldUpgrade = await confirm(GITLAB_CI_PATH);
    if (shouldUpgrade) {
      const cleaned = removeCiBlock(glContent);
      const proBlock = generateCiBlock(DEFAULT_TAGS, { pro: true });
      const updated = appendCiBlock(cleaned, proBlock);
      await writeFile(GITLAB_CI_PATH, updated);
      console.log('✓ CI workflow updated with Pro registry setup.');
      printSecretInstructions();
      return;
    }
    printCiInstructions();
    return;
  }

  // No managed CI found
  printCiInstructions();
}

async function handleCiDowngrade(options: DeactivateOptions): Promise<void> {
  const confirm = options.confirmCiDowngrade ?? defaultConfirmCiDowngrade;

  // Check GitHub Actions
  const ghContent = await readFileSafe(GITHUB_ACTIONS_PATH);
  if (ghContent !== null && hasProLines(ghContent)) {
    const shouldDowngrade = await confirm(GITHUB_ACTIONS_PATH);
    if (shouldDowngrade) {
      const freeTemplate = generateGitHubActionsTemplate({ pro: false });
      await writeFile(GITHUB_ACTIONS_PATH, freeTemplate);
      console.log('CI workflow downgraded to free version.');
    }
    return;
  }

  // Check GitLab CI
  const glContent = await readFileSafe(GITLAB_CI_PATH);
  if (glContent !== null && hasCiBlock(glContent) && hasProLines(glContent)) {
    const shouldDowngrade = await confirm(GITLAB_CI_PATH);
    if (shouldDowngrade) {
      const cleaned = removeCiBlock(glContent);
      const freeBlock = generateCiBlock(DEFAULT_TAGS, { pro: false });
      const updated = appendCiBlock(cleaned, freeBlock);
      await writeFile(GITLAB_CI_PATH, updated);
      console.log('CI workflow downgraded to free version.');
    }
    return;
  }
}

export async function runActivate(key: string, options?: ActivateOptions): Promise<void> {
  if (!KEY_PATTERN.test(key)) {
    throw new Error(
      'Invalid key format. Keys start with rlj_ followed by 32 characters.',
    );
  }

  let response: Response;
  try {
    response = await fetch(`${LICENSE_API_URL}/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    });
  } catch {
    throw new Error(
      'Could not reach license server. Check your connection and try again.',
    );
  }

  if (!response.ok) {
    throw new Error('Invalid license key. Check your key at releasejet.dev.');
  }

  const { token, expiresAt } = (await response.json()) as {
    token: string;
    expiresAt: string;
  };

  await writeLicense({ key, token, expiresAt });
  console.log(`Pro license activated. Expires: ${expiresAt}.`);

  // Prompt for npmrc configuration
  const confirmNpmrc = options?.confirmNpmrc ?? defaultConfirmNpmrc;
  const shouldConfigure = await confirmNpmrc();

  if (shouldConfigure) {
    await writeNpmrcConfig(key);
    console.log('npm configured. You can now run: npm install @releasejet/pro');
  } else {
    console.log('');
    console.log('To install Pro packages, add these lines to ~/.npmrc:');
    console.log('');
    console.log(`  @releasejet:registry=https://npm.releasejet.dev/`);
    console.log(`  //npm.releasejet.dev/:_authToken=${key}`);
    console.log('');
    console.log('Then run: npm install @releasejet/pro');
  }

  // CI workflow upgrade
  await handleCiUpgrade(options ?? {});
}

export async function runStatus(): Promise<void> {
  const license = await readLicense();
  if (!license) {
    console.log('No Pro license found. Visit releasejet.dev to get started.');
    return;
  }

  const status = await verifyLicense(license.token);
  if (!status.valid) {
    if (status.reason === 'expired') {
      console.log(
        `License expired on ${license.expiresAt}. Run \`releasejet auth refresh\` to renew.`,
      );
    } else {
      console.log(
        'License key is invalid. Run `releasejet auth activate <key>` with a valid key.',
      );
    }
    return;
  }

  console.log(`Plan:     ${status.payload.plan}`);
  console.log(`Email:    ${status.payload.email}`);
  console.log(`Features: ${status.payload.features.join(', ')}`);
  console.log(`Expires:  ${license.expiresAt}`);

  const npmConfigured = await isNpmrcConfigured();
  console.log(
    `npm registry: ${npmConfigured ? 'configured (in ~/.npmrc)' : 'not configured (run \'releasejet auth activate\' to set up)'}`,
  );
}

export async function runRefresh(): Promise<void> {
  const license = await readLicense();
  if (!license) {
    throw new Error(
      'No license found. Run `releasejet auth activate <key>` first.',
    );
  }

  let response: Response;
  try {
    response = await fetch(`${LICENSE_API_URL}/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: license.key }),
    });
  } catch {
    throw new Error(
      'Could not reach license server. Check your connection and try again.',
    );
  }

  if (!response.ok) {
    throw new Error(
      'License is no longer active. Visit releasejet.dev for details.',
    );
  }

  const { token, expiresAt } = (await response.json()) as {
    token: string;
    expiresAt: string;
  };

  await writeLicense({ key: license.key, token, expiresAt });
  console.log(`License refreshed. Expires: ${expiresAt}.`);
}

export async function runDeactivate(options?: DeactivateOptions): Promise<void> {
  const hadNpmrc = await isNpmrcConfigured();
  await removeLicense();
  await removeNpmrcConfig();
  console.log('Pro license removed.');
  if (hadNpmrc) {
    console.log('npm registry config removed from ~/.npmrc.');
  }

  // CI workflow downgrade
  await handleCiDowngrade(options ?? {});
}

export function registerAuthCommand(program: Command): void {
  const auth = program
    .command('auth')
    .description('Manage Pro license');

  auth
    .command('activate <key>')
    .description('Activate a Pro license key')
    .action(withErrorHandler(async (key: string) => {
      await runActivate(key);
    }));

  auth
    .command('status')
    .description('Show current license status')
    .action(withErrorHandler(async () => {
      await runStatus();
    }));

  auth
    .command('refresh')
    .description('Refresh the license token')
    .action(withErrorHandler(async () => {
      await runRefresh();
    }));

  auth
    .command('deactivate')
    .description('Remove the license key')
    .action(withErrorHandler(async () => {
      await runDeactivate();
    }));
}
