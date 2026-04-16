import { describe, it, expect, vi, beforeEach } from 'vitest';
import { stringify as stringifyYaml } from 'yaml';

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
  getRemoteUrl: vi.fn().mockReturnValue('git@gitlab.example.com:mobile/app.git'),
  resolveHostUrl: vi.fn().mockReturnValue('https://gitlab.example.com'),
  detectProviderFromRemote: vi.fn().mockReturnValue('gitlab'),
}));

import { input, confirm, select } from '@inquirer/prompts';
import { readFile, writeFile } from 'node:fs/promises';
import { runInit } from '../../src/cli/commands/init.js';

const DEFAULT_CATEGORIES = {
  feature: 'New Features',
  bug: 'Bug Fixes',
  improvement: 'Improvements',
  'breaking-change': 'Breaking Changes',
};

function parseWrittenYaml(): Record<string, unknown> {
  const call = vi.mocked(writeFile).mock.calls.find(
    (c) => c[0] === '.releasejet.yml',
  );
  if (!call) throw new Error('.releasejet.yml was not written');
  return JSON.parse(JSON.stringify(
    // parse the YAML string that was written
    require('yaml').parse(call[1] as string),
  ));
}

describe('runInit — category step', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    // Default: no .gitlab-ci.yml and CI setup declined
    vi.mocked(readFile).mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
  });

  it('writes default categories when user selects "defaults"', async () => {
    // select calls: (1) provider=gitlab, (2) tag format, (3) uncategorized, (4) category mode
    vi.mocked(select)
      .mockResolvedValueOnce('gitlab')
      .mockResolvedValueOnce('v{version}')
      .mockResolvedValueOnce('lenient')
      .mockResolvedValueOnce('defaults');
    // input calls: (1) provider URL, (2) token
    vi.mocked(input)
      .mockResolvedValueOnce('https://gitlab.example.com')
      .mockResolvedValueOnce('test-token');
    // confirm calls: (1) multi-client? -> false, (2) contributors -> false, (3) CI setup -> false
    vi.mocked(confirm).mockResolvedValueOnce(false).mockResolvedValueOnce(false).mockResolvedValueOnce(false);

    await runInit();

    const config = parseWrittenYaml();
    expect(config.categories).toEqual(DEFAULT_CATEGORIES);
  });

  it('extends defaults with custom categories', async () => {
    vi.mocked(select)
      .mockResolvedValueOnce('gitlab')       // provider
      .mockResolvedValueOnce('v{version}')   // tag format
      .mockResolvedValueOnce('lenient')      // uncategorized
      .mockResolvedValueOnce('extend');      // category mode
    vi.mocked(input)
      .mockResolvedValueOnce('https://gitlab.example.com') // provider URL
      .mockResolvedValueOnce('security')               // 1st custom label
      .mockResolvedValueOnce('Security Fixes')          // 1st custom heading
      .mockResolvedValueOnce('')                         // done adding
      .mockResolvedValueOnce('test-token');              // token
    vi.mocked(confirm).mockResolvedValueOnce(false).mockResolvedValueOnce(false).mockResolvedValueOnce(false);

    await runInit();

    const config = parseWrittenYaml();
    expect(config.categories).toEqual({
      ...DEFAULT_CATEGORIES,
      security: 'Security Fixes',
    });
  });

  it('uses only custom categories when user selects "custom"', async () => {
    vi.mocked(select)
      .mockResolvedValueOnce('gitlab')       // provider
      .mockResolvedValueOnce('v{version}')   // tag format
      .mockResolvedValueOnce('lenient')      // uncategorized
      .mockResolvedValueOnce('custom');      // category mode
    vi.mocked(input)
      .mockResolvedValueOnce('https://gitlab.example.com')
      .mockResolvedValueOnce('enhancement')
      .mockResolvedValueOnce('Enhancements')
      .mockResolvedValueOnce('bugfix')
      .mockResolvedValueOnce('Bug Fixes')
      .mockResolvedValueOnce('')                         // done
      .mockResolvedValueOnce('test-token');
    vi.mocked(confirm).mockResolvedValueOnce(false).mockResolvedValueOnce(false).mockResolvedValueOnce(false);

    await runInit();

    const config = parseWrittenYaml();
    expect(config.categories).toEqual({
      enhancement: 'Enhancements',
      bugfix: 'Bug Fixes',
    });
  });

  it('skips duplicate labels silently', async () => {
    vi.mocked(select)
      .mockResolvedValueOnce('gitlab')       // provider
      .mockResolvedValueOnce('v{version}')   // tag format
      .mockResolvedValueOnce('lenient')      // uncategorized
      .mockResolvedValueOnce('extend');      // category mode
    vi.mocked(input)
      .mockResolvedValueOnce('https://gitlab.example.com')
      .mockResolvedValueOnce('security')
      .mockResolvedValueOnce('Security Fixes')
      .mockResolvedValueOnce('security')                 // duplicate — skipped
      .mockResolvedValueOnce('')                         // done
      .mockResolvedValueOnce('test-token');
    vi.mocked(confirm).mockResolvedValueOnce(false).mockResolvedValueOnce(false).mockResolvedValueOnce(false);

    await runInit();

    const config = parseWrittenYaml();
    expect(config.categories).toEqual({
      ...DEFAULT_CATEGORIES,
      security: 'Security Fixes',
    });
  });

  it('re-prompts when custom-only mode has zero entries', async () => {
    vi.mocked(select)
      .mockResolvedValueOnce('gitlab')       // provider
      .mockResolvedValueOnce('v{version}')   // tag format
      .mockResolvedValueOnce('lenient')      // uncategorized
      .mockResolvedValueOnce('custom');      // category mode
    vi.mocked(input)
      .mockResolvedValueOnce('https://gitlab.example.com')
      .mockResolvedValueOnce('')                         // empty on first try
      .mockResolvedValueOnce('bugfix')                   // re-prompted, enters one
      .mockResolvedValueOnce('Bug Fixes')
      .mockResolvedValueOnce('')                         // done
      .mockResolvedValueOnce('test-token');
    vi.mocked(confirm).mockResolvedValueOnce(false).mockResolvedValueOnce(false).mockResolvedValueOnce(false);

    await runInit();

    const config = parseWrittenYaml();
    expect(config.categories).toEqual({ bugfix: 'Bug Fixes' });
  });

  it('defaults heading to capitalized label when left empty', async () => {
    vi.mocked(select)
      .mockResolvedValueOnce('gitlab')       // provider
      .mockResolvedValueOnce('v{version}')   // tag format
      .mockResolvedValueOnce('lenient')      // uncategorized
      .mockResolvedValueOnce('extend');      // category mode
    vi.mocked(input)
      .mockResolvedValueOnce('https://gitlab.example.com')
      .mockResolvedValueOnce('security')
      .mockResolvedValueOnce('')                         // empty heading
      .mockResolvedValueOnce('')                         // done
      .mockResolvedValueOnce('test-token');
    vi.mocked(confirm).mockResolvedValueOnce(false).mockResolvedValueOnce(false).mockResolvedValueOnce(false);

    await runInit();

    const config = parseWrittenYaml();
    expect(config.categories).toEqual({
      ...DEFAULT_CATEGORIES,
      security: 'Security',
    });
  });
});

