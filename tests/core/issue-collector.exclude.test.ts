import { describe, it, expect, vi, beforeEach } from 'vitest';
import { collectIssues } from '../../src/core/issue-collector.js';
import type { ProviderClient } from '../../src/providers/types.js';
import type { TagInfo, ReleaseJetConfig } from '../../src/types.js';

function createMockClient(): ProviderClient {
  return {
    listTags: vi.fn(),
    listIssues: vi.fn().mockResolvedValue([]),
    listPullRequests: vi.fn().mockResolvedValue([]),
    createRelease: vi.fn(),
    listMilestones: vi.fn().mockResolvedValue([]),
  };
}

const baseConfig: ReleaseJetConfig = {
  provider: { type: 'gitlab', url: 'https://gitlab.example.com' },
  source: 'issues',
  clients: [],
  categories: {
    feature: 'New Features',
    bug: 'Bug Fixes',
  },
  uncategorized: 'lenient',
};

const currentTag: TagInfo = {
  raw: 'v1.0.0',
  prefix: null,
  version: '1.0.0',
  suffix: null,
  createdAt: '2026-04-08T10:00:00Z',
  commitDate: '2026-04-08T10:00:00Z',
  dateSource: 'commit',
};
const previousTag: TagInfo = {
  raw: 'v0.9.0',
  prefix: null,
  version: '0.9.0',
  suffix: null,
  createdAt: '2026-03-01T10:00:00Z',
  commitDate: '2026-03-01T10:00:00Z',
  dateSource: 'commit',
};

const allTags = [previousTag, currentTag];

describe('collectIssues — excludeLabels', () => {
  let client: ProviderClient;

  beforeEach(() => {
    client = createMockClient();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-09T00:00:00Z'));
  });

  it('drops issues whose labels intersect excludeLabels', async () => {
    vi.mocked(client.listIssues).mockResolvedValue([
      { number: 1, title: 'Feature', labels: ['feature'], closedAt: '2026-04-07', webUrl: '', milestone: null, author: null, assignee: null, closedBy: null },
      { number: 2, title: 'Refactor', labels: ['internal'], closedAt: '2026-04-07', webUrl: '', milestone: null, author: null, assignee: null, closedBy: null },
      { number: 3, title: 'Cleanup', labels: ['chore'], closedAt: '2026-04-07', webUrl: '', milestone: null, author: null, assignee: null, closedBy: null },
    ]);

    const config: ReleaseJetConfig = {
      ...baseConfig,
      excludeLabels: ['internal', 'chore'],
    };

    const result = await collectIssues(client, 'org/repo', currentTag, previousTag, allTags, config);

    expect(result.categorized['New Features']).toHaveLength(1);
    expect(result.categorized['New Features'][0].number).toBe(1);
    expect(result.uncategorized).toHaveLength(0);
    expect(result.excluded).toHaveLength(2);
    expect(result.excluded.map((i) => i.number).sort()).toEqual([2, 3]);
  });

  it('exclude wins on collision with a category label', async () => {
    vi.mocked(client.listIssues).mockResolvedValue([
      { number: 10, title: 'Feature + internal', labels: ['feature', 'internal'], closedAt: '2026-04-07', webUrl: '', milestone: null, author: null, assignee: null, closedBy: null },
    ]);

    const config: ReleaseJetConfig = { ...baseConfig, excludeLabels: ['internal'] };

    const result = await collectIssues(client, 'org/repo', currentTag, previousTag, allTags, config);

    expect(result.categorized['New Features']).toBeUndefined();
    expect(result.excluded).toHaveLength(1);
    expect(result.excluded[0].number).toBe(10);
  });

  it('returns empty excluded bucket when excludeLabels is omitted', async () => {
    vi.mocked(client.listIssues).mockResolvedValue([
      { number: 20, title: 'A', labels: ['feature'], closedAt: '2026-04-07', webUrl: '', milestone: null, author: null, assignee: null, closedBy: null },
    ]);

    const result = await collectIssues(client, 'org/repo', currentTag, previousTag, allTags, baseConfig);

    expect(result.excluded).toEqual([]);
    expect(result.categorized['New Features']).toHaveLength(1);
  });

  it('returns empty excluded bucket when excludeLabels is empty array', async () => {
    vi.mocked(client.listIssues).mockResolvedValue([
      { number: 30, title: 'A', labels: ['feature'], closedAt: '2026-04-07', webUrl: '', milestone: null, author: null, assignee: null, closedBy: null },
    ]);
    const config: ReleaseJetConfig = { ...baseConfig, excludeLabels: [] };

    const result = await collectIssues(client, 'org/repo', currentTag, previousTag, allTags, config);

    expect(result.excluded).toEqual([]);
  });

  it('handles excludeLabels listing labels no issue carries (no error)', async () => {
    vi.mocked(client.listIssues).mockResolvedValue([
      { number: 40, title: 'A', labels: ['feature'], closedAt: '2026-04-07', webUrl: '', milestone: null, author: null, assignee: null, closedBy: null },
    ]);
    const config: ReleaseJetConfig = { ...baseConfig, excludeLabels: ['nonexistent'] };

    const result = await collectIssues(client, 'org/repo', currentTag, previousTag, allTags, config);

    expect(result.excluded).toEqual([]);
    expect(result.categorized['New Features']).toHaveLength(1);
  });

  it('emits debug log for excluded issues', async () => {
    vi.mocked(client.listIssues).mockResolvedValue([
      { number: 50, title: 'Refactor X', labels: ['internal'], closedAt: '2026-04-07', webUrl: '', milestone: null, author: null, assignee: null, closedBy: null },
    ]);
    const debug = vi.fn();
    const config: ReleaseJetConfig = { ...baseConfig, excludeLabels: ['internal'] };

    await collectIssues(client, 'org/repo', currentTag, previousTag, allTags, config, debug);

    const allDebugLines = debug.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(allDebugLines).toMatch(/Excluded 1 issue\(s\) by excludeLabels filter/);
    expect(allDebugLines).toMatch(/#50 "Refactor X"/);
  });
});
