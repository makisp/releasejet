import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@inquirer/prompts', () => ({
  select: vi.fn(),
  input: vi.fn(),
  confirm: vi.fn(),
}));
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../src/license/detect.js', () => ({
  hasActivePro: vi.fn(),
}));

import { select, input, confirm } from '@inquirer/prompts';
import { readFile, writeFile } from 'node:fs/promises';
import { hasActivePro } from '../../src/license/detect.js';
import { parse as parseYaml } from 'yaml';
import { runAdd } from '../../src/cli/commands/notifications.js';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(hasActivePro).mockResolvedValue(true);
});

describe('runAdd — interactive happy path', () => {
  it('appends a slack entry with the selected env var', async () => {
    vi.mocked(readFile).mockResolvedValue('tagFormat: "v{version}"\n' as never);
    vi.mocked(select).mockResolvedValueOnce('slack'); // type
    vi.mocked(input).mockResolvedValueOnce('SLACK_WEBHOOK_URL'); // env
    vi.mocked(confirm).mockResolvedValueOnce(true); // enabled

    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runAdd({});
    log.mockRestore();

    const writeCall = vi.mocked(writeFile).mock.calls.find((c) => c[0] === '.releasejet.yml');
    expect(writeCall).toBeDefined();
    const written = parseYaml(writeCall![1] as string) as { notifications: unknown[] };
    expect(written.notifications).toEqual([
      { type: 'slack', enabled: true, webhookUrl: '${SLACK_WEBHOOK_URL}' },
    ]);
  });

  it('exits with a friendly error when .releasejet.yml is missing', async () => {
    vi.mocked(readFile).mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    await expect(runAdd({})).rejects.toThrow(/No \.releasejet\.yml found/);
    expect(writeFile).not.toHaveBeenCalled();
  });
});

describe('runAdd — interactive validation', () => {
  it('re-prompts when the user pastes a literal Slack webhook URL', async () => {
    vi.mocked(readFile).mockResolvedValue('' as never);
    vi.mocked(select).mockResolvedValueOnce('slack');
    vi.mocked(input)
      .mockResolvedValueOnce('https://hooks.slack.com/services/T/B/secret') // bad
      .mockResolvedValueOnce('SLACK_WEBHOOK_URL');                          // good
    vi.mocked(confirm).mockResolvedValueOnce(true);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});

    await runAdd({});

    log.mockRestore();
    err.mockRestore();
    expect(input).toHaveBeenCalledTimes(2);
    const writeCall = vi.mocked(writeFile).mock.calls.find((c) => c[0] === '.releasejet.yml');
    expect((writeCall![1] as string)).toContain('${SLACK_WEBHOOK_URL}');
  });

  it('re-prompts when the user types an invalid env var name', async () => {
    vi.mocked(readFile).mockResolvedValue('' as never);
    vi.mocked(select).mockResolvedValueOnce('discord');
    vi.mocked(input)
      .mockResolvedValueOnce('1BAD-name')              // fails regex
      .mockResolvedValueOnce('DISCORD_WEBHOOK_URL');   // good
    vi.mocked(confirm).mockResolvedValueOnce(true);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});

    await runAdd({});

    log.mockRestore();
    err.mockRestore();
    expect(input).toHaveBeenCalledTimes(2);
  });
});

describe('runAdd — duplicate env-var detection (interactive)', () => {
  it('warns and proceeds when the user confirms', async () => {
    vi.mocked(readFile).mockResolvedValue(
      'notifications:\n  - type: slack\n    enabled: true\n    webhookUrl: ${SLACK_WEBHOOK_URL}\n' as never,
    );
    vi.mocked(select).mockResolvedValueOnce('slack');
    vi.mocked(input).mockResolvedValueOnce('SLACK_WEBHOOK_URL');
    vi.mocked(confirm)
      .mockResolvedValueOnce(true)  // duplicate confirm
      .mockResolvedValueOnce(true); // enabled

    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runAdd({});
    log.mockRestore();

    const writeCall = vi.mocked(writeFile).mock.calls.find((c) => c[0] === '.releasejet.yml');
    const written = parseYaml(writeCall![1] as string) as { notifications: unknown[] };
    expect(written.notifications).toHaveLength(2);
  });

  it('aborts cleanly when the user declines the duplicate confirm', async () => {
    vi.mocked(readFile).mockResolvedValue(
      'notifications:\n  - type: slack\n    enabled: true\n    webhookUrl: ${SLACK_WEBHOOK_URL}\n' as never,
    );
    vi.mocked(select).mockResolvedValueOnce('slack');
    vi.mocked(input).mockResolvedValueOnce('SLACK_WEBHOOK_URL');
    vi.mocked(confirm).mockResolvedValueOnce(false); // duplicate confirm — no

    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runAdd({});
    log.mockRestore();

    expect(writeFile).not.toHaveBeenCalled();
  });
});

