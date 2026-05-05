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
