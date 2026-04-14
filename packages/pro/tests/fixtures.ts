import type { ReleaseNotesData, ReleaseJetConfig } from '@makispps/releasejet/plugin';

export const githubConfig: ReleaseJetConfig = {
  provider: { type: 'github', url: 'https://github.com' },
  source: 'issues',
  clients: [],
  categories: {
    feature: 'New Features',
    bug: 'Bug Fixes',
    improvement: 'Improvements',
  },
  uncategorized: 'lenient',
};

export const gitlabConfig: ReleaseJetConfig = {
  provider: { type: 'gitlab', url: 'https://gitlab.example.com' },
  source: 'issues',
  clients: [{ prefix: 'mobile', label: 'MOBILE' }],
  categories: {
    feature: 'New Features',
    bug: 'Bug Fixes',
    improvement: 'Improvements',
  },
  uncategorized: 'lenient',
};

export const fullData: ReleaseNotesData = {
  tagName: 'v1.2.0',
  version: '1.2.0',
  clientPrefix: null,
  date: '2026-04-14',
  milestone: { title: 'Sprint 12', url: 'https://github.com/owner/repo/milestone/12' },
  projectUrl: 'https://github.com/owner/repo',
  issues: {
    categorized: {
      'Bug Fixes': [
        { number: 42, title: 'Fix login timeout', labels: ['bug'], closedAt: '2026-04-13T10:00:00Z', webUrl: '', milestone: null, author: 'alice', assignee: null, closedBy: 'alice' },
        { number: 38, title: 'Handle null avatar', labels: ['bug'], closedAt: '2026-04-12T10:00:00Z', webUrl: '', milestone: null, author: 'bob', assignee: null, closedBy: 'bob' },
      ],
      'New Features': [
        { number: 45, title: 'Add dark mode', labels: ['feature'], closedAt: '2026-04-14T10:00:00Z', webUrl: '', milestone: null, author: 'alice', assignee: null, closedBy: 'alice' },
      ],
    },
    uncategorized: [],
  },
  totalCount: 3,
  uncategorizedCount: 0,
  contributors: [
    { username: 'alice', profileUrl: 'https://github.com/alice' },
    { username: 'bob', profileUrl: 'https://github.com/bob' },
  ],
};

export const minimalData: ReleaseNotesData = {
  tagName: 'v0.1.0',
  version: '0.1.0',
  clientPrefix: null,
  date: '2026-04-14',
  milestone: null,
  projectUrl: 'https://github.com/owner/repo',
  issues: {
    categorized: {
      'Bug Fixes': [
        { number: 1, title: 'Fix crash', labels: ['bug'], closedAt: '', webUrl: '', milestone: null, author: null, assignee: null, closedBy: null },
      ],
    },
    uncategorized: [],
  },
  totalCount: 1,
  uncategorizedCount: 0,
  contributors: [],
};

export const multiClientData: ReleaseNotesData = {
  tagName: 'mobile-v1.2.0',
  version: '1.2.0',
  clientPrefix: 'mobile',
  date: '2026-04-14',
  milestone: null,
  projectUrl: 'https://github.com/owner/repo',
  issues: {
    categorized: {
      'New Features': [
        { number: 10, title: 'Add push notifications', labels: ['feature'], closedAt: '', webUrl: '', milestone: null, author: null, assignee: null, closedBy: null },
      ],
    },
    uncategorized: [],
  },
  totalCount: 1,
  uncategorizedCount: 0,
  contributors: [],
};

export const uncategorizedData: ReleaseNotesData = {
  tagName: 'v1.0.0',
  version: '1.0.0',
  clientPrefix: null,
  date: '2026-04-14',
  milestone: null,
  projectUrl: 'https://github.com/owner/repo',
  issues: {
    categorized: {
      'Bug Fixes': [
        { number: 1, title: 'Fix crash', labels: ['bug'], closedAt: '', webUrl: '', milestone: null, author: null, assignee: null, closedBy: null },
      ],
    },
    uncategorized: [
      { number: 99, title: 'Unlabeled task', labels: [], closedAt: '', webUrl: '', milestone: null, author: null, assignee: null, closedBy: null },
    ],
  },
  totalCount: 2,
  uncategorizedCount: 1,
  contributors: [],
};
