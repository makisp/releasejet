const PATTERN = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

function expandString(value: string): string {
  return value.replace(PATTERN, (_match, name: string) => process.env[name] ?? '');
}

export function expandEnvVars<T>(value: T): T {
  if (typeof value === 'string') {
    return expandString(value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => expandEnvVars(v)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = expandEnvVars(v);
    }
    return out as unknown as T;
  }
  return value;
}
