import { vi, type Mock } from 'vitest';
import { loadConfig } from '../../src/core/config.js';
import { createClient } from '../../src/providers/factory.js';
import { resolveProjectInfo } from '../../src/core/git.js';
import { runGenerate } from '../../src/cli/commands/generate.js';
import type { AfterPublishPayload } from '../../src/plugins/types.js';
import type { ProviderClient } from '../../src/providers/types.js';
import type { ReleaseJetConfig } from '../../src/types.js';

/**
 * Base config used by generate-* payload tests. Callers can override fields
 * via `configOverrides` to `runGenerateAndCaptureAfterPublish`.
 */
export const baseGenerateConfig: ReleaseJetConfig = {
  provider: { type: 'github', url: 'https://github.com' },
  source: 'issues',
  clients: [],
  categories: { feature: 'Features', bug: 'Fixes' },
  uncategorized: 'lenient',
};

/**
 * Build a default ProviderClient stub that returns a minimal two-tag history
 * and one categorised issue — enough for `runGenerate` to reach the
 * afterPublish.emit(...) call on a happy path.
 */
export function makeGenerateClient(): ProviderClient {
  return {
    listTags: vi.fn().mockResolvedValue([
      { name: 'v1.0.0', createdAt: '2026-01-01T00:00:00Z', commitDate: '2026-01-01T00:00:00Z', dateSource: 'annotated' as const },
      { name: 'v1.1.0', createdAt: '2026-02-01T00:00:00Z', commitDate: '2026-02-01T00:00:00Z', dateSource: 'annotated' as const },
    ]),
    listIssues: vi.fn().mockResolvedValue([
      { number: 1, title: 'Ship', labels: ['feature'], closedAt: '2026-01-15', webUrl: '', milestone: null, author: null, assignee: null, closedBy: null },
    ]),
    listPullRequests: vi.fn().mockResolvedValue([]),
    createRelease: vi.fn().mockResolvedValue(undefined),
    listMilestones: vi.fn().mockResolvedValue([]),
  };
}

function splitProjectUrl(projectUrl: string): { hostUrl: string; projectPath: string } {
  if (!projectUrl) return { hostUrl: '', projectPath: '' };
  try {
    const parsed = new URL(projectUrl);
    const path = parsed.pathname.replace(/^\/+/, '').replace(/\/+$/, '');
    return { hostUrl: parsed.origin, projectPath: path };
  } catch {
    return { hostUrl: '', projectPath: '' };
  }
}

export interface CaptureAfterPublishOptions {
  /** Overrides merged into {@link baseGenerateConfig}. */
  configOverrides?: Partial<ReleaseJetConfig>;
  /** The `data.projectUrl` the pipeline should produce. */
  projectUrl: string;
  /**
   * The hoisted vi.fn() that backs `pluginRuntime.hooks.afterPublish.run` in
   * the calling test file. The helper reads `mock.calls[0][0]` to return the
   * emitted payload.
   */
  afterPublishRun: Mock;
}

/**
 * Runs `runGenerate` with `--publish` enabled and returns the
 * `AfterPublishPayload` passed to the afterPublish hook.
 *
 * Assumes the caller has already set up the module mocks at the top of the
 * test file (see `generate-notifications-payload.test.ts` for the canonical
 * mock setup). The caller is responsible for `vi.clearAllMocks()` between
 * tests.
 */
export async function runGenerateAndCaptureAfterPublish(
  options: CaptureAfterPublishOptions,
): Promise<AfterPublishPayload> {
  const { configOverrides = {}, projectUrl, afterPublishRun } = options;
  const { hostUrl, projectPath } = splitProjectUrl(projectUrl);

  vi.mocked(loadConfig).mockResolvedValue({
    ...baseGenerateConfig,
    ...configOverrides,
    provider: {
      ...baseGenerateConfig.provider,
      ...(configOverrides.provider ?? {}),
      url: hostUrl,
    },
  });
  vi.mocked(createClient).mockReturnValue(makeGenerateClient());
  vi.mocked(resolveProjectInfo).mockReturnValue({ hostUrl, projectPath });

  await runGenerate({
    tag: 'v1.1.0',
    publish: true,
    dryRun: false,
    format: 'markdown',
    config: '.releasejet.yml',
    notify: true,
  } as never);

  if (afterPublishRun.mock.calls.length === 0) {
    throw new Error('afterPublish.run was not invoked by runGenerate');
  }
  return afterPublishRun.mock.calls[0][0] as AfterPublishPayload;
}
