import { describe, it, expect } from 'vitest';
import { parseConfig } from '../../src/core/config.schema.js';

function baseConfig(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    provider: { type: 'github', url: 'https://github.com/foo/bar' },
    categories: { feature: 'Features' },
    ...extra,
  };
}

describe('parseConfig — type: webhook', () => {
  it('accepts a minimal valid webhook channel', () => {
    const raw = baseConfig({
      notifications: [
        {
          type: 'webhook',
          enabled: true,
          url: 'https://example.com/hook',
          events: ['release.published'],
        },
      ],
    });
    const cfg = parseConfig(raw);
    expect(cfg.notifications).toHaveLength(1);
    const n = cfg.notifications![0];
    expect(n.type).toBe('webhook');
    if (n.type === 'webhook') {
      expect(n.events).toEqual(['release.published']);
      expect(n.enabled).toBe(true);
    }
  });

  it('accepts both events and custom headers', () => {
    const raw = baseConfig({
      notifications: [
        {
          type: 'webhook',
          enabled: true,
          url: 'https://example.com/hook',
          secret: '${MY_SECRET}',
          events: ['release.generated', 'release.published'],
          headers: {
            Authorization: 'Bearer ${MY_TOKEN}',
            'X-Tenant': 'acme',
          },
        },
      ],
    });
    const cfg = parseConfig(raw);
    const n = cfg.notifications![0];
    if (n.type === 'webhook') {
      expect(n.events).toEqual(['release.generated', 'release.published']);
      expect(n.headers).toEqual({
        Authorization: 'Bearer ${MY_TOKEN}',
        'X-Tenant': 'acme',
      });
    }
  });

  it('rejects missing events', () => {
    const raw = baseConfig({
      notifications: [
        { type: 'webhook', enabled: true, url: 'https://example.com/hook' },
      ],
    });
    expect(() => parseConfig(raw)).toThrow(/events.*required/i);
  });

  it('rejects empty events array', () => {
    const raw = baseConfig({
      notifications: [
        { type: 'webhook', enabled: true, url: 'https://example.com/hook', events: [] },
      ],
    });
    expect(() => parseConfig(raw)).toThrow(/events.*non-empty|at least one event/i);
  });

  it('rejects unknown event names with a helpful message', () => {
    const raw = baseConfig({
      notifications: [
        {
          type: 'webhook',
          enabled: true,
          url: 'https://example.com/hook',
          events: ['release.publised'], // typo
        },
      ],
    });
    expect(() => parseConfig(raw)).toThrow(/release\.publised|did you mean.*release\.published/i);
  });

  it('rejects template: on type: webhook', () => {
    const raw = baseConfig({
      notifications: [
        {
          type: 'webhook',
          enabled: true,
          url: 'https://example.com/hook',
          events: ['release.published'],
          template: 'My template',
        },
      ],
    });
    expect(() => parseConfig(raw)).toThrow(/template.*not supported.*type: webhook|template.*forbidden/i);
  });

  it('rejects reserved header keys', () => {
    const raw = baseConfig({
      notifications: [
        {
          type: 'webhook',
          enabled: true,
          url: 'https://example.com/hook',
          events: ['release.published'],
          headers: { 'X-ReleaseJet-Custom': 'bad' },
        },
      ],
    });
    expect(() => parseConfig(raw)).toThrow(/X-ReleaseJet-|reserved/);
  });

  it('rejects Content-Type override', () => {
    const raw = baseConfig({
      notifications: [
        {
          type: 'webhook',
          enabled: true,
          url: 'https://example.com/hook',
          events: ['release.published'],
          headers: { 'Content-Type': 'application/xml' },
        },
      ],
    });
    expect(() => parseConfig(raw)).toThrow(/Content-Type|reserved/i);
  });

  it('rejects literal Bearer JWT in header value', () => {
    const raw = baseConfig({
      notifications: [
        {
          type: 'webhook',
          enabled: true,
          url: 'https://example.com/hook',
          events: ['release.published'],
          headers: { Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig' },
        },
      ],
    });
    expect(() => parseConfig(raw)).toThrow(/move.*\$\{|env(?:ironment)? variable/i);
  });

  it('rejects non-http URL', () => {
    const raw = baseConfig({
      notifications: [
        {
          type: 'webhook',
          enabled: true,
          url: 'ftp://example.com/hook',
          events: ['release.published'],
        },
      ],
    });
    expect(() => parseConfig(raw)).toThrow(/http|https/);
  });

  it('allows localhost and private IPs (intentional)', () => {
    const raw = baseConfig({
      notifications: [
        {
          type: 'webhook',
          enabled: true,
          url: 'http://localhost:3000/webhook',
          events: ['release.published'],
        },
      ],
    });
    expect(() => parseConfig(raw)).not.toThrow();
  });

  it('coexists with M2 slack channels', () => {
    const raw = baseConfig({
      notifications: [
        { type: 'slack', enabled: true, webhookUrl: '${SLACK_URL}' },
        {
          type: 'webhook',
          enabled: true,
          url: 'https://example.com/hook',
          events: ['release.published'],
        },
      ],
    });
    const cfg = parseConfig(raw);
    expect(cfg.notifications).toHaveLength(2);
    expect(cfg.notifications![0].type).toBe('slack');
    expect(cfg.notifications![1].type).toBe('webhook');
  });

  it('rejects unknown type values with the full valid list', () => {
    const raw = baseConfig({
      notifications: [
        { type: 'pagerduty', enabled: true, url: 'https://example.com/hook' },
      ],
    });
    expect(() => parseConfig(raw)).toThrow(/slack.*discord.*teams.*webhook|webhook.*slack/);
  });
});
