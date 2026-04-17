import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const DIST_DOCS = join(process.cwd(), 'dist', 'docs');

describe('emit-docs-artifacts script', () => {
  beforeAll(() => {
    if (existsSync(DIST_DOCS)) rmSync(DIST_DOCS, { recursive: true, force: true });
    execSync('npx tsx scripts/emit-docs-artifacts.ts', { stdio: 'pipe' });
  }, 60_000);

  it('creates dist/docs/config-schema.json as a JSON Schema document', () => {
    const file = join(DIST_DOCS, 'config-schema.json');
    expect(existsSync(file)).toBe(true);
    const schema = JSON.parse(readFileSync(file, 'utf-8'));
    expect(schema.$schema).toMatch(/json-schema\.org/);
    expect(schema.title).toBe('ReleaseJetConfig');
    expect(schema.type).toBe('object');
    expect(schema.properties).toHaveProperty('provider');
    expect(schema.properties).toHaveProperty('source');
    expect(schema.properties).toHaveProperty('clients');
    expect(schema.properties).toHaveProperty('categories');
    expect(schema.properties).toHaveProperty('uncategorized');
    expect(schema.properties).toHaveProperty('contributors');
    expect(schema.properties).toHaveProperty('tagFormat');
  });

  it('creates dist/docs/commands.json with the expected shape', () => {
    const file = join(DIST_DOCS, 'commands.json');
    expect(existsSync(file)).toBe(true);
    const tree = JSON.parse(readFileSync(file, 'utf-8'));
    expect(tree.name).toBe('releasejet');
    expect(typeof tree.version).toBe('string');
    expect(Array.isArray(tree.commands)).toBe(true);
    const names = tree.commands.map((c: { name: string }) => c.name);
    expect(names).toEqual(expect.arrayContaining(['generate', 'init', 'validate', 'ci', 'auth']));

    const generate = tree.commands.find((c: { name: string }) => c.name === 'generate');
    expect(generate.description).toContain('Generate release notes');
    expect(Array.isArray(generate.flags)).toBe(true);
    const tagFlag = generate.flags.find((f: { long: string }) => f.long === '--tag');
    expect(tagFlag).toBeDefined();
    expect(tagFlag.required).toBe(true);
  });
});
