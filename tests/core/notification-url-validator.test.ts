import { describe, it, expect } from 'vitest';
import {
  assertNoLiteralWebhookUrls,
  assertNoCrossTypeLeakageInWebhookUrl,
} from '../../src/core/notification-url-validator.js';

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

describe('assertNoCrossTypeLeakageInWebhookUrl', () => {
  it('rejects a Slack incoming-webhook URL on type: webhook', () => {
    const raw = {
      notifications: [
        {
          type: 'webhook',
          enabled: true,
          url: 'https://hooks.slack.com/services/T01/B02/abc',
        },
      ],
    };
    expect(() => assertNoCrossTypeLeakageInWebhookUrl(raw)).toThrow(/type: slack/);
  });

  it('rejects a Discord webhook URL on type: webhook', () => {
    const raw = {
      notifications: [
        { type: 'webhook', enabled: true, url: 'https://discord.com/api/webhooks/123/abc' },
      ],
    };
    expect(() => assertNoCrossTypeLeakageInWebhookUrl(raw)).toThrow(/type: discord/);
  });

  it('rejects a Teams Power Automate URL on type: webhook', () => {
    const raw = {
      notifications: [
        {
          type: 'webhook',
          enabled: true,
          url: 'https://prod-12.westus.logic.azure.com/workflows/abc/triggers/manual',
        },
      ],
    };
    expect(() => assertNoCrossTypeLeakageInWebhookUrl(raw)).toThrow(/type: teams/);
  });

  it('passes ${VAR}-indirected url (best-effort: only literals are inspected)', () => {
    const raw = {
      notifications: [
        { type: 'webhook', enabled: true, url: '${MY_HOOK_URL}' },
      ],
    };
    expect(() => assertNoCrossTypeLeakageInWebhookUrl(raw)).not.toThrow();
  });

  it('passes legitimate arbitrary URLs', () => {
    const raw = {
      notifications: [
        { type: 'webhook', enabled: true, url: 'https://hooks.zapier.com/hooks/catch/123/abc' },
        { type: 'webhook', enabled: true, url: 'https://statuspage.acme.io/ingest' },
        { type: 'webhook', enabled: true, url: '${HOOK_URL}' },
      ],
    };
    expect(() => assertNoCrossTypeLeakageInWebhookUrl(raw)).not.toThrow();
  });

  it('does not check type: slack/discord/teams entries', () => {
    const raw = {
      notifications: [
        {
          type: 'slack',
          enabled: true,
          webhookUrl: 'https://hooks.slack.com/services/T01/B02/abc',
        },
      ],
    };
    expect(() => assertNoCrossTypeLeakageInWebhookUrl(raw)).not.toThrow();
  });
});
