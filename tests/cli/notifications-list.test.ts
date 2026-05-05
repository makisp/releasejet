import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));
vi.mock('../../src/license/detect.js', () => ({
  hasActivePro: vi.fn(),
}));

import { readFile } from 'node:fs/promises';
import { hasActivePro } from '../../src/license/detect.js';
import { runList } from '../../src/cli/commands/notifications.js';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(hasActivePro).mockResolvedValue(true);
});

describe('runList — empty / missing', () => {
  it('throws a friendly error when the config file is missing', async () => {
    vi.mocked(readFile).mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    await expect(runList()).rejects.toThrow(/No \.releasejet\.yml found/);
  });

  it('prints the empty-state hint when there are no entries', async () => {
    vi.mocked(readFile).mockResolvedValue('tagFormat: "v{version}"\n' as never);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runList();
    const out = log.mock.calls.map((c) => String(c[0])).join('\n');
    log.mockRestore();
    expect(out).toMatch(/No notification channels configured/);
    expect(out).toMatch(/releasejet notifications add/);
    expect(out).not.toMatch(/notifications require @releasejet\/pro/); // empty state has no soft-warn
  });

  it('treats an empty notifications array as the empty state', async () => {
    vi.mocked(readFile).mockResolvedValue('notifications: []\n' as never);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runList();
    const out = log.mock.calls.map((c) => String(c[0])).join('\n');
    log.mockRestore();
    expect(out).toMatch(/No notification channels configured/);
  });
});

describe('runList — table rendering', () => {
  const SRC =
    'notifications:\n' +
    '  - type: slack\n' +
    '    enabled: true\n' +
    '    webhookUrl: ${SLACK_WEBHOOK_URL}\n' +
    '  - type: discord\n' +
    '    enabled: false\n' +
    '    webhookUrl: ${DISCORD_WEBHOOK_URL}\n' +
    '    template: ":rocket: hi"\n' +
    '  - type: teams\n' +
    '    enabled: true\n' +
    '    webhookUrl: ${TEAMS_WORKFLOW_URL}\n';

  const ORIGINAL = { ...process.env };

  beforeEach(() => {
    process.env = { ...ORIGINAL };
  });

  it('renders the # / TYPE / ENABLED / WEBHOOK / TEMPLATE / ENV columns and resolves env state', async () => {
    process.env.SLACK_WEBHOOK_URL = 'https://example.invalid/hook';
    delete process.env.DISCORD_WEBHOOK_URL;
    process.env.TEAMS_WORKFLOW_URL = 'https://example.invalid/teams';

    vi.mocked(readFile).mockResolvedValue(SRC as never);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runList();
    const out = log.mock.calls.map((c) => String(c[0])).join('\n');
    log.mockRestore();

    expect(out).toMatch(/#\s+TYPE\s+ENABLED\s+WEBHOOK\s+TEMPLATE\s+ENV/);
    expect(out).toMatch(/1\s+slack\s+yes\s+\$\{SLACK_WEBHOOK_URL\}\s+—\s+set/);
    expect(out).toMatch(/2\s+discord\s+no\s+\$\{DISCORD_WEBHOOK_URL\}\s+custom\s+unset/);
    expect(out).toMatch(/3\s+teams\s+yes\s+\$\{TEAMS_WORKFLOW_URL\}\s+—\s+set/);
  });

  it('shows n/a for ENV when webhookUrl is not a clean ${NAME} reference', async () => {
    vi.mocked(readFile).mockResolvedValue(
      'notifications:\n  - type: slack\n    enabled: true\n    webhookUrl: "garbled-text"\n' as never,
    );
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runList();
    const out = log.mock.calls.map((c) => String(c[0])).join('\n');
    log.mockRestore();
    expect(out).toMatch(/n\/a/);
  });

  it('treats empty-string env values as unset', async () => {
    process.env.SLACK_WEBHOOK_URL = '';
    vi.mocked(readFile).mockResolvedValue(
      'notifications:\n  - type: slack\n    enabled: true\n    webhookUrl: ${SLACK_WEBHOOK_URL}\n' as never,
    );
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runList();
    const out = log.mock.calls.map((c) => String(c[0])).join('\n');
    log.mockRestore();
    expect(out).toMatch(/unset/);
  });

  it('truncates long webhook strings to 40 chars with an ellipsis', async () => {
    const longRef = '${' + 'X'.repeat(60) + '}'; // 63 chars total
    vi.mocked(readFile).mockResolvedValue(
      `notifications:\n  - type: slack\n    enabled: true\n    webhookUrl: "${longRef}"\n` as never,
    );
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runList();
    const out = log.mock.calls.map((c) => String(c[0])).join('\n');
    log.mockRestore();
    // Truncated to 40 chars: 39 chars of original + "…".
    expect(out).toMatch(/\$\{X{37}…/);
    expect(out).not.toMatch(/X{60}/);
  });

  it('prints the soft-warn line when channels are configured and no Pro is active', async () => {
    vi.mocked(hasActivePro).mockResolvedValue(false);
    vi.mocked(readFile).mockResolvedValue(SRC as never);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runList();
    const out = log.mock.calls.map((c) => String(c[0])).join('\n');
    log.mockRestore();
    expect(out).toMatch(/notifications require @releasejet\/pro/);
  });

  it('omits the soft-warn line when Pro is active', async () => {
    vi.mocked(hasActivePro).mockResolvedValue(true);
    vi.mocked(readFile).mockResolvedValue(SRC as never);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runList();
    const out = log.mock.calls.map((c) => String(c[0])).join('\n');
    log.mockRestore();
    expect(out).not.toMatch(/notifications require @releasejet\/pro/);
  });
});
