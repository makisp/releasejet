import { select } from '@inquirer/prompts';
import type { CategorizedIssues, ReleaseJetConfig } from '../types.js';

export async function promptForUncategorized(
  issues: CategorizedIssues,
  config: ReleaseJetConfig,
): Promise<void> {
  console.log(
    `\n⚠ ${issues.uncategorized.length} uncategorized issues found:\n`,
  );

  const categoryChoices = Object.entries(config.categories).map(
    ([label, heading]) => ({
      name: `${heading} (${label})`,
      value: label,
    }),
  );

  const toProcess = [...issues.uncategorized];
  issues.uncategorized.length = 0;

  for (const issue of toProcess) {
    const action = await select({
      message: `#${issue.number} - ${issue.title}:`,
      choices: [
        ...categoryChoices,
        { name: 'Skip (exclude)', value: 'skip' },
        { name: 'Other (uncategorized)', value: 'other' },
      ],
    });

    if (action === 'skip') continue;
    if (action === 'other') {
      issues.uncategorized.push(issue);
    } else {
      const heading = config.categories[action];
      if (!issues.categorized[heading]) issues.categorized[heading] = [];
      issues.categorized[heading].push(issue);
    }
  }
}
