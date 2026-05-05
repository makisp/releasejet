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
