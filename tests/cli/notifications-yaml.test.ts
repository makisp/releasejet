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

  it('appends to an existing sequence and preserves the prior entry', () => {
    const src =
      'notifications:\n' +
      '  - type: slack\n' +
      '    enabled: true\n' +
      '    webhookUrl: ${SLACK_WEBHOOK_URL}\n';
    const out = appendNotificationEntry(src, {
      type: 'discord',
      enabled: false,
      envVarName: 'DISCORD_WEBHOOK_URL',
    });
    const parsed = parseYaml(out) as { notifications: unknown[] };
    expect(parsed.notifications).toEqual([
      { type: 'slack', enabled: true, webhookUrl: '${SLACK_WEBHOOK_URL}' },
      { type: 'discord', enabled: false, webhookUrl: '${DISCORD_WEBHOOK_URL}' },
    ]);
  });

  it('preserves a top-of-file comment', () => {
    const src =
      '# ReleaseJet config — keep this comment\n' +
      'tagFormat: "v{version}"\n';
    const out = appendNotificationEntry(src, {
      type: 'slack',
      enabled: true,
      envVarName: 'SLACK_WEBHOOK_URL',
    });
    expect(out).toContain('# ReleaseJet config — keep this comment');
  });

  it('preserves a between-section comment', () => {
    const src =
      'tagFormat: "v{version}"\n' +
      '\n' +
      '# Categories block — do not delete\n' +
      'categories:\n' +
      '  feature: Features\n';
    const out = appendNotificationEntry(src, {
      type: 'teams',
      enabled: true,
      envVarName: 'TEAMS_WORKFLOW_URL',
    });
    expect(out).toContain('# Categories block — do not delete');
    expect(out).toContain('feature: Features');
  });

  it('preserves a commented-out notifications example block above a real block', () => {
    const src =
      '# notifications:\n' +
      '#   - type: slack\n' +
      '#     enabled: true\n' +
      '#     webhookUrl: ${SLACK_WEBHOOK_URL}\n';
    const out = appendNotificationEntry(src, {
      type: 'slack',
      enabled: true,
      envVarName: 'SLACK_WEBHOOK_URL',
    });
    // The commented example must still be present verbatim.
    expect(out).toContain('# notifications:');
    // A live notifications block is created (parsed YAML has it).
    const parsed = parseYaml(out) as { notifications: unknown[] };
    expect(parsed.notifications).toHaveLength(1);
  });

  it('round-trips through loadConfig cleanly', async () => {
    const { writeFile, mkdtemp, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { loadConfig } = await import('../../src/core/config.js');
    const dir = await mkdtemp(join(tmpdir(), 'rjm2b-'));
    const path = join(dir, '.releasejet.yml');
    try {
      const src =
        'provider:\n  type: github\n  url: https://github.com\n' +
        'categories:\n  feature: Features\n';
      const out = appendNotificationEntry(src, {
        type: 'slack',
        enabled: true,
        envVarName: 'SLACK_WEBHOOK_URL',
      });
      await writeFile(path, out, 'utf-8');
      const cfg = await loadConfig(path);
      expect(cfg.notifications?.[0].type).toBe('slack');
      expect(cfg.notifications?.[0].enabled).toBe(true);
      // env var unset → expansion yields ''.
      expect(cfg.notifications?.[0].webhookUrl).toBe('');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('readNotificationsRaw', () => {
  it('returns an empty array when the file has no notifications key', () => {
    expect(readNotificationsRaw('tagFormat: "v{version}"\n')).toEqual([]);
  });

  it('reads a happy-path entry verbatim (no env expansion)', () => {
    const src =
      'notifications:\n' +
      '  - type: slack\n' +
      '    enabled: true\n' +
      '    webhookUrl: ${SLACK_WEBHOOK_URL}\n' +
      '    template: ":rocket: hi"\n';
    const rows = readNotificationsRaw(src);
    expect(rows).toEqual([
      { type: 'slack', enabled: true, webhookUrl: '${SLACK_WEBHOOK_URL}', template: ':rocket: hi' },
    ]);
  });

  it('does not throw on partially-malformed entries', () => {
    const src =
      'notifications:\n' +
      '  - type: slack\n' +
      '    enabled: "yes"\n' +     // wrong type — coerce to false
      '    webhookUrl: 12345\n' +  // wrong type — coerce to ""
      '  - type: 99\n' +           // wrong type — coerce to ""
      '    enabled: true\n' +
      '    webhookUrl: ${X}\n';
    const rows = readNotificationsRaw(src);
    expect(rows).toEqual([
      { type: 'slack', enabled: false, webhookUrl: '', template: undefined },
      { type: '', enabled: true, webhookUrl: '${X}', template: undefined },
    ]);
  });
});
