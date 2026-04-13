import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReleaseJetConfig } from '../../src/types.js';
import type { ReleaseJetPlugin } from '../../src/plugins/types.js';

vi.mock('../../src/license/store.js', () => ({
  readLicense: vi.fn(),
}));

vi.mock('../../src/license/validator.js', () => ({
  verifyLicense: vi.fn(),
}));

import { readLicense } from '../../src/license/store.js';
import { verifyLicense } from '../../src/license/validator.js';
import { discoverPlugin, getPluginRuntime, resetPluginRuntime } from '../../src/plugins/loader.js';

// Minimal Commander mock
function createMockProgram() {
  const commands: Array<{ name: () => string; option: ReturnType<typeof vi.fn> }> = [];
  return {
    command: vi.fn((name: string) => {
      const cmd = {
        name: () => name,
        description: vi.fn().mockReturnThis(),
        option: vi.fn().mockReturnThis(),
        action: vi.fn().mockReturnThis(),
      };
      commands.push(cmd);
      return cmd;
    }),
    commands,
  };
}

const stubConfig: ReleaseJetConfig = {
  provider: { type: 'github', url: 'https://github.com' },
  source: 'issues',
  clients: [],
  categories: { feature: 'Features' },
  uncategorized: 'lenient',
};

function createMockPlugin(overrides?: Partial<ReleaseJetPlugin>): ReleaseJetPlugin {
  return {
    name: '@releasejet/pro',
    version: '1.0.0',
    apiVersion: 1,
    register: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetPluginRuntime();
});

describe('discoverPlugin', () => {
  it('returns null and sets no runtime when plugin is not installed', async () => {
    const program = createMockProgram();

    await discoverPlugin(program as any, stubConfig, vi.fn(), async () => {
      throw new Error('MODULE_NOT_FOUND');
    });

    expect(getPluginRuntime()).toBeNull();
  });

  it('warns and returns null when plugin has invalid shape', async () => {
    const program = createMockProgram();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await discoverPlugin(program as any, stubConfig, vi.fn(), async () => ({
      default: { notAPlugin: true },
    }));

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('invalid plugin format'),
    );
    expect(getPluginRuntime()).toBeNull();
    warnSpy.mockRestore();
  });

  it('warns and returns null when apiVersion does not match', async () => {
    const program = createMockProgram();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const plugin = createMockPlugin({ apiVersion: 999 });

    await discoverPlugin(program as any, stubConfig, vi.fn(), async () => ({
      default: plugin,
    }));

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('plugin API v999'),
    );
    expect(getPluginRuntime()).toBeNull();
    warnSpy.mockRestore();
  });

  it('warns and returns null when no license is stored', async () => {
    const program = createMockProgram();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const plugin = createMockPlugin();

    vi.mocked(readLicense).mockResolvedValue(null);

    await discoverPlugin(program as any, stubConfig, vi.fn(), async () => ({
      default: plugin,
    }));

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('no license activated'),
    );
    expect(getPluginRuntime()).toBeNull();
    warnSpy.mockRestore();
  });

  it('warns and returns null when license is expired', async () => {
    const program = createMockProgram();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const plugin = createMockPlugin();

    vi.mocked(readLicense).mockResolvedValue({
      key: 'rlj_abc',
      token: 'expired.jwt',
      expiresAt: '2026-01-01',
    });
    vi.mocked(verifyLicense).mockResolvedValue({ valid: false, reason: 'expired' });

    await discoverPlugin(program as any, stubConfig, vi.fn(), async () => ({
      default: plugin,
    }));

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('expired'),
    );
    expect(getPluginRuntime()).toBeNull();
    warnSpy.mockRestore();
  });

  it('warns and returns null when license signature is invalid', async () => {
    const program = createMockProgram();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const plugin = createMockPlugin();

    vi.mocked(readLicense).mockResolvedValue({
      key: 'rlj_abc',
      token: 'bad.jwt',
      expiresAt: '2026-05-13',
    });
    vi.mocked(verifyLicense).mockResolvedValue({ valid: false, reason: 'invalid-key' });

    await discoverPlugin(program as any, stubConfig, vi.fn(), async () => ({
      default: plugin,
    }));

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('invalid'),
    );
    expect(getPluginRuntime()).toBeNull();
    warnSpy.mockRestore();
  });

  it('calls plugin.register and sets plugin runtime on success', async () => {
    const program = createMockProgram();
    const plugin = createMockPlugin();

    vi.mocked(readLicense).mockResolvedValue({
      key: 'rlj_abc',
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

    await discoverPlugin(program as any, stubConfig, vi.fn(), async () => ({
      default: plugin,
    }));

    expect(plugin.register).toHaveBeenCalledWith(
      expect.objectContaining({
        registerFormatter: expect.any(Function),
        registerCommand: expect.any(Function),
        extendCommand: expect.any(Function),
        hooks: expect.objectContaining({
          beforeFormat: expect.any(Object),
          afterPublish: expect.any(Object),
        }),
      }),
    );
    expect(getPluginRuntime()).not.toBeNull();
  });

  it('plugin runtime exposes formatters registered during register()', async () => {
    const program = createMockProgram();
    const plugin = createMockPlugin({
      register: (ctx) => {
        ctx.registerFormatter('compact', () => '## Compact');
      },
    });

    vi.mocked(readLicense).mockResolvedValue({
      key: 'rlj_abc',
      token: 'valid.jwt',
      expiresAt: '2026-05-13',
    });
    vi.mocked(verifyLicense).mockResolvedValue({
      valid: true,
      payload: { sub: 'org_abc', email: 'u@e.com', plan: 'pro', features: ['templates'], iat: 0, exp: 0 },
    });

    await discoverPlugin(program as any, stubConfig, vi.fn(), async () => ({
      default: plugin,
    }));

    const runtime = getPluginRuntime()!;
    expect(runtime.hasFormatter('compact')).toBe(true);
    expect(runtime.hasFormatter('nonexistent')).toBe(false);
  });
});
