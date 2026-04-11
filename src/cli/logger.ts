export function createLogger(enabled: boolean) {
  return {
    debug: enabled
      ? (...args: unknown[]) => console.error('[DEBUG]', ...args)
      : (() => {}) as (...args: unknown[]) => void,
  };
}
