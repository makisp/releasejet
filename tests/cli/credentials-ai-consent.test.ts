import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  setAiConsent,
  getAiConsent,
  clearAiConsent,
  writeEntry,
} from '../../src/cli/credentials-store.js';

let tmpHome: string;
let originalHome: string | undefined;
let originalUserProfile: string | undefined;

beforeEach(async () => {
  tmpHome = await mkdtemp(join(tmpdir(), 'rj-home-'));
  originalHome = process.env.HOME;
  originalUserProfile = process.env.USERPROFILE;
  process.env.HOME = tmpHome;
  process.env.USERPROFILE = tmpHome;
});

afterEach(async () => {
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  if (originalUserProfile === undefined) delete process.env.USERPROFILE;
  else process.env.USERPROFILE = originalUserProfile;
  await rm(tmpHome, { recursive: true, force: true });
});

describe('aiConsent CRUD', () => {
  it('returns null when no consent record exists', async () => {
    expect(await getAiConsent()).toBeNull();
  });

  it('writes and reads back a consent record', async () => {
    await setAiConsent(1);
    const r = await getAiConsent();
    expect(r).toMatchObject({ version: 1 });
    expect(typeof r!.acknowledgedAt).toBe('string');
  });

  it('overwrites version on subsequent setAiConsent', async () => {
    await setAiConsent(1);
    await setAiConsent(2);
    const r = await getAiConsent();
    expect(r!.version).toBe(2);
  });

  it('clearAiConsent removes the record', async () => {
    await setAiConsent(1);
    await clearAiConsent();
    expect(await getAiConsent()).toBeNull();
  });

  it('survives unrelated entries', async () => {
    await writeEntry('github.com', 'ghp_abc');
    await setAiConsent(1);
    expect((await getAiConsent())!.version).toBe(1);
  });
});
