import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@inquirer/prompts', () => ({
  input: vi.fn(),
}));
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
}));

import { input } from '@inquirer/prompts';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { runCiEnable, runCiDisable } from '../../src/cli/commands/ci.js';
import { CI_MARKER_START, CI_MARKER_END } from '../../src/core/ci.js';

describe('runCiEnable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('creates .gitlab-ci.yml when file does not exist', async () => {
    const enoent = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    vi.mocked(readFile).mockRejectedValueOnce(enoent);
    vi.mocked(input).mockResolvedValueOnce('');

    await runCiEnable({});

    expect(writeFile).toHaveBeenCalledWith(
      '.gitlab-ci.yml',
      expect.stringContaining(CI_MARKER_START),
    );
    expect(writeFile).toHaveBeenCalledWith(
      '.gitlab-ci.yml',
      expect.stringContaining('- short-duration'),
    );
  });

  it('appends to existing .gitlab-ci.yml without markers', async () => {
    vi.mocked(readFile).mockResolvedValueOnce('stages:\n  - build\n');
    vi.mocked(input).mockResolvedValueOnce('');

    await runCiEnable({});

    const written = vi.mocked(writeFile).mock.calls[0][1] as string;
    expect(written).toMatch(/^stages:/);
    expect(written).toContain(CI_MARKER_START);
  });

  it('skips prompt when --tags flag is provided', async () => {
    const enoent = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    vi.mocked(readFile).mockRejectedValueOnce(enoent);

    await runCiEnable({ tags: 'docker,gpu' });

    expect(input).not.toHaveBeenCalled();
    const written = vi.mocked(writeFile).mock.calls[0][1] as string;
    expect(written).toContain('- docker');
    expect(written).toContain('- gpu');
  });

  it('prints message when already enabled', async () => {
    const existing = `${CI_MARKER_START}\nstuff\n${CI_MARKER_END}\n`;
    vi.mocked(readFile).mockResolvedValueOnce(existing);

    await runCiEnable({});

    expect(writeFile).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith('ReleaseJet CI is already enabled.');
  });

  it('uses custom tags from prompt input', async () => {
    const enoent = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    vi.mocked(readFile).mockRejectedValueOnce(enoent);
    vi.mocked(input).mockResolvedValueOnce('my-runner, fast-lane');

    await runCiEnable({});

    const written = vi.mocked(writeFile).mock.calls[0][1] as string;
    expect(written).toContain('- my-runner');
    expect(written).toContain('- fast-lane');
  });
});

describe('runCiDisable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('removes marker block and keeps other config', async () => {
    const block = `${CI_MARKER_START}\ninclude:\n  - project: 'tools/releasejet'\n${CI_MARKER_END}`;
    vi.mocked(readFile).mockResolvedValueOnce(`stages:\n  - build\n\n${block}\n`);

    await runCiDisable();

    expect(writeFile).toHaveBeenCalledWith(
      '.gitlab-ci.yml',
      expect.stringContaining('stages:'),
    );
    expect(unlink).not.toHaveBeenCalled();
  });

  it('deletes file when only marker block remains', async () => {
    const block = `${CI_MARKER_START}\ninclude:\n  - project: 'tools/releasejet'\n${CI_MARKER_END}\n`;
    vi.mocked(readFile).mockResolvedValueOnce(block);

    await runCiDisable();

    expect(unlink).toHaveBeenCalledWith('.gitlab-ci.yml');
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('prints message when file does not exist', async () => {
    const enoent = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    vi.mocked(readFile).mockRejectedValueOnce(enoent);

    await runCiDisable();

    expect(console.log).toHaveBeenCalledWith('ReleaseJet CI is not configured.');
    expect(writeFile).not.toHaveBeenCalled();
    expect(unlink).not.toHaveBeenCalled();
  });

  it('prints message when no markers found in existing file', async () => {
    vi.mocked(readFile).mockResolvedValueOnce('stages:\n  - build\n');

    await runCiDisable();

    expect(console.log).toHaveBeenCalledWith('ReleaseJet CI is not configured.');
    expect(writeFile).not.toHaveBeenCalled();
    expect(unlink).not.toHaveBeenCalled();
  });
});
