import { describe, it, expect } from 'vitest';
import { PLUGIN_API_VERSION } from '../../src/plugins/types.js';

describe('PLUGIN_API_VERSION', () => {
  it('stays at 1 — adding hooks is additive and must not bump the version', () => {
    expect(PLUGIN_API_VERSION).toBe(1);
  });
});
