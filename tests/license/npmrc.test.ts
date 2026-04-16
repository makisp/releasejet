import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import {
  isNpmrcConfigured,
  writeNpmrcConfig,
  removeNpmrcConfig,
} from '../../src/license/npmrc.js';

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

const npmrcPath = join(homedir(), '.npmrc');

describe('isNpmrcConfigured', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns true when both releasejet lines exist', async () => {
    vi.mocked(readFile).mockResolvedValue(
      '@releasejet:registry=https://npm.releasejet.dev/\n//npm.releasejet.dev/:_authToken=rlj_abc\n',
    );
    expect(await isNpmrcConfigured()).toBe(true);
  });

  it('returns false when file does not exist', async () => {
    vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'));
    expect(await isNpmrcConfigured()).toBe(false);
  });

  it('returns false when file has no releasejet lines', async () => {
    vi.mocked(readFile).mockResolvedValue(
      '@fortawesome:registry=https://npm.fontawesome.com/\n',
    );
    expect(await isNpmrcConfigured()).toBe(false);
  });

  it('returns false when only registry line is present (no token)', async () => {
    vi.mocked(readFile).mockResolvedValue(
      '@releasejet:registry=https://npm.releasejet.dev/\n',
    );
    expect(await isNpmrcConfigured()).toBe(false);
  });

  it('returns false when only token line is present (no registry)', async () => {
    vi.mocked(readFile).mockResolvedValue(
      '//npm.releasejet.dev/:_authToken=rlj_abc\n',
    );
    expect(await isNpmrcConfigured()).toBe(false);
  });
});

describe('writeNpmrcConfig', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(writeFile).mockResolvedValue(undefined);
  });

  it('appends releasejet lines to existing npmrc', async () => {
    vi.mocked(readFile).mockResolvedValue('existing=content\n');

    await writeNpmrcConfig('rlj_testkey123');

    expect(writeFile).toHaveBeenCalledWith(
      npmrcPath,
      expect.stringContaining('existing=content'),
      'utf-8',
    );
    expect(writeFile).toHaveBeenCalledWith(
      npmrcPath,
      expect.stringContaining('@releasejet:registry=https://npm.releasejet.dev/'),
      'utf-8',
    );
    expect(writeFile).toHaveBeenCalledWith(
      npmrcPath,
      expect.stringContaining('//npm.releasejet.dev/:_authToken=rlj_testkey123'),
      'utf-8',
    );
  });

  it('creates npmrc when file does not exist', async () => {
    vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'));

    await writeNpmrcConfig('rlj_testkey123');

    expect(writeFile).toHaveBeenCalledWith(
      npmrcPath,
      expect.stringContaining('@releasejet:registry=https://npm.releasejet.dev/'),
      'utf-8',
    );
  });

  it('replaces existing releasejet token when already configured', async () => {
    vi.mocked(readFile).mockResolvedValue(
      '@releasejet:registry=https://npm.releasejet.dev/\n//npm.releasejet.dev/:_authToken=rlj_oldkey\n',
    );

    await writeNpmrcConfig('rlj_newkey456');

    const written = vi.mocked(writeFile).mock.calls[0][1] as string;
    expect(written).toContain('rlj_newkey456');
    expect(written).not.toContain('rlj_oldkey');
  });
});

describe('removeNpmrcConfig', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(writeFile).mockResolvedValue(undefined);
  });

  it('removes releasejet lines from npmrc', async () => {
    vi.mocked(readFile).mockResolvedValue(
      'other=line\n@releasejet:registry=https://npm.releasejet.dev/\n//npm.releasejet.dev/:_authToken=rlj_abc\nmore=stuff\n',
    );

    await removeNpmrcConfig();

    const written = vi.mocked(writeFile).mock.calls[0][1] as string;
    expect(written).toContain('other=line');
    expect(written).toContain('more=stuff');
    expect(written).not.toContain('@releasejet');
    expect(written).not.toContain('npm.releasejet.dev');
  });

  it('does nothing when file does not exist', async () => {
    vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'));

    await removeNpmrcConfig();

    expect(writeFile).not.toHaveBeenCalled();
  });
});
