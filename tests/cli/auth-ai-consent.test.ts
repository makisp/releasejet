import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let tmpHome: string;
let originalHome: string | undefined;
let originalUserProfile: string | undefined;
let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  tmpHome = await mkdtemp(join(tmpdir(), 'rj-home-'));
  originalHome = process.env.HOME;
  originalUserProfile = process.env.USERPROFILE;
  process.env.HOME = tmpHome;
  process.env.USERPROFILE = tmpHome;
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(async () => {
  logSpy.mockRestore();
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  if (originalUserProfile === undefined) delete process.env.USERPROFILE;
  else process.env.USERPROFILE = originalUserProfile;
  await rm(tmpHome, { recursive: true, force: true });
});

describe('auth ai-consent', () => {
  it('shows "not granted" when no record exists', async () => {
    const { runAiConsentShow } = await import('../../src/cli/commands/auth.js');
    await runAiConsentShow();
    expect(logSpy.mock.calls.flat().join('\n')).toMatch(/not granted/i);
  });

  it('grant writes a record', async () => {
    const { runAiConsentGrant, runAiConsentShow } = await import(
      '../../src/cli/commands/auth.js'
    );
    await runAiConsentGrant();
    logSpy.mockClear();
    await runAiConsentShow();
    expect(logSpy.mock.calls.flat().join('\n')).toMatch(/granted at/i);
  });

  it('revoke removes a record', async () => {
    const { runAiConsentGrant, runAiConsentRevoke, runAiConsentShow } = await import(
      '../../src/cli/commands/auth.js'
    );
    await runAiConsentGrant();
    await runAiConsentRevoke();
    logSpy.mockClear();
    await runAiConsentShow();
    expect(logSpy.mock.calls.flat().join('\n')).toMatch(/not granted/i);
  });
});