describe('runAdd — flag mode', () => {
  it('skips all prompts when --type and --env are both supplied', async () => {
    vi.mocked(readFile).mockResolvedValue('' as never);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runAdd({ type: 'slack', env: 'SLACK_WEBHOOK_URL', enabled: true });
    log.mockRestore();

    expect(select).not.toHaveBeenCalled();
    expect(input).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
    const writeCall = vi.mocked(writeFile).mock.calls.find((c) => c[0] === '.releasejet.yml');
    const written = parseYaml(writeCall![1] as string) as { notifications: unknown[] };
    expect(written.notifications).toEqual([
      { type: 'slack', enabled: true, webhookUrl: '${SLACK_WEBHOOK_URL}' },
    ]);
  });

  it('honors --disabled in flag mode', async () => {
    vi.mocked(readFile).mockResolvedValue('' as never);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runAdd({ type: 'discord', env: 'DISCORD_WEBHOOK_URL', disabled: true });
    log.mockRestore();
    const writeCall = vi.mocked(writeFile).mock.calls.find((c) => c[0] === '.releasejet.yml');
    const written = parseYaml(writeCall![1] as string) as { notifications: { enabled: boolean }[] };
    expect(written.notifications[0].enabled).toBe(false);
  });

  it('rejects an invalid --type', async () => {
    vi.mocked(readFile).mockResolvedValue('' as never);
    await expect(runAdd({ type: 'irc', env: 'X' })).rejects.toThrow(/--type must be one of/);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('rejects a literal URL on --env in flag mode', async () => {
    vi.mocked(readFile).mockResolvedValue('' as never);
    await expect(
      runAdd({ type: 'slack', env: 'https://hooks.slack.com/services/T/B/secret' }),
    ).rejects.toThrow(/secrets/i);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('rejects an invalid env name in flag mode', async () => {
    vi.mocked(readFile).mockResolvedValue('' as never);
    await expect(runAdd({ type: 'slack', env: '1BAD' })).rejects.toThrow(/[A-Za-z_]/);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('exits non-zero on duplicate env-var without --force', async () => {
    vi.mocked(readFile).mockResolvedValue(
      'notifications:\n  - type: slack\n    enabled: true\n    webhookUrl: ${SLACK_WEBHOOK_URL}\n' as never,
    );
    await expect(
      runAdd({ type: 'slack', env: 'SLACK_WEBHOOK_URL' }),
    ).rejects.toThrow(/already used/i);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('proceeds on duplicate env-var when --force is passed', async () => {
    vi.mocked(readFile).mockResolvedValue(
      'notifications:\n  - type: slack\n    enabled: true\n    webhookUrl: ${SLACK_WEBHOOK_URL}\n' as never,
    );
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runAdd({ type: 'slack', env: 'SLACK_WEBHOOK_URL', force: true });
    log.mockRestore();
    const writeCall = vi.mocked(writeFile).mock.calls.find((c) => c[0] === '.releasejet.yml');
    const written = parseYaml(writeCall![1] as string) as { notifications: unknown[] };
    expect(written.notifications).toHaveLength(2);
  });

  it('falls through to interactive when only --type is supplied', async () => {
    vi.mocked(readFile).mockResolvedValue('' as never);
    vi.mocked(select).mockResolvedValueOnce('discord'); // type prompt still runs (but with --type as default)
    vi.mocked(input).mockResolvedValueOnce('DISCORD_WEBHOOK_URL');
    vi.mocked(confirm).mockResolvedValueOnce(true);

    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runAdd({ type: 'discord' });
    log.mockRestore();

    expect(select).toHaveBeenCalled();
    expect(input).toHaveBeenCalled();
  });
});

describe('runAdd — Pro soft-warn', () => {
  it('prints the soft-warn line when no Pro is active', async () => {
    vi.mocked(hasActivePro).mockResolvedValue(false);
    vi.mocked(readFile).mockResolvedValue('' as never);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runAdd({ type: 'slack', env: 'SLACK_WEBHOOK_URL', enabled: true });
    const out = log.mock.calls.map((c) => String(c[0])).join('\n');
    log.mockRestore();
    expect(out).toMatch(/notifications require @releasejet\/pro/);
  });

  it('omits the soft-warn line when Pro is active', async () => {
    vi.mocked(hasActivePro).mockResolvedValue(true);
    vi.mocked(readFile).mockResolvedValue('' as never);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runAdd({ type: 'slack', env: 'SLACK_WEBHOOK_URL', enabled: true });
    const out = log.mock.calls.map((c) => String(c[0])).join('\n');
    log.mockRestore();
    expect(out).not.toMatch(/notifications require @releasejet\/pro/);
  });
});
