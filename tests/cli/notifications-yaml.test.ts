import { describe, it, expect } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { appendNotificationEntry, readNotificationsRaw } from '../../src/cli/notifications-yaml.js';

describe('appendNotificationEntry', () => {
  it('creates a notifications block when the file is empty', () => {
    const out = appendNotificationEntry('', {
      type: 'slack',
      enabled: true,
      envVarName: 'SLACK_WEBHOOK_URL',
    });
    const parsed = parseYaml(out) as { notifications: unknown[] };
    expect(parsed.notifications).toEqual([
      { type: 'slack', enabled: true, webhookUrl: '${SLACK_WEBHOOK_URL}' },
    ]);
  });

  it('creates a notifications block when the file has unrelated keys only', () => {
    const src = 'tagFormat: "v{version}"\ncategories:\n  feature: Features\n';
    const out = appendNotificationEntry(src, {
      type: 'discord',
      enabled: false,
      envVarName: 'DISCORD_WEBHOOK_URL',
    });
    const parsed = parseYaml(out) as { tagFormat: string; categories: unknown; notifications: unknown[] };
    expect(parsed.tagFormat).toBe('v{version}');
    expect(parsed.notifications).toEqual([
      { type: 'discord', enabled: false, webhookUrl: '${DISCORD_WEBHOOK_URL}' },
    ]);
  });

  it('replaces a null notifications value with a sequence containing the new entry', () => {
    const src = 'notifications: null\n';
    const out = appendNotificationEntry(src, {
      type: 'teams',
      enabled: true,
      envVarName: 'TEAMS_WORKFLOW_URL',
    });
    const parsed = parseYaml(out) as { notifications: unknown[] };
    expect(parsed.notifications).toEqual([
      { type: 'teams', enabled: true, webhookUrl: '${TEAMS_WORKFLOW_URL}' },
    ]);
  });

  it('appends to an empty sequence', () => {
    const src = 'notifications: []\n';
    const out = appendNotificationEntry(src, {
      type: 'slack',
      enabled: true,
      envVarName: 'SLACK_WEBHOOK_URL',
    });
    const parsed = parseYaml(out) as { notifications: unknown[] };
    expect(parsed.notifications).toHaveLength(1);
  });
});

describe('readNotificationsRaw', () => {
  it('returns an empty array when the file has no notifications key', () => {
    expect(readNotificationsRaw('tagFormat: "v{version}"\n')).toEqual([]);
  });
});
