import { Octokit } from '@octokit/rest';
import { Command } from 'commander';

// --- Types ---

export interface GitHubSeedClient {
  createMilestone(project: string, title: string): Promise<number>;
  createIssue(
    project: string,
    options: { title: string; labels: string[]; milestoneId?: number },
  ): Promise<number>;
  closeIssue(project: string, number: number): Promise<void>;
  createTag(project: string, tagName: string, ref?: string): Promise<void>;
  deleteTag(project: string, tagName: string): Promise<void>;
  log(message: string): void;
  createBranch(project: string, branchName: string, fromRef?: string): Promise<void>;
  createPullRequest(
    project: string,
    options: { title: string; labels: string[]; milestoneId?: number; head: string; base: string },
  ): Promise<number>;
  mergePullRequest(project: string, prNumber: number): Promise<void>;
}

export interface RunContext {
  client: GitHubSeedClient;
  project: string;
  wait: (ms: number) => Promise<void>;
}

export type ScenarioFn = (ctx: RunContext) => Promise<void>;

// --- Helper ---

function parseOwnerRepo(project: string): { owner: string; repo: string } {
  const [owner, repo] = project.split('/');
  return { owner, repo };
}

// --- Seed Client ---

export function createGitHubSeedClient(url: string, token: string): GitHubSeedClient {
  const baseUrl = url && url !== 'https://github.com'
    ? `${url.replace(/\/$/, '')}/api/v3`
    : undefined;

  const octokit = new Octokit({ auth: token, baseUrl });

  return {
    async createMilestone(project, title) {
      const { owner, repo } = parseOwnerRepo(project);
      const { data: existing } = await octokit.issues.listMilestones({ owner, repo, state: 'all', per_page: 100 });
      const match = existing.find((m) => m.title === title);
      if (match) {
        console.log(`[seed] Reusing existing milestone "${title}" (number: ${match.number})`);
        return match.number;
      }
      const { data: ms } = await octokit.issues.createMilestone({ owner, repo, title });
      return ms.number;
    },

    async createIssue(project, { title, labels, milestoneId }) {
      const { owner, repo } = parseOwnerRepo(project);
      const params: Record<string, unknown> = { owner, repo, title, labels };
      if (milestoneId !== undefined) params.milestone = milestoneId;
      const { data: issue } = await octokit.issues.create(params as any);
      return issue.number;
    },

    async closeIssue(project, number) {
      const { owner, repo } = parseOwnerRepo(project);
      await octokit.issues.update({ owner, repo, issue_number: number, state: 'closed' });
    },

    async createTag(project, tagName) {
      const { owner, repo } = parseOwnerRepo(project);

      // Create a marker commit so this tag gets a unique timestamp
      let commitSha: string;
      try {
        const { data: ref } = await octokit.git.getRef({ owner, repo, ref: 'heads/main' });
        const currentSha = ref.object.sha;

        // Try to update .seed-marker; create if it doesn't exist
        try {
          const { data: file } = await octokit.repos.getContent({ owner, repo, path: '.seed-marker', ref: 'main' });
          const { data: updated } = await octokit.repos.createOrUpdateFileContents({
            owner, repo,
            path: '.seed-marker',
            message: `seed: marker for ${tagName}`,
            content: Buffer.from(`${tagName}\n${new Date().toISOString()}`).toString('base64'),
            sha: (file as any).sha,
            branch: 'main',
          });
          commitSha = updated.commit.sha!;
        } catch {
          const { data: created } = await octokit.repos.createOrUpdateFileContents({
            owner, repo,
            path: '.seed-marker',
            message: `seed: marker for ${tagName}`,
            content: Buffer.from(`${tagName}\n${new Date().toISOString()}`).toString('base64'),
            branch: 'main',
          });
          commitSha = created.commit.sha!;
        }
      } catch {
        // Fallback: tag HEAD as-is
        const { data: ref } = await octokit.git.getRef({ owner, repo, ref: 'heads/main' });
        commitSha = ref.object.sha;
      }

      // Create lightweight tag
      try {
        await octokit.git.createRef({ owner, repo, ref: `refs/tags/${tagName}`, sha: commitSha });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('Reference already exists')) {
          console.log(`[seed] Warning: tag "${tagName}" already exists, skipping`);
          return;
        }
        throw err;
      }
    },

    async deleteTag(project, tagName) {
      const { owner, repo } = parseOwnerRepo(project);
      await octokit.git.deleteRef({ owner, repo, ref: `tags/${tagName}` });
    },

    async createBranch(project, branchName) {
      const { owner, repo } = parseOwnerRepo(project);
      try {
        const { data: ref } = await octokit.git.getRef({ owner, repo, ref: 'heads/main' });
        await octokit.git.createRef({ owner, repo, ref: `refs/heads/${branchName}`, sha: ref.object.sha });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('Reference already exists')) {
          console.log(`[seed] Warning: branch "${branchName}" already exists, skipping`);
          return;
        }
        throw err;
      }
    },

    async createPullRequest(project, { title, labels, milestoneId, head, base }) {
      const { owner, repo } = parseOwnerRepo(project);

      // Commit a file change to the branch so PR is mergeable
      try {
        const { data: file } = await octokit.repos.getContent({ owner, repo, path: '.seed-pr-marker', ref: head });
        await octokit.repos.createOrUpdateFileContents({
          owner, repo,
          path: '.seed-pr-marker',
          message: `seed: PR marker for ${title}`,
          content: Buffer.from(`${title}\n${new Date().toISOString()}`).toString('base64'),
          sha: (file as any).sha,
          branch: head,
        });
      } catch {
        await octokit.repos.createOrUpdateFileContents({
          owner, repo,
          path: '.seed-pr-marker',
          message: `seed: PR marker for ${title}`,
          content: Buffer.from(`${title}\n${new Date().toISOString()}`).toString('base64'),
          branch: head,
        });
      }

      const { data: pr } = await octokit.pulls.create({ owner, repo, title, head, base });

      if (labels.length > 0) {
        await octokit.issues.addLabels({ owner, repo, issue_number: pr.number, labels });
      }
      if (milestoneId !== undefined) {
        await octokit.issues.update({ owner, repo, issue_number: pr.number, milestone: milestoneId });
      }

      return pr.number;
    },

    async mergePullRequest(project, prNumber) {
      const { owner, repo } = parseOwnerRepo(project);
      await octokit.pulls.merge({ owner, repo, pull_number: prNumber });
    },

    log(message) {
      console.log(`[seed] ${message}`);
    },
  };
}

