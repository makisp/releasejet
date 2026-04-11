import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withErrorHandler } from '../../src/cli/error-handler.js';

describe('withErrorHandler', () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let originalArgv: string[];
  let originalExitCode: number | undefined;

  beforeEach(() => {
    stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    originalArgv = process.argv;
    originalExitCode = process.exitCode;
    process.exitCode = undefined;
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    process.argv = originalArgv;
    process.exitCode = originalExitCode;
  });

  it('calls the wrapped function normally on success', async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    const wrapped = withErrorHandler(fn);

    await wrapped('arg1', 'arg2');

    expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
    expect(process.exitCode).toBeUndefined();
  });

  it('prints error message and sets exit code on failure', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Something broke'));
    const wrapped = withErrorHandler(fn);
    process.argv = ['node', 'releasejet', 'generate'];

    await wrapped();

    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Something broke'));
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('--debug'));
    expect(process.exitCode).toBe(1);
  });

  it('does not show debug hint when --debug is present', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Something broke'));
    const wrapped = withErrorHandler(fn);
    process.argv = ['node', 'releasejet', 'generate', '--debug'];

    await wrapped();

    const allCalls = stderrSpy.mock.calls.map(c => c[0]).join('\n');
    expect(allCalls).not.toContain('Re-run with --debug');
    expect(process.exitCode).toBe(1);
  });

  it('prints stack trace when --debug is present', async () => {
    const error = new Error('Something broke');
    const fn = vi.fn().mockRejectedValue(error);
    const wrapped = withErrorHandler(fn);
    process.argv = ['node', 'releasejet', 'generate', '--debug'];

    await wrapped();

    const allCalls = stderrSpy.mock.calls.map(c => c[0]).join('\n');
    expect(allCalls).toContain(error.stack);
  });

  it('handles non-Error thrown values', async () => {
    const fn = vi.fn().mockRejectedValue('string error');
    const wrapped = withErrorHandler(fn);
    process.argv = ['node', 'releasejet', 'generate'];

    await wrapped();

    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('string error'));
    expect(process.exitCode).toBe(1);
  });
});
