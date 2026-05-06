import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFile, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../../src/core/config.js';

let tmpDir: string;
let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'rj-config-'));
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(async () => {
  warnSpy.mockRestore();
  await rm(tmpDir, { recursive: true, force: true });
});

async function writeAndLoad(content: string) {
  const path = join(tmpDir, '.releasejet.yml');
  await writeFile(path, content, 'utf-8');
  return loadConfig(path);
}

describe('config warnings — AI egress', () => {
  it('warns and downgrades when description: ai is set without egress', async () => {
    const cfg = await writeAndLoad(
      [
        'provider:',
        '  type: github',
        '  url: https://github.com/o/r',
        'description: ai',
      ].join('\n'),
    );
    expect(cfg.description).toBe('none');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toMatch(/ai\.allowDataEgress/);
  });

  it('warns and ignores when aiSummary.enabled: true is set without egress', async () => {
    const cfg = await writeAndLoad(
      [
        'provider:',
        '  type: github',
        '  url: https://github.com/o/r',
        'aiSummary:',
        '  enabled: true',
      ].join('\n'),
    );
    expect(cfg.aiSummary).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('emits a single warning when both AI features are misconfigured together', async () => {
    await writeAndLoad(
      [
        'provider:',
        '  type: github',
        '  url: https://github.com/o/r',
        'description: ai',
        'aiSummary:',
        '  enabled: true',
      ].join('\n'),
    );
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('does not warn when egress is set without AI features', async () => {
    await writeAndLoad(
      [
        'provider:',
        '  type: github',
        '  url: https://github.com/o/r',
        'ai:',
        '  allowDataEgress: true',
      ].join('\n'),
    );
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('does not warn when AI features are set with egress', async () => {
    const cfg = await writeAndLoad(
      [
        'provider:',
        '  type: github',
        '  url: https://github.com/o/r',
        'description: ai',
        'aiSummary:',
        '  enabled: true',
        'ai:',
        '  allowDataEgress: true',
      ].join('\n'),
    );
    expect(warnSpy).not.toHaveBeenCalled();
    expect(cfg.description).toBe('ai');
    expect(cfg.aiSummary).toEqual({ enabled: true });
  });
});
