import { Gitlab } from '@gitbeaker/rest';
import { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';

// --- Types ---

export interface SeedClient {
  createMilestone(project: string, title: string): Promise<number>;
  createIssue(
    project: string,
    options: { title: string; labels: string[]; milestoneId?: number },
  ): Promise<number>;
  closeIssue(project: string, iid: number): Promise<void>;
  createTag(project: string, tagName: string, ref?: string): Promise<void>;
  deleteTag(project: string, tagName: string): Promise<void>;
  log(message: string): void;
}

export interface RunContext {
  client: SeedClient;
  project: string;
  wait: (ms: number) => Promise<void>;
}

export type ScenarioFn = (ctx: RunContext) => Promise<void>;

// --- Seed Client ---

export function createSeedClient(url: string, token: string): SeedClient {
  const api = new Gitlab({ host: url, token });

  return {
    async createMilestone(project, title) {
      const existing = await api.ProjectMilestones.all(project, { search: title });
      const match = (existing as any[]).find((m) => m.title === title);
      if (match) {
        console.log(`[seed] Reusing existing milestone "${title}" (id: ${match.id})`);
        return match.id;
      }
      const ms = await api.ProjectMilestones.create(project, title as any);
      return (ms as any).id;
    },

    async createIssue(project, { title, labels, milestoneId }) {
      const opts: Record<string, unknown> = { labels: labels.join(',') };
      if (milestoneId !== undefined) opts.milestoneId = milestoneId;
      const issue = await api.Issues.create(project, title as any, opts as any);
      return (issue as any).iid;
    },

    async closeIssue(project, iid) {
      await api.Issues.edit(project, iid, { stateEvent: 'close' } as any);
    },

    async createTag(project, tagName, ref) {
      // Create a marker commit so this tag gets a unique commit.created_at
      // (some GitLab instances return null for tag.created_at)
      try {
        await api.Commits.create(project as any, 'main', `seed: marker for ${tagName}`, [
          { action: 'update', filePath: '.seed-marker', content: `${tagName}\n${new Date().toISOString()}` },
        ] as any);
      } catch {
        try {
          await api.Commits.create(project as any, 'main', `seed: marker for ${tagName}`, [
            { action: 'create', filePath: '.seed-marker', content: `${tagName}\n${new Date().toISOString()}` },
          ] as any);
        } catch {
          // If commits fail, fall back to tagging HEAD as-is
        }
      }

      try {
        await api.Tags.create(project, tagName as any, 'main' as any);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('already exists')) {
          console.log(`[seed] Warning: tag "${tagName}" already exists, skipping`);
          return;
        }
        throw err;
      }
    },

    async deleteTag(project, tagName) {
      await api.Tags.remove(project, tagName);
    },

    log(message) {
      console.log(`[seed] ${message}`);
    },
  };
}

// --- Scenario Registry ---

export const scenarios: Record<string, ScenarioFn> = {};

// --- Scenarios ---

scenarios['happy-path'] = async ({ client, project, wait }) => {
  client.log('=== Scenario: happy-path ===');

  const msId = await client.createMilestone(project, 'Release 10.1');
  client.log(`Created milestone "Release 10.1" (id: ${msId})`);

  await client.createTag(project, 'client1-v10.0.0');
  client.log('Created tag client1-v10.0.0');
  await wait(2000);

  const issues = [
    { title: 'Add dark mode', labels: ['CLIENT1', 'feature'], milestoneId: msId },
    { title: 'Fix login crash', labels: ['CLIENT1', 'bug'], milestoneId: msId },
    { title: 'Investigate memory leak', labels: ['CLIENT1', 'investigation'], milestoneId: msId },
    { title: 'Migrate to new API', labels: ['CLIENT1', 'change-request'], milestoneId: msId },
  ];

  const iids: number[] = [];
  for (const issue of issues) {
    const iid = await client.createIssue(project, issue);
    client.log(`Created issue #${iid} "${issue.title}" [${issue.labels.join(', ')}]`);
    iids.push(iid);
  }

  for (const iid of iids) {
    await client.closeIssue(project, iid);
  }
  client.log(`Closed issues ${iids.map((i) => '#' + i).join(', ')}`);

  await wait(2000);
  await client.createTag(project, 'client1-v10.1.0');
  client.log('Created tag client1-v10.1.0');

  client.log('=== Done ===');
  client.log('Run: releasejet generate --tag client1-v10.1.0 --debug');
};

