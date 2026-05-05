import type { Command } from 'commander';
import { readFile, writeFile } from 'node:fs/promises';
import { select, input, confirm } from '@inquirer/prompts';
import { withErrorHandler } from '../error-handler.js';
import { hasActivePro } from '../../license/detect.js';
import {
  appendNotificationEntry,
  readNotificationsRaw,
  parseEnvVarReference,
  isLiteralWebhookUrl,
} from '../notifications-yaml.js';
import { parseDocument } from 'yaml';

const CONFIG_PATH = '.releasejet.yml';

const SOFT_WARN =
  'Note: notifications require @releasejet/pro to actually fire. Run `releasejet auth status` to check.';

const PLATFORM_HINTS: Record<'slack' | 'discord' | 'teams', string> = {
  slack: 'Slack: api.slack.com/apps -> Incoming Webhooks',
  discord: 'Discord: Server Settings -> Integrations -> Webhooks',
  teams: "Teams: Power Automate -> 'Post adaptive card in channel'",
};

async function readConfigSource(): Promise<string> {
  try {
    return await readFile(CONFIG_PATH, 'utf-8');
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error('No .releasejet.yml found. Run `releasejet init` first.');
    }
    throw err;
  }
}

function parseOrThrow(source: string): void {
  // Pre-parse just to fail fast with a clear message; the mutation helper
  // re-parses internally (cheap; keeps appendNotificationEntry pure).
  parseDocument(source).toJS();
}

export interface AddOptions {
  type?: string;
  env?: string;
  enabled?: boolean;
  disabled?: boolean;
  force?: boolean;
}

export async function runAdd(options: AddOptions): Promise<void> {
  const source = await readConfigSource();
  parseOrThrow(source);

  const type = await select({
    message: 'Channel type:',
    choices: [
      { name: 'Slack', value: 'slack' as const },
      { name: 'Discord', value: 'discord' as const },
      { name: 'Teams', value: 'teams' as const },
    ],
    default: 'slack',
  });

  console.log(`  ${PLATFORM_HINTS[type]}`);
  let envVarName: string | null = null;
  while (envVarName === null) {
    const raw = (await input({
      message: 'Env var name (e.g. SLACK_WEBHOOK_URL or ${SLACK_WEBHOOK_URL}):',
    })).trim();

    if (isLiteralWebhookUrl(raw)) {
      console.error(
        '  ⚠ Webhook URLs are secrets — store in an env var and reference it as ${YOUR_VAR_NAME}.',
      );
      continue;
    }
    const parsed = parseEnvVarReference(raw);
    if (parsed === null) {
      console.error('  ⚠ Env var name must match [A-Za-z_][A-Za-z0-9_]*');
      continue;
    }
    envVarName = parsed;
  }

  const existing = readNotificationsRaw(source);
  const newRef = `\${${envVarName}}`;
  const dup = existing.some((e) => e.webhookUrl === newRef);
  if (dup) {
    const proceed = await confirm({
      message: `Env var ${newRef} is already used by another channel. Add anyway?`,
      default: false,
    });
    if (!proceed) {
      console.log('Aborted. No changes were made.');
      return;
    }
  }

  const enabled = await confirm({ message: 'Enabled?', default: true });

  const updated = appendNotificationEntry(source, { type, enabled, envVarName });
  await writeFile(CONFIG_PATH, updated, 'utf-8');

  const newCount = readNotificationsRaw(updated).length;
  console.log(`✓ Added ${type} channel to .releasejet.yml (entry #${newCount})`);

  if (!(await hasActivePro())) {
    console.log(SOFT_WARN);
  }
}

export function registerNotificationsCommand(program: Command): void {
  const cmd = program
    .command('notifications')
    .description('Manage notification channels in .releasejet.yml');

  cmd
    .command('add')
    .description('Add a notification channel (interactive; --type + --env for non-interactive)')
    .option('--type <type>', 'slack | discord | teams (flag-mode)')
    .option('--env <name>', 'Env var name or ${NAME} reference (flag-mode)')
    .option('--enabled', 'Set enabled: true (flag-mode default)')
    .option('--disabled', 'Set enabled: false (flag-mode)')
    .option('--force', 'Skip duplicate-env confirm in flag-mode')
    .action(withErrorHandler(async (opts: AddOptions) => {
      await runAdd(opts);
    }));
}
