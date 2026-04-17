import { describe, it, expect, vi, beforeEach } from 'vitest';
import { collectIssues, detectMilestone } from '../../src/core/issue-collector.js';
import type { ProviderClient } from '../../src/providers/types.js';
import type { TagInfo, ReleaseJetConfig, CategorizedIssues } from '../../src/types.js';

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
    vi.mocked(client.listIssues).mockResolvedValue([
      { number:1, title: 'In range', labels: ['feature', 'MOBILE'], closedAt: '2026-03-15T00:00:00Z', webUrl: '', milestone: null, author: null, assignee: null, closedBy: null },
      { number:2, title: 'Too old', labels: ['bug', 'MOBILE'], closedAt: '2026-02-15T00:00:00Z', webUrl: '', milestone: null, author: null, assignee: null, closedBy: null },
      { number:3, title: 'Too new', labels: ['bug', 'MOBILE'], closedAt: '2026-05-01T00:00:00Z', webUrl: '', milestone: null, author: null, assignee: null, closedBy: null },
    ]);

    const result = await collectIssues(client, 'mobile/app', currentTag, previousTag, [previousTag, currentTag], config);

    const allIssues = [...Object.values(result.categorized).flat(), ...result.uncategorized];
    expect(allIssues).toHaveLength(1);
    expect(allIssues[0].number).toBe(1);
  });

  it('includes issues closed before current tag when no previous tag', async () => {
    vi.mocked(client.listIssues).mockResolvedValue([
      { number:1, title: 'Old issue', labels: ['feature', 'MOBILE'], closedAt: '2026-01-01T00:00:00Z', webUrl: '', milestone: null, author: null, assignee: null, closedBy: null },
      { number:2, title: 'Recent issue', labels: ['bug', 'MOBILE'], closedAt: '2026-04-07T00:00:00Z', webUrl: '', milestone: null, author: null, assignee: null, closedBy: null },
      { number:3, title: 'Future issue', labels: ['bug', 'MOBILE'], closedAt: '2026-05-01T00:00:00Z', webUrl: '', milestone: null, author: null, assignee: null, closedBy: null },
    ]);

    const result = await collectIssues(client, 'mobile/app', currentTag, null, [currentTag], config);

    const allIssues = [...Object.values(result.categorized).flat(), ...result.uncategorized];
    expect(allIssues).toHaveLength(2);
    expect(allIssues.map(i => i.number)).toEqual([1, 2]);
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
