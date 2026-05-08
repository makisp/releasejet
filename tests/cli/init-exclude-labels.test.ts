import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parse as parseYaml } from 'yaml';

vi.mock('@inquirer/prompts', () => ({
  input: vi.fn(),
  confirm: vi.fn(),
  select: vi.fn(),
}));
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../src/core/git.js', () => ({
  getRemoteUrl: vi.fn().mockReturnValue('git@github.com:org/app.git'),
  resolveHostUrl: vi.fn().mockReturnValue('https://github.com'),
  detectProviderFromRemote: vi.fn().mockReturnValue('github'),
}));

import { input, confirm, select } from '@inquirer/prompts';
import { writeFile, readFile } from 'node:fs/promises';
import { runInit } from '../../src/cli/commands/init.js';

function lastWrittenYaml(): string {
  const call = vi.mocked(writeFile).mock.calls.find((c) => c[0] === '.releasejet.yml');
  if (!call) throw new Error('.releasejet.yml not written');
  return call[1] as string;
}

describe('runInit — excludeLabels prompt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.mocked(readFile).mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
  });

  function setBasicMocks() {
    vi.mocked(select)
      .mockResolvedValueOnce('github')      // provider
      .mockResolvedValueOnce('issues')      // source (GitHub branch)
      .mockResolvedValueOnce('v{version}')  // tag format
      .mockResolvedValueOnce('lenient')     // uncategorized
      .mockResolvedValueOnce('defaults');   // categories mode
    vi.mocked(input)
      .mockResolvedValueOnce('https://github.com'); // provider URL
  }

  it('emits commented-out placeholder when user declines', async () => {
    setBasicMocks();
    vi.mocked(input).mockResolvedValueOnce(''); // token (empty)
    vi.mocked(confirm)
      .mockResolvedValueOnce(false) // multi-client
      .mockResolvedValueOnce(false) // contributors
      .mockResolvedValueOnce(false) // excludeLabels — declines
      .mockResolvedValueOnce(false) // jira
      .mockResolvedValueOnce(false); // CI setup

    await runInit();

    const yaml = lastWrittenYaml();
    expect(yaml).toContain('# excludeLabels: [internal, chore]');
    expect(yaml).not.toMatch(/^excludeLabels:/m);
  });

  it('writes default labels when user accepts and presses enter', async () => {
    setBasicMocks();
    vi.mocked(input)
      .mockResolvedValueOnce('internal,chore') // excludeLabels input (user accepts default)
      .mockResolvedValueOnce('');              // token
    vi.mocked(confirm)
      .mockResolvedValueOnce(false) // multi-client
      .mockResolvedValueOnce(false) // contributors
      .mockResolvedValueOnce(true)  // excludeLabels — accepts
      .mockResolvedValueOnce(false) // jira
      .mockResolvedValueOnce(false); // CI setup

    await runInit();

    const yaml = lastWrittenYaml();
    const parsed = parseYaml(yaml);
    expect(parsed.excludeLabels).toEqual(['internal', 'chore']);
  });

  it('writes custom labels and dedupes/whitespace-trims', async () => {
    setBasicMocks();
    vi.mocked(input)
      .mockResolvedValueOnce('  internal , chore , internal , wip  ') // user typed
      .mockResolvedValueOnce('');                                     // token
    vi.mocked(confirm)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false);

    await runInit();

    const yaml = lastWrittenYaml();
    const parsed = parseYaml(yaml);
    expect(parsed.excludeLabels).toEqual(['internal', 'chore', 'wip']);
  });

  it('treats empty input as no labels (commented-out placeholder)', async () => {
    setBasicMocks();
    vi.mocked(input)
      .mockResolvedValueOnce('   ,  ,   ') // user typed only whitespace/commas
      .mockResolvedValueOnce('');           // token
    vi.mocked(confirm)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false);

    await runInit();

    const yaml = lastWrittenYaml();
    expect(yaml).toContain('# excludeLabels: [internal, chore]');
    expect(yaml).not.toMatch(/^excludeLabels:/m);
  });
});
