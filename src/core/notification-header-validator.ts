/**
 * Pre-expansion validation helpers for notifications[*].headers (M4).
 * Both functions are pure and best-effort — values that use ${VAR}
 * indirection won't be inspected; that's by design.
 */

const RESERVED_PREFIX = /^x-releasejet-/i;
const RESERVED_EXACT = new Set(['content-type']);

export function findReservedHeaderKeys(headers: Record<string, string>): string[] {
  const out: string[] = [];
  for (const key of Object.keys(headers)) {
    const lower = key.toLowerCase();
    if (RESERVED_PREFIX.test(lower) || RESERVED_EXACT.has(lower)) {
      out.push(key);
    }
  }
  return out;
}

export type LiteralTokenKind =
  | 'jwt-bearer'
  | 'slack-token'
  | 'github-pat'
  | 'github-classic-pat'
  | 'gitlab-pat'
  | 'openai-key';

interface TokenPattern {
  kind: LiteralTokenKind;
  regex: RegExp;
}

const PATTERNS: TokenPattern[] = [
  { kind: 'jwt-bearer', regex: /^Bearer\s+ey[A-Za-z0-9._-]{20,}$/ },
  { kind: 'slack-token', regex: /^xox[baprs]-/ },
  { kind: 'github-classic-pat', regex: /^ghp_[A-Za-z0-9]{20,}$/ },
  { kind: 'github-pat', regex: /^github_pat_[A-Za-z0-9_]{10,}$/ },
  { kind: 'gitlab-pat', regex: /^glpat-[A-Za-z0-9_-]{16,}$/ },
  { kind: 'openai-key', regex: /^sk-[A-Za-z0-9]{20,}$/ },
];

export interface LiteralTokenMatch {
  matched: boolean;
  kind?: LiteralTokenKind;
}

export function findLiteralTokenInHeaderValue(value: string): LiteralTokenMatch {
  if (typeof value !== 'string' || value.includes('${')) {
    return { matched: false };
  }
  for (const p of PATTERNS) {
    if (p.regex.test(value)) {
      return { matched: true, kind: p.kind };
    }
  }
  return { matched: false };
}
