import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ProviderClient } from '../../src/providers/types.js';
import type { ReleaseJetConfig } from '../../src/types.js';

vi.mock('../../src/core/config.js', () => ({
  loadConfig: vi.fn(),
}));
vi.mock('../../src/core/git.js', () => ({
  getRemoteUrl: vi.fn().mockReturnValue('git@gitlab.example.com:mobile/app.git'),
  resolveProjectInfo: vi.fn().mockReturnValue({ hostUrl: 'https://gitlab.example.com', projectPath: 'mobile/app' }),
}));
vi.mock('../../src/providers/factory.js', () => ({
  createClient: vi.fn(),
}));
vi.mock('../../src/cli/auth.js', () => ({
  resolveToken: vi.fn().mockResolvedValue('test-token'),
}));
vi.mock('../../src/cli/prompts.js', () => ({
  promptForUncategorized: vi.fn(),
}));
vi.mock('../../src/plugins/loader.js', () => ({
  getPluginRuntime: vi.fn().mockReturnValue(null),
}));
vi.mock('../../src/core/template-engine.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/template-engine.js')>();
  return {
    ...actual,
    renderCustomTemplate: vi.fn().mockReturnValue('# Custom template output'),
  };
});

import { loadConfig } from '../../src/core/config.js';
import { createClient } from '../../src/providers/factory.js';
import { resolveProjectInfo } from '../../src/core/git.js';
import { runGenerate } from '../../src/cli/commands/generate.js';
import { renderCustomTemplate } from '../../src/core/template-engine.js';

const mockConfig: ReleaseJetConfig = {
  provider: { type: 'gitlab', url: 'https://gitlab.example.com' },
  source: 'issues',
  clients: [{ prefix: 'mobile', label: 'MOBILE' }],
  categories: {
    feature: 'New Features',
    bug: 'Bug Fixes',
  },
  uncategorized: 'lenient',
};

function createMockClient(): ProviderClient {
  return {
    listTags: vi.fn().mockResolvedValue([
      { name: 'mobile-v0.1.16', createdAt: '2026-03-01T10:00:00Z' },
      { name: 'mobile-v0.1.17', createdAt: '2026-04-08T10:00:00Z' },
    ]),
    listIssues: vi.fn().mockResolvedValue([
      { number: 1, title: 'New feature', labels: ['feature', 'MOBILE'], closedAt: '2026-04-07', webUrl: '', milestone: null, author: null, assignee: null, closedBy: null },
    ]),
    listPullRequests: vi.fn().mockResolvedValue([]),
    createRelease: vi.fn().mockResolvedValue(undefined),
    listMilestones: vi.fn().mockResolvedValue([]),
  };
}