// --- Scenario Registry ---

export const scenarios: Record<string, ScenarioFn> = {};

// --- Issue-Source Scenarios ---

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

  const numbers: number[] = [];
  for (const issue of issues) {
    const num = await client.createIssue(project, issue);
    client.log(`Created issue #${num} "${issue.title}" [${issue.labels.join(', ')}]`);
    numbers.push(num);
  }

  for (const num of numbers) {
    await client.closeIssue(project, num);
  }
  client.log(`Closed issues ${numbers.map((n) => '#' + n).join(', ')}`);

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

  const numbers: number[] = [];
  for (const issue of issues) {
    const num = await client.createIssue(project, issue);
    client.log(`Created issue #${num} "${issue.title}" [${issue.labels.join(', ')}]`);
    numbers.push(num);
  }

  for (const num of numbers) {
    await client.closeIssue(project, num);
  }
  client.log(`Closed issues ${numbers.map((n) => '#' + n).join(', ')}`);

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

  const numbers: number[] = [];
  for (const issue of issues) {
    const num = await client.createIssue(project, issue);
    client.log(`Created issue #${num} "${issue.title}" [${issue.labels.join(', ')}]`);
    numbers.push(num);
  }

  for (const num of numbers) {
    await client.closeIssue(project, num);
  }
  client.log(`Closed issues ${numbers.map((n) => '#' + n).join(', ')}`);

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

  const numbers: number[] = [];
  for (const issue of issues) {
    const num = await client.createIssue(project, issue);
    client.log(`Created issue #${num} "${issue.title}" [${issue.labels.join(', ')}]`);
    numbers.push(num);
  }

  for (const num of numbers) {
    await client.closeIssue(project, num);
  }
  client.log(`Closed issues ${numbers.map((n) => '#' + n).join(', ')}`);

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

  const numbers: number[] = [];
  for (const issue of issues) {
    const num = await client.createIssue(project, issue);
    client.log(`Created issue #${num} "${issue.title}" [${issue.labels.join(', ')}]`);
    numbers.push(num);
  }

  for (const num of numbers) {
    await client.closeIssue(project, num);
  }
  client.log(`Closed issues ${numbers.map((n) => '#' + n).join(', ')}`);

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

  const numbers: number[] = [];
  for (const issue of issues) {
    const num = await client.createIssue(project, issue);
    client.log(`Created issue #${num} "${issue.title}" [${issue.labels.join(', ')}]`);
    numbers.push(num);
  }

  for (const num of numbers) {
    await client.closeIssue(project, num);
  }
  client.log(`Closed issues ${numbers.map((n) => '#' + n).join(', ')}`);

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

  const num1 = await client.createIssue(project, {
    title: 'Fix critical payment bug',
    labels: ['CLIENT1', 'bug'],
  });
  client.log(`Created issue #${num1} "Fix critical payment bug" [CLIENT1, bug]`);
  await client.closeIssue(project, num1);
  client.log(`Closed issue #${num1}`);
  await wait(2000);

  await client.createTag(project, 'client1-v13.0.0-hotfix1');
  client.log('Created tag client1-v13.0.0-hotfix1');
  await wait(2000);

  const postHotfixIssues = [
    { title: 'Add retry logic', labels: ['CLIENT1', 'feature'] },
    { title: 'Fix session timeout', labels: ['CLIENT1', 'bug'] },
  ];

  const numbers: number[] = [];
  for (const issue of postHotfixIssues) {
    const num = await client.createIssue(project, issue);
    client.log(`Created issue #${num} "${issue.title}" [${issue.labels.join(', ')}]`);
    numbers.push(num);
  }

  for (const num of numbers) {
    await client.closeIssue(project, num);
  }
  client.log(`Closed issues ${numbers.map((n) => '#' + n).join(', ')}`);
  await wait(2000);

  await client.createTag(project, 'client1-v13.1.0');
  client.log('Created tag client1-v13.1.0');

  client.log('=== Done ===');
  client.log('Run: releasejet generate --tag client1-v13.1.0 --debug');
};

