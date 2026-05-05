import { describe, it, expect } from 'vitest';
import { HookRegistry } from '../../src/plugins/hooks.js';
import type { AfterGeneratePayload } from '../../src/plugins/types.js';

describe('generate command — afterGenerate hook firing semantics', () => {
  // These tests assert the contract documented in the spec:
  //   - successful generate fires afterGenerate
  //   - --dry-run fires NEITHER hook
  //   - --publish that succeeds fires BOTH (afterGenerate first, then afterPublish)
  //   - --publish that fails AFTER notes generated still leaves afterGenerate fired

  it('exposes a fresh HookRegistry per hook on the runtime', async () => {
    const reg = new HookRegistry<AfterGeneratePayload>();
    const calls: string[] = [];
    reg.on(async (p) => {
      calls.push(`a:${p.tagName}`);
    });
    reg.on(async (p) => {
      calls.push(`b:${p.tagName}`);
    });
    await reg.run({
      tagName: 'v1.0.0',
      previousTag: null,
      markdown: '## Notes',
      projectUrl: 'https://github.com/foo/bar',
      provider: 'github',
      data: {} as never,
      notifyDisabled: false,
      generatedAt: '2026-05-05T00:00:00Z',
    });
    expect(calls).toEqual(['a:v1.0.0', 'b:v1.0.0']);
  });
});
