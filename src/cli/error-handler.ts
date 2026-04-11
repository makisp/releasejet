export function withErrorHandler<T extends unknown[]>(
  fn: (...args: T) => Promise<void>,
): (...args: T) => Promise<void> {
  return async (...args: T) => {
    try {
      await fn(...args);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isDebug = process.argv.includes('--debug');

      console.error(`\nError: ${message}`);

      if (isDebug && err instanceof Error && err.stack) {
        console.error(`\n${err.stack}`);
      } else if (!isDebug) {
        console.error('\n  Re-run with --debug for more details.');
      }

      process.exitCode = 1;
    }
  };
}