scenarios['issue-outside-window'] = async ({ client, project, wait }) => {
  client.log('=== Scenario: issue-outside-window ===');

  // Issue A: closed BEFORE previous tag (should be excluded)
  const numA = await client.createIssue(project, {
    title: 'Old completed task',
    labels: ['CLIENT1', 'feature'],
  });
  client.log(`Created issue #${numA} "Old completed task" [CLIENT1, feature]`);
  await client.closeIssue(project, numA);
  client.log(`Closed issue #${numA} (before previous tag)`);
  await wait(2000);

  await client.createTag(project, 'client1-v15.0.0');
  client.log('Created tag client1-v15.0.0');
  await wait(2000);

  // Issue B: closed BETWEEN tags (should be included)
  const numB = await client.createIssue(project, {
    title: 'New feature in window',
    labels: ['CLIENT1', 'feature'],
  });
  client.log(`Created issue #${numB} "New feature in window" [CLIENT1, feature]`);
  await client.closeIssue(project, numB);
  client.log(`Closed issue #${numB} (between tags)`);
  await wait(2000);

  await client.createTag(project, 'client1-v15.1.0');
  client.log('Created tag client1-v15.1.0');
  await wait(2000);

  // Issue C: closed AFTER current tag (should be excluded)
  const numC = await client.createIssue(project, {
    title: 'Future work item',
    labels: ['CLIENT1', 'feature'],
  });
  client.log(`Created issue #${numC} "Future work item" [CLIENT1, feature]`);
  await client.closeIssue(project, numC);
  client.log(`Closed issue #${numC} (after current tag)`);

  client.log('=== Done ===');
  client.log('Run: releasejet generate --tag client1-v15.1.0 --debug');
};

