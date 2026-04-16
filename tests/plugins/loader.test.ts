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

  it('auto-activates Pro license from RELEASEJET_PRO_TOKEN when no local credentials exist', async () => {
    const savedToken = process.env.RELEASEJET_PRO_TOKEN;
    process.env.RELEASEJET_PRO_TOKEN = 'rlj_abcdefghijklmnopqrstuvwxyz123456';

    try {
      const program = createMockProgram();
      const plugin = createMockPlugin();

      vi.mocked(readLicense).mockResolvedValue(null);

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ token: 'jwt.from.api', expiresAt: '2026-12-31' }),
      } as Response);

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

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/activate'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ key: 'rlj_abcdefghijklmnopqrstuvwxyz123456' }),
        }),
      );
      expect(verifyLicense).toHaveBeenCalledWith('jwt.from.api');
      expect(plugin.register).toHaveBeenCalled();
      expect(getPluginRuntime()).not.toBeNull();

      fetchSpy.mockRestore();
    } finally {
      if (savedToken === undefined) {
        delete process.env.RELEASEJET_PRO_TOKEN;
      } else {
        process.env.RELEASEJET_PRO_TOKEN = savedToken;
      }
    }
  });

  it('throws on invalid RELEASEJET_PRO_TOKEN format', async () => {
    const savedToken = process.env.RELEASEJET_PRO_TOKEN;
    process.env.RELEASEJET_PRO_TOKEN = 'bad-key-format';

    try {
      const program = createMockProgram();
      const plugin = createMockPlugin();

      vi.mocked(readLicense).mockResolvedValue(null);

      await expect(
        discoverPlugin(program as any, stubConfig, vi.fn(), async () => ({
          default: plugin,
        })),
      ).rejects.toThrow('invalid license key format');
    } finally {
      if (savedToken === undefined) {
        delete process.env.RELEASEJET_PRO_TOKEN;
      } else {
        process.env.RELEASEJET_PRO_TOKEN = savedToken;
      }
    }
  });

  it('throws on API 401 (invalid key) during auto-activation', async () => {
    const savedToken = process.env.RELEASEJET_PRO_TOKEN;
    process.env.RELEASEJET_PRO_TOKEN = 'rlj_abcdefghijklmnopqrstuvwxyz123456';

    try {
      const program = createMockProgram();
      const plugin = createMockPlugin();

      vi.mocked(readLicense).mockResolvedValue(null);

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 401,
      } as Response);

      await expect(
        discoverPlugin(program as any, stubConfig, vi.fn(), async () => ({
          default: plugin,
        })),
      ).rejects.toThrow('invalid license key');

      fetchSpy.mockRestore();
    } finally {
      if (savedToken === undefined) {
        delete process.env.RELEASEJET_PRO_TOKEN;
      } else {
        process.env.RELEASEJET_PRO_TOKEN = savedToken;
      }
    }
  });

  it('throws on API 402 (subscription expired) during auto-activation', async () => {
    const savedToken = process.env.RELEASEJET_PRO_TOKEN;
    process.env.RELEASEJET_PRO_TOKEN = 'rlj_abcdefghijklmnopqrstuvwxyz123456';

    try {
      const program = createMockProgram();
      const plugin = createMockPlugin();

      vi.mocked(readLicense).mockResolvedValue(null);

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 402,
      } as Response);

      await expect(
        discoverPlugin(program as any, stubConfig, vi.fn(), async () => ({
          default: plugin,
        })),
      ).rejects.toThrow('subscription expired');

      fetchSpy.mockRestore();
    } finally {
      if (savedToken === undefined) {
        delete process.env.RELEASEJET_PRO_TOKEN;
      } else {
        process.env.RELEASEJET_PRO_TOKEN = savedToken;
      }
    }
  });

  it('throws on network failure during auto-activation', async () => {
    const savedToken = process.env.RELEASEJET_PRO_TOKEN;
    process.env.RELEASEJET_PRO_TOKEN = 'rlj_abcdefghijklmnopqrstuvwxyz123456';

    try {
      const program = createMockProgram();
      const plugin = createMockPlugin();

      vi.mocked(readLicense).mockResolvedValue(null);

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(
        new Error('ECONNREFUSED'),
      );

      await expect(
        discoverPlugin(program as any, stubConfig, vi.fn(), async () => ({
          default: plugin,
        })),
      ).rejects.toThrow('could not reach license server');

      fetchSpy.mockRestore();
    } finally {
      if (savedToken === undefined) {
        delete process.env.RELEASEJET_PRO_TOKEN;
      } else {
        process.env.RELEASEJET_PRO_TOKEN = savedToken;
      }
    }
  });

  it('local credentials take precedence over RELEASEJET_PRO_TOKEN env var', async () => {
    const savedToken = process.env.RELEASEJET_PRO_TOKEN;
    process.env.RELEASEJET_PRO_TOKEN = 'rlj_abcdefghijklmnopqrstuvwxyz123456';

    try {
      const program = createMockProgram();
      const plugin = createMockPlugin();

      vi.mocked(readLicense).mockResolvedValue({
        key: 'rlj_local',
        token: 'local.jwt.token',
        expiresAt: '2026-12-31',
      });

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ token: 'should.not.be.used', expiresAt: '2026-12-31' }),
      } as Response);

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

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(verifyLicense).toHaveBeenCalledWith('local.jwt.token');
      expect(getPluginRuntime()).not.toBeNull();

      fetchSpy.mockRestore();
    } finally {
      if (savedToken === undefined) {
        delete process.env.RELEASEJET_PRO_TOKEN;
      } else {
        process.env.RELEASEJET_PRO_TOKEN = savedToken;
      }
    }
  });

  it('does not call API when plugin is not installed even if RELEASEJET_PRO_TOKEN is set', async () => {
    const savedToken = process.env.RELEASEJET_PRO_TOKEN;
    process.env.RELEASEJET_PRO_TOKEN = 'rlj_abcdefghijklmnopqrstuvwxyz123456';

    try {
      const program = createMockProgram();

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ token: 'should.not.be.used', expiresAt: '2026-12-31' }),
      } as Response);

      await discoverPlugin(program as any, stubConfig, vi.fn(), async () => {
        throw new Error('MODULE_NOT_FOUND');
      });

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(getPluginRuntime()).toBeNull();

      fetchSpy.mockRestore();
    } finally {
      if (savedToken === undefined) {
        delete process.env.RELEASEJET_PRO_TOKEN;
      } else {
        process.env.RELEASEJET_PRO_TOKEN = savedToken;
      }
    }
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