scenarios['second-client'] = async ({ client, project, wait }) => {
  client.log('=== Scenario: second-client ===');

  await client.createTag(project, 'client2-v10.0.0');
  client.log('Created tag client2-v10.0.0');
  await wait(2000);

  const issues = [
    { title: 'Add push notifications', labels: ['CLIENT2', 'feature'] },
    { title: 'Fix crash on logout', labels: ['CLIENT2', 'bug'] },
    { title: 'Update payment flow', labels: ['CLIENT2', 'change-request'] },
  ];

  const iids: number[] = [];
  for (const issue of issues) {
    const iid = await client.createIssue(project, issue);
    client.log(`Created issue #${iid} "${issue.title}" [${issue.labels.join(', ')}]`);
    iids.push(iid);
  }

  for (const iid of iids) {
    await client.closeIssue(project, iid);
  }
  client.log(`Closed issues ${iids.map((i) => '#' + i).join(', ')}`);

  await wait(2000);
  await client.createTag(project, 'client2-v10.1.0');
  client.log('Created tag client2-v10.1.0');

  client.log('=== Done ===');
  client.log('Run: releasejet generate --tag client2-v10.1.0 --debug');
};

scenarios['uncategorized-lenient'] = async ({ client, project, wait }) => {
  client.log('=== Scenario: uncategorized-lenient ===');

  await client.createTag(project, 'client1-v11.0.0');
  client.log('Created tag client1-v11.0.0');
  await wait(2000);

  const issues = [
    { title: 'Add search bar', labels: ['CLIENT1', 'feature'] },
    { title: 'Fix memory leak', labels: ['CLIENT1', 'bug'] },
    { title: 'Update README', labels: ['CLIENT1'] },
  ];

  const iids: number[] = [];
  for (const issue of issues) {
    const iid = await client.createIssue(project, issue);
    client.log(`Created issue #${iid} "${issue.title}" [${issue.labels.join(', ')}]`);
    iids.push(iid);
  }

  for (const iid of iids) {
    await client.closeIssue(project, iid);
  }
  client.log(`Closed issues ${iids.map((i) => '#' + i).join(', ')}`);

  await wait(2000);
  await client.createTag(project, 'client1-v11.1.0');
  client.log('Created tag client1-v11.1.0');

  client.log('=== Done ===');
  client.log('Run: releasejet generate --tag client1-v11.1.0 --debug');
};

scenarios['uncategorized-strict'] = async ({ client }) => {
  client.log('=== Scenario: uncategorized-strict ===');
  client.log('This scenario uses the same data as uncategorized-lenient.');
  client.log('Set uncategorized: strict in .releasejet.yml, then run:');
  client.log('Run: releasejet generate --tag client1-v11.1.0 --debug');
  client.log('Expected: non-zero exit code listing the uncategorized issue.');
  client.log('=== Done ===');
};

scenarios['no-milestone'] = async ({ client, project, wait }) => {
  client.log('=== Scenario: no-milestone ===');

  await client.createTag(project, 'client1-v12.0.0');
  client.log('Created tag client1-v12.0.0');
  await wait(2000);

  const issues = [
    { title: 'Add caching layer', labels: ['CLIENT1', 'feature'] },
    { title: 'Fix timeout error', labels: ['CLIENT1', 'bug'] },
  ];

  const iids: number[] = [];
  for (const issue of issues) {
    const iid = await client.createIssue(project, issue);
    client.log(`Created issue #${iid} "${issue.title}" [${issue.labels.join(', ')}]`);
    iids.push(iid);
  }

  for (const iid of iids) {
    await client.closeIssue(project, iid);
  }
  client.log(`Closed issues ${iids.map((i) => '#' + i).join(', ')}`);

  await wait(2000);
  await client.createTag(project, 'client1-v12.1.0');
  client.log('Created tag client1-v12.1.0');

  client.log('=== Done ===');
  client.log('Run: releasejet generate --tag client1-v12.1.0 --debug');
};