// --- Pull Request Source Scenarios ---

scenarios['pr-happy-path'] = async ({ client, project, wait }) => {
  client.log('=== Scenario: pr-happy-path ===');

  const msId = await client.createMilestone(project, 'Release 30.1');
  client.log(`Created milestone "Release 30.1" (id: ${msId})`);

  await client.createTag(project, 'client1-v30.0.0');
  client.log('Created tag client1-v30.0.0');
  await wait(2000);

  const prs = [
    { title: 'Add dark mode', labels: ['CLIENT1', 'feature'], milestoneId: msId },
    { title: 'Fix login crash', labels: ['CLIENT1', 'bug'], milestoneId: msId },
    { title: 'Investigate memory leak', labels: ['CLIENT1', 'investigation'], milestoneId: msId },
    { title: 'Migrate to new API', labels: ['CLIENT1', 'change-request'], milestoneId: msId },
  ];

  for (let i = 0; i < prs.length; i++) {
    const pr = prs[i];
    const branchName = `seed/pr-happy-path-${i + 1}`;
    await client.createBranch(project, branchName);
    client.log(`Created branch ${branchName}`);

    const prNum = await client.createPullRequest(project, {
      ...pr,
      head: branchName,
      base: 'main',
    });
    client.log(`Created PR #${prNum} "${pr.title}" [${pr.labels.join(', ')}]`);

    await client.mergePullRequest(project, prNum);
    client.log(`Merged PR #${prNum}`);
  }

  await wait(2000);
  await client.createTag(project, 'client1-v30.1.0');
  client.log('Created tag client1-v30.1.0');

  client.log('=== Done ===');
  client.log('Run: releasejet generate --tag client1-v30.1.0 --debug');
};

scenarios['pr-second-client'] = async ({ client, project, wait }) => {
  client.log('=== Scenario: pr-second-client ===');

  await client.createTag(project, 'client2-v30.0.0');
  client.log('Created tag client2-v30.0.0');
  await wait(2000);

  const prs = [
    { title: 'Add push notifications', labels: ['CLIENT2', 'feature'] },
    { title: 'Fix crash on logout', labels: ['CLIENT2', 'bug'] },
    { title: 'Update payment flow', labels: ['CLIENT2', 'change-request'] },
  ];

  for (let i = 0; i < prs.length; i++) {
    const pr = prs[i];
    const branchName = `seed/pr-second-client-${i + 1}`;
    await client.createBranch(project, branchName);
    client.log(`Created branch ${branchName}`);

    const prNum = await client.createPullRequest(project, {
      ...pr,
      head: branchName,
      base: 'main',
    });
    client.log(`Created PR #${prNum} "${pr.title}" [${pr.labels.join(', ')}]`);

    await client.mergePullRequest(project, prNum);
    client.log(`Merged PR #${prNum}`);
  }

  await wait(2000);
  await client.createTag(project, 'client2-v30.1.0');
  client.log('Created tag client2-v30.1.0');

  client.log('=== Done ===');
  client.log('Run: releasejet generate --tag client2-v30.1.0 --debug');
};

