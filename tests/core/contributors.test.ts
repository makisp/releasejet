import { describe, it, expect } from 'vitest';
import { extractContributors } from '../../src/core/contributors.js';
import type { CategorizedIssues, ReleaseJetConfig } from '../../src/types.js';

const baseConfig: ReleaseJetConfig = {
  provider: { type: 'github', url: 'https://github.com' },
  source: 'issues',
  clients: [],
  categories: { feature: 'New Features', bug: 'Bug Fixes' },
  uncategorized: 'lenient',
  contributors: { enabled: true, exclude: ['dependabot', 'renovate', 'gitlab-bot', 'github-actions'] },
};

function makeIssue(overrides: {
  number: number;
  author?: string | null;
  assignee?: string | null;
  closedBy?: string | null;
}) {
  return {
    number: overrides.number,
    title: `Issue #${overrides.number}`,
    labels: ['feature'],
    closedAt: '2026-04-07',
    webUrl: '',
    milestone: null,
    author: overrides.author ?? null,
    assignee: overrides.assignee ?? null,
    closedBy: overrides.closedBy ?? null,
  };
}

describe('extractContributors', () => {
  it('extracts assignees from issues source', () => {
    const issues: CategorizedIssues = {
      categorized: {
        'New Features': [
          makeIssue({ number: 1, assignee: 'elena', closedBy: 'makisp', author: 'nikos' }),
        ],
      },
      uncategorized: [],
    };

    const result = extractContributors(issues, baseConfig, 'https://github.com');

    expect(result).toEqual([
      { username: 'elena', profileUrl: 'https://github.com/elena' },
    ]);
  });

  it('falls back to closedBy when assignee is null (issues source)', () => {
    const issues: CategorizedIssues = {
      categorized: {
        'New Features': [
          makeIssue({ number: 1, assignee: null, closedBy: 'makisp', author: 'nikos' }),
        ],
      },
      uncategorized: [],
    };

    const result = extractContributors(issues, baseConfig, 'https://github.com');

    expect(result).toEqual([
      { username: 'makisp', profileUrl: 'https://github.com/makisp' },
    ]);
  });

  it('uses author for pull_requests source', () => {
    const prConfig: ReleaseJetConfig = { ...baseConfig, source: 'pull_requests' };
    const issues: CategorizedIssues = {
      categorized: {
        'New Features': [
          makeIssue({ number: 1, author: 'elena', assignee: 'makisp' }),
        ],
      },
      uncategorized: [],
    };

    const result = extractContributors(issues, prConfig, 'https://github.com');

    expect(result).toEqual([
      { username: 'elena', profileUrl: 'https://github.com/elena' },
    ]);
  });

  it('deduplicates contributors', () => {
    const issues: CategorizedIssues = {
      categorized: {
        'New Features': [
          makeIssue({ number: 1, assignee: 'elena' }),
          makeIssue({ number: 2, assignee: 'elena' }),
          makeIssue({ number: 3, assignee: 'makisp' }),
        ],
      },
      uncategorized: [],
    };

    const result = extractContributors(issues, baseConfig, 'https://github.com');

    expect(result).toHaveLength(2);
    expect(result.map(c => c.username)).toEqual(['elena', 'makisp']);
  });

  it('sorts contributors alphabetically', () => {
    const issues: CategorizedIssues = {
      categorized: {
        'New Features': [
          makeIssue({ number: 1, assignee: 'nikos' }),
          makeIssue({ number: 2, assignee: 'elena' }),
          makeIssue({ number: 3, assignee: 'makisp' }),
        ],
      },
      uncategorized: [],
    };

    const result = extractContributors(issues, baseConfig, 'https://github.com');

    expect(result.map(c => c.username)).toEqual(['elena', 'makisp', 'nikos']);
  });

  it('filters out bots from default exclude list (case-insensitive)', () => {
    const issues: CategorizedIssues = {
      categorized: {
        'New Features': [
          makeIssue({ number: 1, assignee: 'Dependabot' }),
          makeIssue({ number: 2, assignee: 'renovate' }),
          makeIssue({ number: 3, assignee: 'elena' }),
        ],
      },
      uncategorized: [],
    };

    const result = extractContributors(issues, baseConfig, 'https://github.com');

    expect(result).toEqual([
      { username: 'elena', profileUrl: 'https://github.com/elena' },
    ]);
  });

  it('filters out usernames with [bot] suffix (always active)', () => {
    const issues: CategorizedIssues = {
      categorized: {
        'New Features': [
          makeIssue({ number: 1, assignee: 'dependabot[bot]' }),
          makeIssue({ number: 2, assignee: 'custom-app[bot]' }),
          makeIssue({ number: 3, assignee: 'elena' }),
        ],
      },
      uncategorized: [],
    };

    const result = extractContributors(issues, baseConfig, 'https://github.com');

    expect(result).toEqual([
      { username: 'elena', profileUrl: 'https://github.com/elena' },
    ]);
  });

  it('uses custom exclude list when provided', () => {
    const customConfig: ReleaseJetConfig = {
      ...baseConfig,
      contributors: { enabled: true, exclude: ['ci-bot'] },
    };
    const issues: CategorizedIssues = {
      categorized: {
        'New Features': [
          makeIssue({ number: 1, assignee: 'ci-bot' }),
          makeIssue({ number: 2, assignee: 'dependabot' }),
          makeIssue({ number: 3, assignee: 'elena' }),
        ],
      },
      uncategorized: [],
    };

    const result = extractContributors(issues, customConfig, 'https://github.com');

    // dependabot is NOT filtered because custom exclude replaces defaults
    // but dependabot does NOT have [bot] suffix so it passes the [bot] check
    expect(result.map(c => c.username)).toEqual(['dependabot', 'elena']);
  });

  it('[bot] suffix filtering is active even with custom exclude list', () => {
    const customConfig: ReleaseJetConfig = {
      ...baseConfig,
      contributors: { enabled: true, exclude: ['ci-bot'] },
    };
    const issues: CategorizedIssues = {
      categorized: {
        'New Features': [
          makeIssue({ number: 1, assignee: 'dependabot[bot]' }),
          makeIssue({ number: 2, assignee: 'elena' }),
        ],
      },
      uncategorized: [],
    };

    const result = extractContributors(issues, customConfig, 'https://github.com');

    expect(result.map(c => c.username)).toEqual(['elena']);
  });

  it('skips issues with null contributor', () => {
    const issues: CategorizedIssues = {
      categorized: {
        'New Features': [
          makeIssue({ number: 1, assignee: null, closedBy: null }),
          makeIssue({ number: 2, assignee: 'elena' }),
        ],
      },
      uncategorized: [],
    };

    const result = extractContributors(issues, baseConfig, 'https://github.com');

    expect(result).toEqual([
      { username: 'elena', profileUrl: 'https://github.com/elena' },
    ]);
  });

  it('returns empty array when no contributors found', () => {
    const issues: CategorizedIssues = {
      categorized: {},
      uncategorized: [],
    };

    const result = extractContributors(issues, baseConfig, 'https://github.com');

    expect(result).toEqual([]);
  });

  it('includes contributors from uncategorized issues', () => {
    const issues: CategorizedIssues = {
      categorized: {
        'New Features': [
          makeIssue({ number: 1, assignee: 'elena' }),
        ],
      },
      uncategorized: [
        makeIssue({ number: 2, assignee: 'nikos' }),
      ],
    };

    const result = extractContributors(issues, baseConfig, 'https://github.com');

    expect(result.map(c => c.username)).toEqual(['elena', 'nikos']);
  });

  it('builds profile URLs using the host URL', () => {
    const gitlabConfig: ReleaseJetConfig = {
      ...baseConfig,
      provider: { type: 'gitlab', url: 'https://gitlab.example.com' },
    };
    const issues: CategorizedIssues = {
      categorized: {
        'New Features': [
          makeIssue({ number: 1, assignee: 'elena' }),
        ],
      },
      uncategorized: [],
    };

    const result = extractContributors(issues, gitlabConfig, 'https://gitlab.example.com');

    expect(result).toEqual([
      { username: 'elena', profileUrl: 'https://gitlab.example.com/elena' },
    ]);
  });
});