scenarios['mixed-milestones'] = async ({ client, project, wait }) => {
  client.log('=== Scenario: mixed-milestones ===');

  const ms10Id = await client.createMilestone(project, 'Sprint 10');
  client.log(`Created milestone "Sprint 10" (id: ${ms10Id})`);
  const ms9Id = await client.createMilestone(project, 'Sprint 9');
  client.log(`Created milestone "Sprint 9" (id: ${ms9Id})`);

  await client.createTag(project, 'client1-v12.2.0');
  client.log('Created tag client1-v12.2.0');
  await wait(2000);

  const issues = [
    { title: 'Refactor auth module', labels: ['CLIENT1', 'feature'], milestoneId: ms10Id },
    { title: 'Add rate limiting', labels: ['CLIENT1', 'feature'], milestoneId: ms10Id },
    { title: 'Update error messages', labels: ['CLIENT1', 'improvement'], milestoneId: ms10Id },
    { title: 'Fix legacy endpoint', labels: ['CLIENT1', 'bug'], milestoneId: ms9Id },
  ];

  const iids: number[] = [];
  for (const issue of issues) {
    const iid = await client.createIssue(project, issue);
    client.log(`Created issue #${iid} "${issue.title}" [${issue.labels.join(', ')}]`);
    iids.push(iid);
  }

  for (const iid of iids) {
    await client.closeIssue(project, iid);
  }
  client.log(`Closed issues ${iids.map((i) => '#' + i).join(', ')}`);

  await wait(2000);
  await client.createTag(project, 'client1-v12.3.0');
  client.log('Created tag client1-v12.3.0');

  client.log('=== Done ===');
  client.log('Run: releasejet generate --tag client1-v12.3.0 --debug');
};

scenarios['first-tag'] = async ({ client, project, wait }) => {
  client.log('=== Scenario: first-tag ===');

  const issues = [
    { title: 'Initial feature set', labels: ['CLIENT3', 'feature'] },
    { title: 'Fix onboarding flow', labels: ['CLIENT3', 'bug'] },
  ];

  const iids: number[] = [];
  for (const issue of issues) {
    const iid = await client.createIssue(project, issue);
    client.log(`Created issue #${iid} "${issue.title}" [${issue.labels.join(', ')}]`);
    iids.push(iid);
  }

  for (const iid of iids) {
    await client.closeIssue(project, iid);
  }
  client.log(`Closed issues ${iids.map((i) => '#' + i).join(', ')}`);

  await wait(2000);
  await client.createTag(project, 'client3-v20.0.0');
  client.log('Created tag client3-v20.0.0');

  client.log('=== Done ===');
  client.log('Run: releasejet generate --tag client3-v20.0.0 --debug');
};

scenarios['empty-release'] = async ({ client, project, wait }) => {
  client.log('=== Scenario: empty-release ===');

  await client.createTag(project, 'client1-v14.0.0');
  client.log('Created tag client1-v14.0.0');
  await wait(2000);

  await client.createTag(project, 'client1-v14.1.0');
  client.log('Created tag client1-v14.1.0');

  client.log('=== Done ===');
  client.log('Run: releasejet generate --tag client1-v14.1.0 --debug');
};

scenarios['suffix-tag'] = async ({ client, project, wait }) => {
  client.log('=== Scenario: suffix-tag ===');

  await client.createTag(project, 'client1-v13.0.0');
  client.log('Created tag client1-v13.0.0');
  await wait(2000);

  const iid1 = await client.createIssue(project, {
    title: 'Fix critical payment bug',
    labels: ['CLIENT1', 'bug'],
  });
  client.log(`Created issue #${iid1} "Fix critical payment bug" [CLIENT1, bug]`);
  await client.closeIssue(project, iid1);
  client.log(`Closed issue #${iid1}`);
  await wait(2000);

  await client.createTag(project, 'client1-v13.0.0-hotfix1');
  client.log('Created tag client1-v13.0.0-hotfix1');
  await wait(2000);

  const postHotfixIssues = [
    { title: 'Add retry logic', labels: ['CLIENT1', 'feature'] },
    { title: 'Fix session timeout', labels: ['CLIENT1', 'bug'] },
  ];

  const iids: number[] = [];
  for (const issue of postHotfixIssues) {
    const iid = await client.createIssue(project, issue);
    client.log(`Created issue #${iid} "${issue.title}" [${issue.labels.join(', ')}]`);
    iids.push(iid);
  }

  for (const iid of iids) {
    await client.closeIssue(project, iid);
  }
  client.log(`Closed issues ${iids.map((i) => '#' + i).join(', ')}`);
  await wait(2000);

  await client.createTag(project, 'client1-v13.1.0');
  client.log('Created tag client1-v13.1.0');

  client.log('=== Done ===');
  client.log('Run: releasejet generate --tag client1-v13.1.0 --debug');
};

