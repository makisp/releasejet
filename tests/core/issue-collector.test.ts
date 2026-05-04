import { describe, it, expect, vi, beforeEach } from 'vitest';
import { collectIssues, detectMilestone } from '../../src/core/issue-collector.js';
import type { ProviderClient } from '../../src/providers/types.js';
import type { TagInfo, ReleaseJetConfig, CategorizedIssues, Issue } from '../../src/types.js';

function createMockClient(): ProviderClient {
  return {
    listTags: vi.fn(),
    listIssues: vi.fn().mockResolvedValue([]),
    listPullRequests: vi.fn().mockResolvedValue([]),
    createRelease: vi.fn(),
    listMilestones: vi.fn().mockResolvedValue([]),
  };
}

const config: ReleaseJetConfig = {
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

const currentTag: TagInfo = {
  raw: 'mobile-v0.1.17',
  prefix: 'mobile',
  version: '0.1.17',
  suffix: null,
  createdAt: '2026-04-08T10:00:00Z',
  commitDate: '2026-04-08T10:00:00Z',
  dateSource: 'commit',
};

const previousTag: TagInfo = {
  raw: 'mobile-v0.1.16',
  prefix: 'mobile',
  version: '0.1.16',
  suffix: null,
  createdAt: '2026-03-01T10:00:00Z',
  commitDate: '2026-03-01T10:00:00Z',
  dateSource: 'commit',
};

describe('collectIssues', () => {
  let client: ProviderClient;

  beforeEach(() => {
    client = createMockClient();
  });

  it('categorizes issues by their label', async () => {
    vi.mocked(client.listIssues).mockResolvedValue([
      { number:1, title: 'New feature', labels: ['feature', 'MOBILE'], closedAt: '2026-04-07', webUrl: '', milestone: null, author: null, assignee: null, closedBy: null },
      { number:2, title: 'Bug fix', labels: ['bug', 'MOBILE'], closedAt: '2026-04-06', webUrl: '', milestone: null, author: null, assignee: null, closedBy: null },
      { number:3, title: 'No category', labels: ['MOBILE'], closedAt: '2026-04-05', webUrl: '', milestone: null, author: null, assignee: null, closedBy: null },
    ]);

    const result = await collectIssues(client, 'mobile/app', currentTag, previousTag, [previousTag, currentTag], config);

    expect(result.categorized['New Features']).toHaveLength(1);
    expect(result.categorized['New Features'][0].number).toBe(1);
    expect(result.categorized['Bug Fixes']).toHaveLength(1);
    expect(result.categorized['Bug Fixes'][0].number).toBe(2);
    expect(result.uncategorized).toHaveLength(1);
    expect(result.uncategorized[0].number).toBe(3);
  });

  it('passes client label filter for multi-client repos', async () => {
    await collectIssues(client, 'mobile/app', currentTag, previousTag, [previousTag, currentTag], config);

    expect(client.listIssues).toHaveBeenCalledWith('mobile/app', {
      state: 'closed',
      updatedAfter: '2026-03-01T10:00:00Z',
      labels: 'MOBILE',
    });
  });

  it('omits label filter for single-client repos', async () => {
    const singleTag: TagInfo = {
      raw: 'v1.0.0',
      prefix: null,
      version: '1.0.0',
      suffix: null,
      createdAt: '2026-04-08T10:00:00Z',
      commitDate: '2026-04-08T10:00:00Z',
      dateSource: 'commit',
    };
    const singleConfig: ReleaseJetConfig = {
      ...config,
      clients: [],
    };

    await collectIssues(client, 'web/app', singleTag, null, [singleTag], singleConfig);

    expect(client.listIssues).toHaveBeenCalledWith('web/app', {
      state: 'closed',
      updatedAfter: undefined,
      labels: undefined,
    });
  });

  it('handles first release (no previous tag)', async () => {
    await collectIssues(client, 'mobile/app', currentTag, null, [currentTag], config);

    expect(client.listIssues).toHaveBeenCalledWith('mobile/app', {
      state: 'closed',
      updatedAfter: undefined,
      labels: 'MOBILE',
    });
  });

  it('filters issues by closedAt between previous and current tag', async () => {
    // Freeze "now" so the upper-bound fallback in collectIssues
    // (next-same-prefix-tag.createdAt ?? new Date()) doesn't drift past the
    // test's "Too new" date once real wall-clock time advances.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-15T00:00:00Z'));
    try {
      vi.mocked(client.listIssues).mockResolvedValue([
        { number:1, title: 'In range', labels: ['feature', 'MOBILE'], closedAt: '2026-03-15T00:00:00Z', webUrl: '', milestone: null, author: null, assignee: null, closedBy: null },
        { number:2, title: 'Too old', labels: ['bug', 'MOBILE'], closedAt: '2026-02-15T00:00:00Z', webUrl: '', milestone: null, author: null, assignee: null, closedBy: null },
        { number:3, title: 'Too new', labels: ['bug', 'MOBILE'], closedAt: '2026-05-01T00:00:00Z', webUrl: '', milestone: null, author: null, assignee: null, closedBy: null },
      ]);

      const result = await collectIssues(client, 'mobile/app', currentTag, previousTag, [previousTag, currentTag], config);

      const allIssues = [...Object.values(result.categorized).flat(), ...result.uncategorized];
      expect(allIssues).toHaveLength(1);
      expect(allIssues[0].number).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('includes issues closed before current tag when no previous tag', async () => {
    // See note above: freeze "now" so the implicit upper-bound stays before
    // the test's "Future issue" date.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-15T00:00:00Z'));
    try {
      vi.mocked(client.listIssues).mockResolvedValue([
        { number:1, title: 'Old issue', labels: ['feature', 'MOBILE'], closedAt: '2026-01-01T00:00:00Z', webUrl: '', milestone: null, author: null, assignee: null, closedBy: null },
        { number:2, title: 'Recent issue', labels: ['bug', 'MOBILE'], closedAt: '2026-04-07T00:00:00Z', webUrl: '', milestone: null, author: null, assignee: null, closedBy: null },
        { number:3, title: 'Future issue', labels: ['bug', 'MOBILE'], closedAt: '2026-05-01T00:00:00Z', webUrl: '', milestone: null, author: null, assignee: null, closedBy: null },
      ]);

      const result = await collectIssues(client, 'mobile/app', currentTag, null, [currentTag], config);

      const allIssues = [...Object.values(result.categorized).flat(), ...result.uncategorized];
      expect(allIssues).toHaveLength(2);
      expect(allIssues.map(i => i.number)).toEqual([1, 2]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('assigns issue to first matching category when multiple match', async () => {
    vi.mocked(client.listIssues).mockResolvedValue([
      { number:1, title: 'Feature and bug', labels: ['feature', 'bug', 'MOBILE'], closedAt: '2026-04-07', webUrl: '', milestone: null, author: null, assignee: null, closedBy: null },
    ]);

    const result = await collectIssues(client, 'mobile/app', currentTag, previousTag, [previousTag, currentTag], config);

    const allCategorized = Object.values(result.categorized).flat();
    expect(allCategorized).toHaveLength(1);
    expect(result.uncategorized).toHaveLength(0);
  });

  it('calls listPullRequests when source is pull_requests', async () => {
    const prConfig: ReleaseJetConfig = {
      ...config,
      source: 'pull_requests',
    };
    vi.mocked(client.listPullRequests).mockResolvedValue([
      { number: 10, title: 'PR feature', labels: ['feature', 'MOBILE'], closedAt: '2026-04-07', webUrl: '', milestone: null, author: null, assignee: null, closedBy: null },
    ]);

    const result = await collectIssues(client, 'mobile/app', currentTag, previousTag, [previousTag, currentTag], prConfig);

    expect(client.listPullRequests).toHaveBeenCalled();
    expect(client.listIssues).not.toHaveBeenCalled();
    expect(result.categorized['New Features']).toHaveLength(1);
    expect(result.categorized['New Features'][0].number).toBe(10);
  });
});

describe('collectIssues — tag date resolution', () => {
  let client: ProviderClient;
  beforeEach(() => { client = createMockClient(); });

  const mkTag = (raw: string, prefix: string | null, version: string, createdAt: string, dateSource: 'annotated' | 'release' | 'commit' = 'commit'): TagInfo => ({
    raw, prefix, version, suffix: null, createdAt,
    commitDate: dateSource === 'commit' ? createdAt : '2026-04-01T00:00:00Z',
    dateSource,
  });

  it('upper bound = createdAt when dateSource is annotated (no now() involvement)', async () => {
    const current = mkTag('v1.0.0', null, '1.0.0', '2026-04-08T10:00:00Z', 'annotated');

    vi.mocked(client.listIssues).mockResolvedValue([
      { number: 1, title: 'Before tag', labels: ['feature'], closedAt: '2026-04-08T09:00:00Z', webUrl: '', milestone: null, author: null, assignee: null, closedBy: null },
      { number: 2, title: 'After annotated tag', labels: ['feature'], closedAt: '2026-04-08T11:00:00Z', webUrl: '', milestone: null, author: null, assignee: null, closedBy: null },
    ]);

    const result = await collectIssues(client, 'owner/repo', current, null, [current], { ...config, clients: [] });

    const all = [...Object.values(result.categorized).flat(), ...result.uncategorized];
    expect(all.map(i => i.number)).toEqual([1]);
  });

  it('upper bound = now() when current is latest and dateSource is commit', async () => {
    const current = mkTag('v1.0.0', null, '1.0.0', '2026-04-08T10:00:00Z', 'commit');
    // Issue closed 30s AFTER commit/tag, mirrors the real bug
    vi.mocked(client.listIssues).mockResolvedValue([
      { number: 1, title: 'Late-close', labels: ['feature'], closedAt: '2026-04-08T10:00:30Z', webUrl: '', milestone: null, author: null, assignee: null, closedBy: null },
    ]);

    const result = await collectIssues(client, 'owner/repo', current, null, [current], { ...config, clients: [] });

    const all = [...Object.values(result.categorized).flat(), ...result.uncategorized];
    expect(all.map(i => i.number)).toEqual([1]);
  });

  it('upper bound = next same-prefix tag when current is not the latest', async () => {
    const current = mkTag('v1.0.0', null, '1.0.0', '2026-04-08T10:00:00Z', 'commit');
    const next = mkTag('v1.1.0', null, '1.1.0', '2026-04-10T10:00:00Z', 'commit');

    vi.mocked(client.listIssues).mockResolvedValue([
      { number: 1, title: 'Before next', labels: ['feature'], closedAt: '2026-04-09T10:00:00Z', webUrl: '', milestone: null, author: null, assignee: null, closedBy: null },
      { number: 2, title: 'After next',  labels: ['feature'], closedAt: '2026-04-11T10:00:00Z', webUrl: '', milestone: null, author: null, assignee: null, closedBy: null },
    ]);

    const result = await collectIssues(client, 'owner/repo', current, null, [current, next], { ...config, clients: [] });

    const all = [...Object.values(result.categorized).flat(), ...result.uncategorized];
    expect(all.map(i => i.number)).toEqual([1]);
  });

  it('passes previousTag.commitDate to API updatedAfter (not createdAt)', async () => {
    const current = mkTag('v2.0.0', null, '2.0.0', '2026-04-15T10:00:00Z', 'annotated');
    const previous: TagInfo = {
      raw: 'v1.0.0', prefix: null, version: '1.0.0', suffix: null,
      createdAt: '2026-04-10T12:00:00Z',     // annotated tagger date
      commitDate: '2026-04-01T10:00:00Z',    // older commit
      dateSource: 'annotated',
    };

    await collectIssues(client, 'owner/repo', current, previous, [previous, current], { ...config, clients: [] });

    expect(client.listIssues).toHaveBeenCalledWith('owner/repo', {
      state: 'closed',
      updatedAfter: '2026-04-01T10:00:00Z',  // commitDate, not createdAt
      labels: undefined,
    });
  });

  it('lower-bound filter uses previousTag.createdAt (resolved date)', async () => {
    const current = mkTag('v2.0.0', null, '2.0.0', '2026-04-15T10:00:00Z', 'annotated');
    const previous: TagInfo = {
      raw: 'v1.0.0', prefix: null, version: '1.0.0', suffix: null,
      createdAt: '2026-04-10T12:00:00Z',
      commitDate: '2026-04-01T10:00:00Z',
      dateSource: 'annotated',
    };

    vi.mocked(client.listIssues).mockResolvedValue([
      { number: 1, title: 'Between commit and tagger — excluded', labels: ['feature'], closedAt: '2026-04-05T00:00:00Z', webUrl: '', milestone: null, author: null, assignee: null, closedBy: null },
      { number: 2, title: 'After tagger — included',              labels: ['feature'], closedAt: '2026-04-11T00:00:00Z', webUrl: '', milestone: null, author: null, assignee: null, closedBy: null },
    ]);

    const result = await collectIssues(client, 'owner/repo', current, previous, [previous, current], { ...config, clients: [] });

    const all = [...Object.values(result.categorized).flat(), ...result.uncategorized];
    expect(all.map(i => i.number)).toEqual([2]);
  });

  it('throws on invalid tag dates (empty string createdAt)', async () => {
    const current: TagInfo = {
      raw: 'v1.0.0', prefix: null, version: '1.0.0', suffix: null,
      createdAt: '',              // invalid
      commitDate: '',             // invalid
      dateSource: 'annotated',   // forces createdAt to be used directly as upperBoundIso
    };

    await expect(
      collectIssues(client, 'owner/repo', current, null, [current], { ...config, clients: [] }),
    ).rejects.toThrow(/Invalid tag date/);
  });

  it('regression — 4 issues closed 27-47s after a lightweight tag are all included (GitLab UI scenario)', async () => {
    const current: TagInfo = {
      raw: 'client2-v11.0.0', prefix: 'client2', version: '11.0.0', suffix: null,
      createdAt: '2026-04-17T07:20:46Z',       // commit date (wrong as "tag time")
      commitDate: '2026-04-17T07:20:46Z',
      dateSource: 'commit',
    };
    const previous: TagInfo = {
      raw: 'client2-v10.1.0', prefix: 'client2', version: '10.1.0', suffix: null,
      createdAt: '2026-04-09T19:52:20Z',
      commitDate: '2026-04-09T19:52:20Z',
      dateSource: 'commit',
    };

    vi.mocked(client.listIssues).mockResolvedValue([
      { number: 72, title: 'Migrate API v1 endpoints', labels: ['CLIENT2', 'breaking-change'], closedAt: '2026-04-17T07:21:13.079Z', webUrl: '', milestone: null, author: null, assignee: null, closedBy: null },
      { number: 71, title: 'Reduce dashboard initial load time', labels: ['CLIENT2', 'improvement'], closedAt: '2026-04-17T07:21:33.119Z', webUrl: '', milestone: null, author: null, assignee: null, closedBy: null },
      { number: 70, title: 'Login fails with 500', labels: ['CLIENT2', 'bug'], closedAt: '2026-04-17T07:21:19.901Z', webUrl: '', milestone: null, author: null, assignee: null, closedBy: null },
      { number: 69, title: 'Add dark mode toggle', labels: ['CLIENT2', 'feature'], closedAt: '2026-04-17T07:21:24.976Z', webUrl: '', milestone: null, author: null, assignee: null, closedBy: null },
    ]);

    const multiClientConfig: ReleaseJetConfig = {
      ...config,
      clients: [{ prefix: 'client2', label: 'CLIENT2' }],
      categories: {
        feature: 'New Features',
        bug: 'Bug Fixes',
        improvement: 'Improvements',
        'breaking-change': 'Breaking Changes',
      },
    };

    const result = await collectIssues(
      client, 'owner/repo', current, previous, [previous, current], multiClientConfig,
    );

    const all = [
      ...Object.values(result.categorized).flat(),
      ...result.uncategorized,
    ];
    expect(all.map(i => i.number).sort()).toEqual([69, 70, 71, 72]);
  });
});

describe('detectMilestone', () => {
  it('returns the most common milestone from issues', () => {
    const issues: CategorizedIssues = {
      categorized: {
        'New Features': [
          { number:1, title: 'Feature', labels: ['feature'], closedAt: '', webUrl: '', milestone: { title: '[MOBILE] Demo 13', url: 'https://gitlab.example.com/-/milestones/13' }, author: null, assignee: null, closedBy: null },
          { number:2, title: 'Feature 2', labels: ['feature'], closedAt: '', webUrl: '', milestone: { title: '[MOBILE] Demo 13', url: 'https://gitlab.example.com/-/milestones/13' }, author: null, assignee: null, closedBy: null },
        ],
      },
      uncategorized: [
        { number:3, title: 'Other', labels: [], closedAt: '', webUrl: '', milestone: { title: '[MOBILE] Demo 12', url: 'https://gitlab.example.com/-/milestones/12' }, author: null, assignee: null, closedBy: null },
      ],
    };
    expect(detectMilestone(issues)).toEqual({ title: '[MOBILE] Demo 13', url: 'https://gitlab.example.com/-/milestones/13' });
  });

  it('returns null when no issues have milestones', () => {
    const issues: CategorizedIssues = {
      categorized: {
        'Bug Fixes': [
          { number:1, title: 'Bug', labels: ['bug'], closedAt: '', webUrl: '', milestone: null, author: null, assignee: null, closedBy: null },
        ],
      },
      uncategorized: [],
    };
    expect(detectMilestone(issues)).toBeNull();
  });

  it('returns null when no issues exist', () => {
    const issues: CategorizedIssues = { categorized: {}, uncategorized: [] };
    expect(detectMilestone(issues)).toBeNull();
  });
});

describe('description extraction integration', () => {
  function makeIssue(overrides: Partial<Issue> = {}): Issue {
    return {
      number: 1,
      title: 't',
      labels: [],
      closedAt: '2026-04-08T10:00:00Z',
      webUrl: '',
      milestone: null,
      author: null,
      assignee: null,
      closedBy: null,
      ...overrides,
    };
  }

  function makeClient(issues: Issue[]): ProviderClient {
    return {
      listTags: vi.fn(),
      listIssues: vi.fn().mockResolvedValue(issues),
      listPullRequests: vi.fn().mockResolvedValue([]),
      createRelease: vi.fn(),
      listMilestones: vi.fn(),
    };
  }

  const tag = (name: string, createdAt: string): TagInfo => ({
    raw: name, prefix: null, version: name.replace('v', ''), suffix: null,
    createdAt, commitDate: createdAt, dateSource: 'release',
  });

  it('runs extractor when config.description === "extract" and writes to description field', async () => {
    const issue = makeIssue({
      number: 42,
      rawBody: '## Description\n\nFirst paragraph here.',
    });
    const client = makeClient([issue]);
    const config: ReleaseJetConfig = {
      provider: { type: 'github', url: '' },
      source: 'issues',
      clients: [],
      categories: {},
      uncategorized: 'lenient',
      description: 'extract',
    };
    const current = tag('v2.0.0', '2026-04-10T00:00:00Z');
    const previous = tag('v1.0.0', '2026-04-01T00:00:00Z');

    const result = await collectIssues(client, 'p', current, previous, [current, previous], config);
    const all = [...Object.values(result.categorized).flat(), ...result.uncategorized];
    expect(all[0].description).toBe('First paragraph here.');
  });

  it('does NOT run extractor when config.description === "none" (or omitted)', async () => {
    const issue = makeIssue({
      number: 42,
      rawBody: 'Some prose body.',
    });
    const client = makeClient([issue]);
    const config: ReleaseJetConfig = {
      provider: { type: 'github', url: '' },
      source: 'issues',
      clients: [],
      categories: {},
      uncategorized: 'lenient',
      // description omitted → effectively 'none'
    };
    const current = tag('v2.0.0', '2026-04-10T00:00:00Z');
    const previous = tag('v1.0.0', '2026-04-01T00:00:00Z');

    const result = await collectIssues(client, 'p', current, previous, [current, previous], config);
    const all = [...Object.values(result.categorized).flat(), ...result.uncategorized];
    expect(all[0].description).toBeUndefined();
  });

  it('treats "ai" as a no-op in core (no extraction)', async () => {
    const issue = makeIssue({ number: 42, rawBody: 'Some prose body.' });
    const client = makeClient([issue]);
    const config: ReleaseJetConfig = {
      provider: { type: 'github', url: '' },
      source: 'issues',
      clients: [],
      categories: {},
      uncategorized: 'lenient',
      description: 'ai',
    };
    const current = tag('v2.0.0', '2026-04-10T00:00:00Z');
    const previous = tag('v1.0.0', '2026-04-01T00:00:00Z');

    const result = await collectIssues(client, 'p', current, previous, [current, previous], config);
    const all = [...Object.values(result.categorized).flat(), ...result.uncategorized];
    expect(all[0].description).toBeUndefined();
  });

  it('emits debug log when body is non-null but cleaning yields nothing', async () => {
    const issue = makeIssue({
      number: 7,
      rawBody: '<!-- comment only -->\n\n## Heading only',
    });
    const client = makeClient([issue]);
    const config: ReleaseJetConfig = {
      provider: { type: 'github', url: '' },
      source: 'issues',
      clients: [],
      categories: {},
      uncategorized: 'lenient',
      description: 'extract',
    };
    const debug = vi.fn();
    const current = tag('v2.0.0', '2026-04-10T00:00:00Z');
    const previous = tag('v1.0.0', '2026-04-01T00:00:00Z');

    await collectIssues(client, 'p', current, previous, [current, previous], config, debug);
    const calls = debug.mock.calls.map(args => args.join(' '));
    expect(calls.some(c => c.includes('skipped description for #7'))).toBe(true);
  });

  it('does NOT emit debug log when rawBody is null/undefined (normal path)', async () => {
    const issue = makeIssue({ number: 8, rawBody: null });
    const client = makeClient([issue]);
    const config: ReleaseJetConfig = {
      provider: { type: 'github', url: '' },
      source: 'issues',
      clients: [],
      categories: {},
      uncategorized: 'lenient',
      description: 'extract',
    };
    const debug = vi.fn();
    const current = tag('v2.0.0', '2026-04-10T00:00:00Z');
    const previous = tag('v1.0.0', '2026-04-01T00:00:00Z');

    await collectIssues(client, 'p', current, previous, [current, previous], config, debug);
    const calls = debug.mock.calls.map(args => args.join(' '));
    expect(calls.some(c => c.includes('skipped description'))).toBe(false);
  });
});

describe('collectIssues — jira ticket detection (F3)', () => {
  let client: ProviderClient;

  beforeEach(() => {
    client = createMockClient();
  });

  const jiraConfig: ReleaseJetConfig = {
    ...config,
    jira: { baseUrl: 'https://acme.atlassian.net', projects: ['PROJ', 'BUG'] },
  };

  it('populates jiraTickets from title and body', async () => {
    vi.mocked(client.listIssues).mockResolvedValue([
      {
        number: 1, title: 'Fix login PROJ-1', labels: ['feature', 'MOBILE'],
        closedAt: '2026-04-07', webUrl: '', milestone: null, author: null,
        assignee: null, closedBy: null, rawBody: 'Body mentions BUG-2',
      },
    ]);

    const result = await collectIssues(client, 'mobile/app', currentTag, previousTag, [previousTag, currentTag], jiraConfig);

    expect(result.categorized['New Features'][0].jiraTickets).toEqual(['PROJ-1', 'BUG-2']);
  });

  it('leaves jiraTickets undefined when no IDs found', async () => {
    vi.mocked(client.listIssues).mockResolvedValue([
      {
        number: 1, title: 'Refactor', labels: ['feature', 'MOBILE'],
        closedAt: '2026-04-07', webUrl: '', milestone: null, author: null,
        assignee: null, closedBy: null, rawBody: 'No tickets here',
      },
    ]);

    const result = await collectIssues(client, 'mobile/app', currentTag, previousTag, [previousTag, currentTag], jiraConfig);

    expect(result.categorized['New Features'][0].jiraTickets).toBeUndefined();
  });

  it('does nothing when config.jira is unset', async () => {
    vi.mocked(client.listIssues).mockResolvedValue([
      {
        number: 1, title: 'PROJ-1 fix', labels: ['feature', 'MOBILE'],
        closedAt: '2026-04-07', webUrl: '', milestone: null, author: null,
        assignee: null, closedBy: null, rawBody: 'mentions BUG-2',
      },
    ]);

    const result = await collectIssues(client, 'mobile/app', currentTag, previousTag, [previousTag, currentTag], config);

    expect(result.categorized['New Features'][0].jiraTickets).toBeUndefined();
  });

  it('applies to uncategorized issues too', async () => {
    vi.mocked(client.listIssues).mockResolvedValue([
      {
        number: 9, title: 'Misc PROJ-9', labels: ['MOBILE'],
        closedAt: '2026-04-07', webUrl: '', milestone: null, author: null,
        assignee: null, closedBy: null, rawBody: null,
      },
    ]);

    const result = await collectIssues(client, 'mobile/app', currentTag, previousTag, [previousTag, currentTag], jiraConfig);

    expect(result.uncategorized[0].jiraTickets).toEqual(['PROJ-9']);
  });

  it('coexists with description: extract', async () => {
    vi.mocked(client.listIssues).mockResolvedValue([
      {
        number: 1, title: 'Fix BUG-7', labels: ['feature', 'MOBILE'],
        closedAt: '2026-04-07', webUrl: '', milestone: null, author: null,
        assignee: null, closedBy: null, rawBody: 'First paragraph of the body.',
      },
    ]);

    const cfg = { ...jiraConfig, description: 'extract' as const };
    const result = await collectIssues(client, 'mobile/app', currentTag, previousTag, [previousTag, currentTag], cfg);

    const issue = result.categorized['New Features'][0];
    expect(issue.jiraTickets).toEqual(['BUG-7']);
    expect(issue.description).toBe('First paragraph of the body.');
  });

  it('handles missing rawBody (treats as empty)', async () => {
    vi.mocked(client.listIssues).mockResolvedValue([
      {
        number: 1, title: 'Title only PROJ-3', labels: ['feature', 'MOBILE'],
        closedAt: '2026-04-07', webUrl: '', milestone: null, author: null,
        assignee: null, closedBy: null,
        // no rawBody field
      },
    ]);

    const result = await collectIssues(client, 'mobile/app', currentTag, previousTag, [previousTag, currentTag], jiraConfig);

    expect(result.categorized['New Features'][0].jiraTickets).toEqual(['PROJ-3']);
  });
});
