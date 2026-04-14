import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReleaseJetPlugin, PluginContext } from '../../src/plugins/types.js';
import type { ReleaseJetConfig } from '../../src/types.js';

vi.mock('../../src/license/store.js', () => ({
  readLicense: vi.fn(),
}));
vi.mock('../../src/license/validator.js', () => ({
  verifyLicense: vi.fn(),
}));

import { readLicense } from '../../src/license/store.js';
import { verifyLicense } from '../../src/license/validator.js';
import { discoverPlugin, getPluginRuntime, resetPluginRuntime } from '../../src/plugins/loader.js';

// Minimal Commander mock with command lookup support
function createMockProgram() {
  const cmds: Array<{
    _name: string;
    name: () => string;
    option: ReturnType<typeof vi.fn>;
    description: ReturnType<typeof vi.fn>;
    action: ReturnType<typeof vi.fn>;
  }> = [];

  return {
    command: vi.fn((name: string) => {
      const cmd = {
        _name: name,
        name: () => name,
        description: vi.fn().mockReturnThis(),
        option: vi.fn().mockReturnThis(),
        action: vi.fn().mockReturnThis(),
      };
      cmds.push(cmd);
      return cmd;
    }),
    commands: cmds,
  };
}

const stubConfig: ReleaseJetConfig = {
  provider: { type: 'github', url: 'https://github.com' },
  source: 'issues',
  clients: [],
  categories: { feature: 'New Features', bug: 'Bug Fixes' },
  uncategorized: 'lenient',
};

function mockValidLicense() {
  vi.mocked(readLicense).mockResolvedValue({
    key: 'rlj_abcdefghijklmnopqrstuvwxyz012345',
    token: 'valid.jwt',
    expiresAt: '2026-05-13',
  });
  vi.mocked(verifyLicense).mockResolvedValue({
    valid: true,
    payload: {
      sub: 'org_abc',
      email: 'user@example.com',
      plan: 'pro',
      features: ['templates'],
      iat: 0,
      exp: 0,
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetPluginRuntime();
});

describe('Plugin integration', () => {
  it('end-to-end: plugin registers formatter, runtime exposes it', async () => {
    const program = createMockProgram();
    mockValidLicense();

    const mockPlugin: ReleaseJetPlugin = {
      name: '@releasejet/pro',
      version: '1.0.0',
      apiVersion: 1,
      register(ctx: PluginContext) {
        ctx.registerFormatter('compact', (data) => {
          return `# ${data.tagName}\n${data.totalCount} issues`;
        });
      },
    };

    await discoverPlugin(program as any, stubConfig, vi.fn(), async () => ({
      default: mockPlugin,
    }));

    const runtime = getPluginRuntime()!;

    expect(runtime.hasFormatter('compact')).toBe(true);
    expect(runtime.hasFormatter('detailed')).toBe(false);

    const result = runtime.runFormatter(
      'compact',
      {
        tagName: 'v1.0.0',
        version: '1.0.0',
        clientPrefix: null,
        date: '2026-04-13',
        milestone: null,
        projectUrl: 'https://github.com/owner/repo',
        issues: { categorized: {}, uncategorized: [] },
        totalCount: 5,
        uncategorizedCount: 0,
        contributors: [],
      },
      stubConfig,
    );

    expect(result).toBe('# v1.0.0\n5 issues');
  });

  it('end-to-end: plugin registers hook, runtime fires it', async () => {
    const program = createMockProgram();
    mockValidLicense();

    const hookCalls: string[] = [];

    const mockPlugin: ReleaseJetPlugin = {
      name: '@releasejet/pro',
      version: '1.0.0',
      apiVersion: 1,
      register(ctx: PluginContext) {
        ctx.hooks.afterPublish.on((payload) => {
          hookCalls.push(payload.tagName);
        });
      },
    };

    await discoverPlugin(program as any, stubConfig, vi.fn(), async () => ({
      default: mockPlugin,
    }));

    const runtime = getPluginRuntime()!;

    await runtime.hooks.afterPublish.run({
      tagName: 'v2.0.0',
      releaseName: 'v2.0.0',
      markdown: '## v2.0.0',
      projectUrl: 'https://github.com/owner/repo',
    });

    expect(hookCalls).toEqual(['v2.0.0']);
  });

  it('end-to-end: plugin uses extendCommand to add flags', async () => {
    const program = createMockProgram();
    // Pre-register a "generate" command so extendCommand can find it
    program.command('generate');
    mockValidLicense();

    const mockPlugin: ReleaseJetPlugin = {
      name: '@releasejet/pro',
      version: '1.0.0',
      apiVersion: 1,
      register(ctx: PluginContext) {
        ctx.extendCommand('generate', [
          { flags: '--custom-flag <value>', description: 'A custom flag' },
        ]);
      },
    };

    await discoverPlugin(program as any, stubConfig, vi.fn(), async () => ({
      default: mockPlugin,
    }));

    // Verify the flag was added to the generate command
    const genCmd = program.commands.find((c) => c.name() === 'generate');
    expect(genCmd?.option).toHaveBeenCalledWith(
      '--custom-flag <value>',
      'A custom flag',
      undefined,
    );
  });

  it('no plugin installed — runtime stays null', async () => {
    const program = createMockProgram();

    await discoverPlugin(program as any, stubConfig, vi.fn(), async () => {
      throw new Error('MODULE_NOT_FOUND');
    });

    expect(getPluginRuntime()).toBeNull();
  });
});
