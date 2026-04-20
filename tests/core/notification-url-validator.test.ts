import { describe, it, expect } from 'vitest';
import { assertNoLiteralWebhookUrls } from '../../src/core/notification-url-validator.js';

describe('assertNoLiteralWebhookUrls', () => {
  it('passes when notifications is absent', () => {
    expect(() => assertNoLiteralWebhookUrls({})).not.toThrow();
  });

  it('passes when notifications is an empty array', () => {
    expect(() => assertNoLiteralWebhookUrls({ notifications: [] })).not.toThrow();
  });

  it('passes when webhookUrl is a ${VAR} reference', () => {
    expect(() =>
      assertNoLiteralWebhookUrls({
        notifications: [{ type: 'slack', enabled: true, webhookUrl: '${SLACK_WEBHOOK_URL}' }],
      }),
    ).not.toThrow();
  });

  it('rejects a literal Slack webhook URL', () => {
    expect(() =>
      assertNoLiteralWebhookUrls({
        notifications: [
          { type: 'slack', enabled: true, webhookUrl: 'https://hooks.slack.com/services/T00/B00/XYZ' },
        ],
      }),
    ).toThrowError(/notifications\[0\].webhookUrl contains a literal webhook URL/);
  });

  it('rejects a literal Discord webhook URL', () => {
    expect(() =>
      assertNoLiteralWebhookUrls({
        notifications: [
          { type: 'discord', enabled: true, webhookUrl: 'https://discord.com/api/webhooks/123/abc' },
        ],
      }),
    ).toThrowError(/webhook URLs are secrets/i);
  });

  it('rejects a discordapp.com alias', () => {
    expect(() =>
      assertNoLiteralWebhookUrls({
        notifications: [
          { type: 'discord', enabled: true, webhookUrl: 'https://discordapp.com/api/webhooks/123/abc' },
        ],
      }),
    ).toThrow();
  });

  it('rejects a Power Automate Workflow URL', () => {
    expect(() =>
      assertNoLiteralWebhookUrls({
        notifications: [
          {
            type: 'teams',
            enabled: true,
            webhookUrl: 'https://prod-05.westeurope.logic.azure.com:443/workflows/abc/triggers/manual/paths/invoke?api-version=2016-06-01',
          },
        ],
      }),
    ).toThrow();
  });

  it('rejects a legacy Office 365 connector URL with a deprecation hint', () => {
    expect(() =>
      assertNoLiteralWebhookUrls({
        notifications: [
          {
            type: 'teams',
            enabled: true,
            webhookUrl: 'https://outlook.office.com/webhook/abc/IncomingWebhook/xyz',
          },
        ],
      }),
    ).toThrowError(/Legacy connectors are being deprecated/);
  });

  it('rejects a webhook.office.com legacy connector URL', () => {
    expect(() =>
      assertNoLiteralWebhookUrls({
        notifications: [
          {
            type: 'teams',
            enabled: true,
            webhookUrl: 'https://example.webhook.office.com/webhookb2/abc',
          },
        ],
      }),
    ).toThrowError(/Legacy connectors are being deprecated/);
  });

  it('passes an unrelated literal URL through (runtime will reject if truly wrong)', () => {
    expect(() =>
      assertNoLiteralWebhookUrls({
        notifications: [
          { type: 'slack', enabled: true, webhookUrl: 'https://example.com/not-a-webhook' },
        ],
      }),
    ).not.toThrow();
  });

  it('reports the correct index in the error when the second entry is bad', () => {
    expect(() =>
      assertNoLiteralWebhookUrls({
        notifications: [
          { type: 'slack', enabled: true, webhookUrl: '${SLACK}' },
          { type: 'discord', enabled: true, webhookUrl: 'https://discord.com/api/webhooks/123/abc' },
        ],
      }),
    ).toThrowError(/notifications\[1\]/);
  });

  it('ignores entries that are not objects', () => {
    expect(() =>
      assertNoLiteralWebhookUrls({
        notifications: [null, 'not an object', 42],
      }),
    ).not.toThrow();
  });

  it('ignores non-string webhookUrl values (schema validation will reject them)', () => {
    expect(() =>
      assertNoLiteralWebhookUrls({
        notifications: [{ type: 'slack', enabled: true, webhookUrl: 123 }],
      }),
    ).not.toThrow();
  });
});
