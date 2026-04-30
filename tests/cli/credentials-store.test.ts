import { describe, it, expect } from 'vitest';
import { redactToken } from '../../src/cli/credentials-store.js';

describe('redactToken', () => {
  it('returns a fixed eight-bullet mask regardless of input length', () => {
    expect(redactToken('glpat-abc')).toBe('••••••••');
    expect(redactToken('ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).toBe('••••••••');
    expect(redactToken('x')).toBe('••••••••');
    expect(redactToken('')).toBe('••••••••');
  });
});
