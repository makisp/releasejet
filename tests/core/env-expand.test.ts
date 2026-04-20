import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { expandEnvVars } from '../../src/core/env-expand.js';

describe('expandEnvVars', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    for (const k of Object.keys(process.env)) {
      if (k.startsWith('RJTEST_')) delete process.env[k];
    }
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('returns primitives unchanged', () => {
    expect(expandEnvVars(42)).toBe(42);
    expect(expandEnvVars(true)).toBe(true);
    expect(expandEnvVars(null)).toBe(null);
    expect(expandEnvVars(undefined)).toBe(undefined);
  });

  it('returns strings without ${...} unchanged', () => {
    expect(expandEnvVars('plain string')).toBe('plain string');
    expect(expandEnvVars('https://example.com/path')).toBe('https://example.com/path');
  });

  it('expands a single ${VAR} when set', () => {
    process.env.RJTEST_FOO = 'hello';
    expect(expandEnvVars('${RJTEST_FOO}')).toBe('hello');
  });

  it('expands to empty string when the env var is unset', () => {
    expect(expandEnvVars('${RJTEST_MISSING}')).toBe('');
  });

  it('expands multiple references in one string', () => {
    process.env.RJTEST_A = 'one';
    process.env.RJTEST_B = 'two';
    expect(expandEnvVars('${RJTEST_A}-${RJTEST_B}')).toBe('one-two');
  });

  it('leaves malformed ${ sequences untouched', () => {
    expect(expandEnvVars('${}')).toBe('${}');
    expect(expandEnvVars('${RJTEST_A')).toBe('${RJTEST_A');
    expect(expandEnvVars('$RJTEST_A')).toBe('$RJTEST_A');
  });

  it('does not recognise ${VAR:-default} form', () => {
    process.env.RJTEST_FOO = 'set';
    // Not a valid variable name (contains ':-'), treated as literal.
    expect(expandEnvVars('${RJTEST_FOO:-fallback}')).toBe('${RJTEST_FOO:-fallback}');
  });

  it('traverses nested objects', () => {
    process.env.RJTEST_TOKEN = 'secret123';
    const input = { auth: { token: '${RJTEST_TOKEN}' }, plain: 'unchanged' };
    expect(expandEnvVars(input)).toEqual({
      auth: { token: 'secret123' },
      plain: 'unchanged',
    });
  });

  it('traverses arrays', () => {
    process.env.RJTEST_X = 'X';
    process.env.RJTEST_Y = 'Y';
    const input = ['${RJTEST_X}', 'plain', '${RJTEST_Y}'];
    expect(expandEnvVars(input)).toEqual(['X', 'plain', 'Y']);
  });

  it('handles array of objects (notifications shape)', () => {
    process.env.RJTEST_SLACK = 'https://hooks.slack.com/abc';
    process.env.RJTEST_DISCORD = 'https://discord.com/api/webhooks/xyz';
    const input = {
      notifications: [
        { type: 'slack', enabled: true, webhookUrl: '${RJTEST_SLACK}' },
        { type: 'discord', enabled: false, webhookUrl: '${RJTEST_DISCORD}' },
      ],
    };
    expect(expandEnvVars(input)).toEqual({
      notifications: [
        { type: 'slack', enabled: true, webhookUrl: 'https://hooks.slack.com/abc' },
        { type: 'discord', enabled: false, webhookUrl: 'https://discord.com/api/webhooks/xyz' },
      ],
    });
  });

  it('does not mutate the input', () => {
    process.env.RJTEST_V = 'value';
    const input = { a: '${RJTEST_V}' };
    const output = expandEnvVars(input);
    expect(input.a).toBe('${RJTEST_V}');
    expect(output).not.toBe(input);
  });
});
