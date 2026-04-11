import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLogger } from '../../src/cli/logger.js';

describe('createLogger', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('debug logs to stderr when enabled', () => {
    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { debug } = createLogger(true);

    debug('test message', { key: 'value' });

    expect(stderrSpy).toHaveBeenCalledWith('[DEBUG]', 'test message', { key: 'value' });
    stderrSpy.mockRestore();
  });

  it('debug is silent when disabled', () => {
    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { debug } = createLogger(false);

    debug('test message');

    expect(stderrSpy).not.toHaveBeenCalled();
    stderrSpy.mockRestore();
  });
});