describe('runGenerate', () => {
  let mockClient: ProviderClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    vi.mocked(loadConfig).mockResolvedValue(mockConfig);
    vi.mocked(createClient).mockReturnValue(mockClient);
    vi.mocked(resolveProjectInfo).mockReturnValue({ hostUrl: 'https://gitlab.example.com', projectPath: 'mobile/app' });
  });

  it('generates markdown output to stdout', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runGenerate({
      tag: 'mobile-v0.1.17',
      publish: false,
      dryRun: false,
      format: 'markdown',
      config: '.releasejet.yml',
    });

    expect(consoleSpy).toHaveBeenCalled();
    const output = consoleSpy.mock.calls[0][0] as string;
    expect(output).toContain('# MOBILE v0.1.17');
    expect(output).toContain('New feature');
    consoleSpy.mockRestore();
  });

  it('publishes release when --publish is set', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await runGenerate({
      tag: 'mobile-v0.1.17',
      publish: true,
      dryRun: false,
      format: 'markdown',
      config: '.releasejet.yml',
    });

    expect(mockClient.createRelease).toHaveBeenCalledWith(
      'mobile/app',
      expect.objectContaining({
        tagName: 'mobile-v0.1.17',
        name: 'MOBILE v0.1.17',
      }),
    );
    vi.restoreAllMocks();
  });

  it('does not publish in dry-run mode', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await runGenerate({
      tag: 'mobile-v0.1.17',
      publish: true,
      dryRun: true,
      format: 'markdown',
      config: '.releasejet.yml',
    });

    expect(mockClient.createRelease).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('throws when tag is not found in remote', async () => {
    await expect(
      runGenerate({
        tag: 'mobile-v9.9.9',
        publish: false,
        dryRun: false,
        format: 'markdown',
        config: '.releasejet.yml',
      }),
    ).rejects.toThrow('not found');
  });

  it('writes markdown to file when --output is set', async () => {
    const outputPath = join(tmpdir(), `releasejet-test-${Date.now()}.md`);

    await runGenerate({
      tag: 'mobile-v0.1.17',
      publish: false,
      dryRun: false,
      format: 'markdown',
      output: outputPath,
      config: '.releasejet.yml',
    });

    const content = await readFile(outputPath, 'utf-8');
    expect(content).toContain('# MOBILE v0.1.17');
    expect(content).toContain('New feature');
    await unlink(outputPath);
  });

  it('writes JSON to file when --output and --format json are set', async () => {
    const outputPath = join(tmpdir(), `releasejet-test-${Date.now()}.json`);

    await runGenerate({
      tag: 'mobile-v0.1.17',
      publish: false,
      dryRun: false,
      format: 'json',
      output: outputPath,
      config: '.releasejet.yml',
    });

    const content = await readFile(outputPath, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.tagName).toBe('mobile-v0.1.17');
    expect(parsed.version).toBe('0.1.17');
    await unlink(outputPath);
  });

  it('uses --since tag as the previous tag', async () => {
    const client = createMockClient();
    (client.listTags as ReturnType<typeof vi.fn>).mockResolvedValue([
      { name: 'mobile-v0.1.15', createdAt: '2026-02-01T10:00:00Z' },
      { name: 'mobile-v0.1.16', createdAt: '2026-03-01T10:00:00Z' },
      { name: 'mobile-v0.1.17', createdAt: '2026-04-08T10:00:00Z' },
    ]);
    vi.mocked(createClient).mockReturnValue(client);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runGenerate({
      tag: 'mobile-v0.1.17',
      since: 'mobile-v0.1.15',
      publish: false,
      dryRun: false,
      format: 'markdown',
      config: '.releasejet.yml',
    });

    // Should use mobile-v0.1.15 as the starting point (not auto-detected mobile-v0.1.16)
    expect(client.listIssues).toHaveBeenCalledWith(
      'mobile/app',
      expect.objectContaining({ updatedAfter: '2026-02-01T10:00:00Z' }),
    );
    consoleSpy.mockRestore();
  });

  it('throws when --since tag is not found in remote', async () => {
    await expect(
      runGenerate({
        tag: 'mobile-v0.1.17',
        since: 'mobile-v0.0.1',
        publish: false,
        dryRun: false,
        format: 'markdown',
        config: '.releasejet.yml',
      }),
    ).rejects.toThrow('--since');
  });

  it('outputs JSON when format is json', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runGenerate({
      tag: 'mobile-v0.1.17',
      publish: false,
      dryRun: false,
      format: 'json',
      config: '.releasejet.yml',
    });

    const output = consoleSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(output);
    expect(parsed.tagName).toBe('mobile-v0.1.17');
    expect(parsed.version).toBe('0.1.17');
    consoleSpy.mockRestore();
  });

  it('uses plugin formatter when --template is provided', async () => {
    const { getPluginRuntime } = await import('../../src/plugins/loader.js');
    vi.mocked(getPluginRuntime).mockReturnValue({
      hasFormatter: (name: string) => name === 'compact',
      runFormatter: () => '## Custom compact output',
      hooks: {
        beforeFormat: { run: vi.fn() },
        afterPublish: { run: vi.fn() },
      },
    });

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runGenerate({
      tag: 'mobile-v0.1.17',
      publish: false,
      dryRun: false,
      format: 'markdown',
      template: 'compact',
      config: '.releasejet.yml',
    });

    expect(consoleSpy.mock.calls[0][0]).toBe('## Custom compact output');
    consoleSpy.mockRestore();
    vi.mocked(getPluginRuntime).mockReturnValue(null);
  });

  it('throws when --template is used but no plugin provides it', async () => {
    const { getPluginRuntime } = await import('../../src/plugins/loader.js');
    vi.mocked(getPluginRuntime).mockReturnValue(null);

    await expect(
      runGenerate({
        tag: 'mobile-v0.1.17',
        publish: false,
        dryRun: false,
        format: 'markdown',
        template: 'nonexistent',
        config: '.releasejet.yml',
      }),
    ).rejects.toThrow('Custom templates require @releasejet/pro');

    vi.mocked(getPluginRuntime).mockReturnValue(null);
  });

  it('fires beforeFormat hook before formatting', async () => {
    const beforeFormatRun = vi.fn();
    const { getPluginRuntime } = await import('../../src/plugins/loader.js');
    vi.mocked(getPluginRuntime).mockReturnValue({
      hasFormatter: () => false,
      runFormatter: () => '',
      hooks: {
        beforeFormat: { run: beforeFormatRun },
        afterPublish: { run: vi.fn() },
      },
    });

    vi.spyOn(console, 'log').mockImplementation(() => {});

    await runGenerate({
      tag: 'mobile-v0.1.17',
      publish: false,
      dryRun: false,
      format: 'markdown',
      config: '.releasejet.yml',
    });

    expect(beforeFormatRun).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tagName: 'mobile-v0.1.17' }),
      }),
    );

    vi.restoreAllMocks();
    vi.mocked(getPluginRuntime).mockReturnValue(null);
  });

  it('fires afterPublish hook after publishing', async () => {
    const afterPublishRun = vi.fn();
    const { getPluginRuntime } = await import('../../src/plugins/loader.js');
    vi.mocked(getPluginRuntime).mockReturnValue({
      hasFormatter: () => false,
      runFormatter: () => '',
      hooks: {
        beforeFormat: { run: vi.fn() },
        afterPublish: { run: afterPublishRun },
      },
    });

    vi.spyOn(console, 'log').mockImplementation(() => {});

    await runGenerate({
      tag: 'mobile-v0.1.17',
      publish: true,
      dryRun: false,
      format: 'markdown',
      config: '.releasejet.yml',
    });

    expect(afterPublishRun).toHaveBeenCalledWith(
      expect.objectContaining({
        tagName: 'mobile-v0.1.17',
        releaseName: 'MOBILE v0.1.17',
      }),
    );

    vi.restoreAllMocks();
    vi.mocked(getPluginRuntime).mockReturnValue(null);
  });

  describe('custom .hbs file path template', () => {
    it('routes .hbs file path to renderCustomTemplate when Pro is loaded', async () => {
      const { getPluginRuntime } = await import('../../src/plugins/loader.js');
      vi.mocked(getPluginRuntime).mockReturnValue({
        hasFormatter: vi.fn().mockReturnValue(false),
        runFormatter: vi.fn(),
        hooks: {
          beforeFormat: { run: vi.fn() },
          afterPublish: { run: vi.fn() },
        },
      });

      vi.spyOn(console, 'log').mockImplementation(() => {});

      await runGenerate({
        tag: 'mobile-v0.1.17',
        publish: false,
        dryRun: false,
        format: 'markdown',
        template: './my-template.hbs',
        config: '.releasejet.yml',
      });

      expect(renderCustomTemplate).toHaveBeenCalledWith(
        './my-template.hbs',
        expect.anything(),
        expect.anything(),
      );

      vi.restoreAllMocks();
      vi.mocked(getPluginRuntime).mockReturnValue(null);
    });

    it('throws error for .hbs file path when Pro is not loaded', async () => {
      const { getPluginRuntime } = await import('../../src/plugins/loader.js');
      vi.mocked(getPluginRuntime).mockReturnValue(null);

      await expect(
        runGenerate({
          tag: 'mobile-v0.1.17',
          publish: false,
          dryRun: false,
          format: 'markdown',
          template: './my-template.hbs',
          config: '.releasejet.yml',
        }),
      ).rejects.toThrow('Custom templates require @releasejet/pro');
    });
  });
});
