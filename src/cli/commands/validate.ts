import type { Command } from 'commander';
import { loadConfig } from '../../core/config.js';
import {
  getRemoteUrl,
  resolveHostUrl,
  resolveProjectPath,
} from '../../core/git.js';
import { createClient } from '../../providers/factory.js';
import { resolveToken } from '../auth.js';

export function registerValidateCommand(program: Command): void {
  program
    .command('validate')
    .description('Check open issues for proper labeling')
    .option('--config <path>', 'Config file path', '.releasejet.yml')
    .action(async (options) => {
      await runValidate(options);
    });
}

export async function runValidate(options: {
  config: string;
}): Promise<void> {
  const config = await loadConfig(options.config);

  const remoteUrl = getRemoteUrl();
  const hostUrl = config.provider.url || resolveHostUrl(remoteUrl);
  const projectPath = resolveProjectPath(remoteUrl);

  const token = await resolveToken(config.provider.type);
  const client = createClient(config, token);

  const issues = await client.listIssues(projectPath, {
    state: 'opened',
  });

  const categoryLabels = Object.keys(config.categories);
  const clientLabels = config.clients.map((c) => c.label);
  const isMultiClient = clientLabels.length > 0;

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