describe('runInit — CI setup step', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    // Default: .gitlab-ci.yml does not exist
    vi.mocked(readFile).mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
  });

  function mockDefaultAnswers(ciSetup: boolean, ciTags?: string) {
    // select calls: (1) provider=gitlab, (2) tag format, (3) uncategorized, (4) category mode
    vi.mocked(select)
      .mockResolvedValueOnce('gitlab')
      .mockResolvedValueOnce('v{version}')
      .mockResolvedValueOnce('lenient')
      .mockResolvedValueOnce('defaults');

    // input calls: (1) provider URL, (2) CI tags (if ciSetup), (3) token
    const inputMocks = [
      'https://gitlab.example.com', // provider URL
    ];
    if (ciSetup && ciTags !== undefined) {
      inputMocks.push(ciTags); // CI tags
    }
    inputMocks.push('test-token'); // token

    for (const val of inputMocks) {
      vi.mocked(input).mockResolvedValueOnce(val);
    }

    // confirm calls: (1) multi-client -> false, (2) contributors -> false, (3) CI setup
    vi.mocked(confirm).mockResolvedValueOnce(false);   // multi-client
    vi.mocked(confirm).mockResolvedValueOnce(false);   // contributors
    vi.mocked(confirm).mockResolvedValueOnce(ciSetup); // CI
  }

  it('creates .gitlab-ci.yml when user accepts CI setup', async () => {
    mockDefaultAnswers(true, '');

    await runInit();

    const ciWrite = vi.mocked(writeFile).mock.calls.find(
      (c) => c[0] === '.gitlab-ci.yml',
    );
    expect(ciWrite).toBeDefined();
    expect(ciWrite![1] as string).toContain('ReleaseJet CI');
    expect(ciWrite![1] as string).toContain('- short-duration');
  });

  it('skips CI setup when user declines', async () => {
    mockDefaultAnswers(false);

    await runInit();

    const ciWrite = vi.mocked(writeFile).mock.calls.find(
      (c) => c[0] === '.gitlab-ci.yml',
    );
    expect(ciWrite).toBeUndefined();
  });

  it('uses custom tags when provided', async () => {
    mockDefaultAnswers(true, 'docker, gpu');

    await runInit();

    const ciWrite = vi.mocked(writeFile).mock.calls.find(
      (c) => c[0] === '.gitlab-ci.yml',
    );
    expect(ciWrite![1] as string).toContain('- docker');
    expect(ciWrite![1] as string).toContain('- gpu');
  });
});

