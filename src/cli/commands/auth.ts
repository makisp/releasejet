import type { Command } from 'commander';
import { readLicense, writeLicense, removeLicense } from '../../license/store.js';
import { verifyLicense } from '../../license/validator.js';
import { withErrorHandler } from '../error-handler.js';

const LICENSE_API_URL =
  process.env.RELEASEJET_LICENSE_API || 'https://releasejet.dev/api/license';

const KEY_PATTERN = /^rlj_[a-zA-Z0-9]{32}$/;

export async function runActivate(key: string): Promise<void> {
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

export async function runDeactivate(): Promise<void> {
  await removeLicense();
  console.log('Pro license removed.');
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