scenarios['pr-uncategorized-lenient'] = async ({ client, project, wait }) => {
  client.log('=== Scenario: pr-uncategorized-lenient ===');

  await client.createTag(project, 'client1-v31.0.0');
  client.log('Created tag client1-v31.0.0');
  await wait(2000);

  const prs = [
    { title: 'Add search bar', labels: ['CLIENT1', 'feature'] },
    { title: 'Fix memory leak', labels: ['CLIENT1', 'bug'] },
    { title: 'Update README', labels: ['CLIENT1'] },
  ];

  for (let i = 0; i < prs.length; i++) {
    const pr = prs[i];
    const branchName = `seed/pr-uncategorized-${i + 1}`;
    await client.createBranch(project, branchName);
    client.log(`Created branch ${branchName}`);

    const prNum = await client.createPullRequest(project, {
      ...pr,
      head: branchName,
      base: 'main',
    });
    client.log(`Created PR #${prNum} "${pr.title}" [${pr.labels.join(', ')}]`);

    await client.mergePullRequest(project, prNum);
    client.log(`Merged PR #${prNum}`);
  }

  await wait(2000);
  await client.createTag(project, 'client1-v31.1.0');
  client.log('Created tag client1-v31.1.0');

  client.log('=== Done ===');
  client.log('Run: releasejet generate --tag client1-v31.1.0 --debug');
};

scenarios['pr-first-tag'] = async ({ client, project, wait }) => {
  client.log('=== Scenario: pr-first-tag ===');

  const prs = [
    { title: 'Initial feature set', labels: ['CLIENT3', 'feature'] },
    { title: 'Fix onboarding flow', labels: ['CLIENT3', 'bug'] },
  ];

  for (let i = 0; i < prs.length; i++) {
    const pr = prs[i];
    const branchName = `seed/pr-first-tag-${i + 1}`;
    await client.createBranch(project, branchName);
    client.log(`Created branch ${branchName}`);

    const prNum = await client.createPullRequest(project, {
      ...pr,
      head: branchName,
      base: 'main',
    });
    client.log(`Created PR #${prNum} "${pr.title}" [${pr.labels.join(', ')}]`);

    await client.mergePullRequest(project, prNum);
    client.log(`Merged PR #${prNum}`);
  }

  await wait(2000);
  await client.createTag(project, 'client3-v30.0.0');
  client.log('Created tag client3-v30.0.0');

  client.log('=== Done ===');
  client.log('Run: releasejet generate --tag client3-v30.0.0 --debug');
};

scenarios['pr-empty-release'] = async ({ client, project, wait }) => {
  client.log('=== Scenario: pr-empty-release ===');

  await client.createTag(project, 'client1-v34.0.0');
  client.log('Created tag client1-v34.0.0');
  await wait(2000);

  await client.createTag(project, 'client1-v34.1.0');
  client.log('Created tag client1-v34.1.0');

  client.log('=== Done ===');
  client.log('Run: releasejet generate --tag client1-v34.1.0 --debug');
};

// --- Helpers ---

export function listScenarios(): string[] {
  return Object.keys(scenarios).sort();
}

export function resolveGitHubUrl(urlFlag?: string): string {
  if (urlFlag) return urlFlag;
  return 'https://github.com';
}

function realWait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- CLI ---

async function main(): Promise<void> {
  const program = new Command();
  program
    .name('seed-test-data-github')
    .description('Seed GitHub project with test data for ReleaseJet E2E testing')
    .option('--project <path>', 'GitHub project path (e.g., makisp/test-project)')
    .option('--scenario <name>', 'Scenario to run (or "all")')
    .option('--url <url>', 'GitHub URL (default: https://github.com)')
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

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.error('Error: GITHUB_TOKEN environment variable is not set');
    process.exit(1);
  }

  const url = resolveGitHubUrl(opts.url);
  const client = createGitHubSeedClient(url, token);
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
const isDirectRun = process.argv[1]?.replace(/\\/g, '/').includes('seed-test-data-github');
if (isDirectRun) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