describe('runInit — provider selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.mocked(readFile).mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
  });

  it('writes provider block for GitHub', async () => {
    vi.mocked(select)
      .mockResolvedValueOnce('github')          // provider
      .mockResolvedValueOnce('issues')          // source
      .mockResolvedValueOnce('v{version}')      // tag format
      .mockResolvedValueOnce('lenient')         // uncategorized
      .mockResolvedValueOnce('defaults');       // categories
    vi.mocked(input)
      .mockResolvedValueOnce('https://github.com')  // provider URL
      .mockResolvedValueOnce('ghp_test-token');      // token
    vi.mocked(confirm)
      .mockResolvedValueOnce(false)  // multi-client
      .mockResolvedValueOnce(false)  // contributors
      .mockResolvedValueOnce(false); // CI

    await runInit();

    const config = parseWrittenYaml();
    expect(config.provider).toEqual({ type: 'github', url: 'https://github.com' });
  });

  it('writes provider block for GitLab', async () => {
    vi.mocked(select)
      .mockResolvedValueOnce('gitlab')          // provider
      .mockResolvedValueOnce('v{version}')      // tag format
      .mockResolvedValueOnce('lenient')         // uncategorized
      .mockResolvedValueOnce('defaults');       // categories
    vi.mocked(input)
      .mockResolvedValueOnce('https://gitlab.example.com')  // provider URL
      .mockResolvedValueOnce('glpat-test-token');            // token
    vi.mocked(confirm)
      .mockResolvedValueOnce(false)  // multi-client
      .mockResolvedValueOnce(false)  // contributors
      .mockResolvedValueOnce(false); // CI

    await runInit();

    const config = parseWrittenYaml();
    expect(config.provider).toEqual({ type: 'gitlab', url: 'https://gitlab.example.com' });
  });

  it('creates GitHub Actions workflow when GitHub CI is accepted', async () => {
    vi.mocked(select)
      .mockResolvedValueOnce('github')
      .mockResolvedValueOnce('issues')
      .mockResolvedValueOnce('v{version}')
      .mockResolvedValueOnce('lenient')
      .mockResolvedValueOnce('defaults');
    vi.mocked(input)
      .mockResolvedValueOnce('https://github.com')
      .mockResolvedValueOnce('ghp_test-token');
    vi.mocked(confirm)
      .mockResolvedValueOnce(false)  // multi-client
      .mockResolvedValueOnce(false)  // contributors
      .mockResolvedValueOnce(true);  // CI setup

    await runInit();

    const workflowWrite = vi.mocked(writeFile).mock.calls.find(
      (c) => (c[0] as string).includes('release-notes.yml') && (c[0] as string).includes('.github'),
    );
    expect(workflowWrite).toBeDefined();
    expect(workflowWrite![1] as string).toContain('github.ref_name');
  });
});

describe('runInit — contributors step', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.mocked(readFile).mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
  });

  it('writes contributors config when user accepts', async () => {
    vi.mocked(select)
      .mockResolvedValueOnce('gitlab')          // provider
      .mockResolvedValueOnce('v{version}')      // tag format
      .mockResolvedValueOnce('lenient')         // uncategorized
      .mockResolvedValueOnce('defaults');       // categories
    vi.mocked(input)
      .mockResolvedValueOnce('https://gitlab.example.com')  // provider URL
      .mockResolvedValueOnce('test-token');                   // token
    vi.mocked(confirm)
      .mockResolvedValueOnce(false)   // multi-client
      .mockResolvedValueOnce(true)    // contributors
      .mockResolvedValueOnce(false);  // CI setup

    await runInit();

    const config = parseWrittenYaml();
    expect(config.contributors).toEqual({ enabled: true });
  });

  it('omits contributors config when user declines', async () => {
    vi.mocked(select)
      .mockResolvedValueOnce('gitlab')          // provider
      .mockResolvedValueOnce('v{version}')      // tag format
      .mockResolvedValueOnce('lenient')         // uncategorized
      .mockResolvedValueOnce('defaults');       // categories
    vi.mocked(input)
      .mockResolvedValueOnce('https://gitlab.example.com')  // provider URL
      .mockResolvedValueOnce('test-token');                   // token
    vi.mocked(confirm)
      .mockResolvedValueOnce(false)   // multi-client
      .mockResolvedValueOnce(false)   // contributors
      .mockResolvedValueOnce(false);  // CI setup

    await runInit();

    const config = parseWrittenYaml();
    expect(config.contributors).toBeUndefined();
  });
});