scenarios['issue-outside-window'] = async ({ client, project, wait }) => {
  client.log('=== Scenario: issue-outside-window ===');

  // Issue A: closed BEFORE previous tag (should be excluded)
  const iidA = await client.createIssue(project, {
    title: 'Old completed task',
    labels: ['CLIENT1', 'feature'],
  });
  client.log(`Created issue #${iidA} "Old completed task" [CLIENT1, feature]`);
  await client.closeIssue(project, iidA);
  client.log(`Closed issue #${iidA} (before previous tag)`);
  await wait(2000);

  await client.createTag(project, 'client1-v15.0.0');
  client.log('Created tag client1-v15.0.0');
  await wait(2000);

  // Issue B: closed BETWEEN tags (should be included)
  const iidB = await client.createIssue(project, {
    title: 'New feature in window',
    labels: ['CLIENT1', 'feature'],
  });
  client.log(`Created issue #${iidB} "New feature in window" [CLIENT1, feature]`);
  await client.closeIssue(project, iidB);
  client.log(`Closed issue #${iidB} (between tags)`);
  await wait(2000);

  await client.createTag(project, 'client1-v15.1.0');
  client.log('Created tag client1-v15.1.0');
  await wait(2000);

  // Issue C: closed AFTER current tag (should be excluded)
  const iidC = await client.createIssue(project, {
    title: 'Future work item',
    labels: ['CLIENT1', 'feature'],
  });
  client.log(`Created issue #${iidC} "Future work item" [CLIENT1, feature]`);
  await client.closeIssue(project, iidC);
  client.log(`Closed issue #${iidC} (after current tag)`);

  client.log('=== Done ===');
  client.log('Run: releasejet generate --tag client1-v15.1.0 --debug');
};

// --- Helpers ---

export function listScenarios(): string[] {
  return Object.keys(scenarios).sort();
}

export async function resolveGitLabUrl(urlFlag?: string): Promise<string> {
  if (urlFlag) return urlFlag;
  try {
    const content = await readFile('.releasejet.yml', 'utf-8');
    const config = parseYaml(content);
    const url = config?.gitlab?.url;
    if (url) return url;
  } catch {
    // fall through
  }
  throw new Error('GitLab URL not found. Provide --url or ensure .releasejet.yml has gitlab.url');
}

function realWait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- CLI ---

async function main(): Promise<void> {
  const program = new Command();
  program
    .name('seed-test-data')
    .description('Seed GitLab project with test data for ReleaseJet E2E testing')
    .option('--project <path>', 'GitLab project path (e.g., mobile/app)')
    .option('--scenario <name>', 'Scenario to run (or "all")')
    .option('--url <url>', 'GitLab URL (overrides .releasejet.yml)')
    .option('--list', 'List available scenarios');

  program.parse();
  const opts = program.opts();

  if (opts.list) {
    console.log('Available scenarios:');
    for (const name of listScenarios()) {
      console.log(`  ${name}`);
    }
    return;
  }

  if (!opts.scenario) {
    console.error('Error: --scenario <name> is required (or use --list)');
    process.exit(1);
  }

  if (!opts.project) {
    console.error('Error: --project <path> is required');
    process.exit(1);
  }

  const token = process.env.GITLAB_API_TOKEN;
  if (!token) {
    console.error('Error: GITLAB_API_TOKEN environment variable is not set');
    process.exit(1);
  }

  const url = await resolveGitLabUrl(opts.url);
  const client = createSeedClient(url, token);
  const ctx: RunContext = { client, project: opts.project, wait: realWait };

  if (opts.scenario === 'all') {
    for (const scenarioFn of Object.values(scenarios)) {
      await scenarioFn(ctx);
      console.log();
    }
    return;
  }

  const scenarioFn = scenarios[opts.scenario];
  if (!scenarioFn) {
    console.error(
      `Error: unknown scenario "${opts.scenario}". Use --list to see available scenarios.`,
    );
    process.exit(1);
  }

  await scenarioFn(ctx);
}

// Run CLI when executed directly
const isDirectRun = process.argv[1]?.replace(/\\/g, '/').includes('seed-test-data-gitlab');
if (isDirectRun) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
