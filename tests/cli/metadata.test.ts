import { describe, it, expect } from 'vitest';
import { Command } from 'commander';
import { extractCommandTree } from '../../src/cli/metadata.js';

function buildProgram(): Command {
  const program = new Command();
  program.name('releasejet').description('Release notes generator').version('1.0.0');
  program
    .command('generate')
    .description('Generate release notes for a tag')
    .requiredOption('--tag <tag>', 'Git tag')
    .option('--publish', 'Publish release', false)
    .option('--format <format>', 'Output format', 'markdown');
  program
    .command('init')
    .description('Interactive setup wizard');
  return program;
}

describe('extractCommandTree', () => {
  it('returns the program name and version', () => {
    const tree = extractCommandTree(buildProgram());
    expect(tree.name).toBe('releasejet');
    expect(tree.version).toBe('1.0.0');
  });

  it('extracts each command with its description', () => {
    const tree = extractCommandTree(buildProgram());
    const names = tree.commands.map((c) => c.name);
    expect(names).toEqual(['generate', 'init']);
    const gen = tree.commands.find((c) => c.name === 'generate');
    expect(gen?.description).toBe('Generate release notes for a tag');
  });

  it('extracts flag metadata including required, default, and type', () => {
    const tree = extractCommandTree(buildProgram());
    const gen = tree.commands.find((c) => c.name === 'generate')!;
    const flags = gen.flags;
    const tag = flags.find((f) => f.long === '--tag');
    expect(tag).toMatchObject({
      long: '--tag',
      argument: '<tag>',
      description: 'Git tag',
      required: true,
      type: 'string',
    });
    const publish = flags.find((f) => f.long === '--publish');
    expect(publish).toMatchObject({
      long: '--publish',
      description: 'Publish release',
      required: false,
      type: 'boolean',
      default: false,
    });
    const format = flags.find((f) => f.long === '--format');
    expect(format).toMatchObject({
      long: '--format',
      argument: '<format>',
      description: 'Output format',
      required: false,
      type: 'string',
      default: 'markdown',
    });
  });

  it('extracts examples from addHelpText("after", ...)', () => {
    const program = new Command();
    program.name('releasejet').description('test').version('1.0.0');
    program
      .command('generate')
      .description('Generate release notes')
      .addHelpText(
        'after',
        '\nExamples:\n  $ releasejet generate --tag v1.0.0\n  $ releasejet generate --tag v2.0.0 --publish\n',
      );
    const tree = extractCommandTree(program);
    const gen = tree.commands.find((c) => c.name === 'generate')!;
    expect(gen.examples).toEqual([
      'releasejet generate --tag v1.0.0',
      'releasejet generate --tag v2.0.0 --publish',
    ]);
  });

  it('descends into subcommands', () => {
    const program = new Command();
    program.name('releasejet').description('test').version('1.0.0');
    const auth = program.command('auth').description('Pro license commands');
    auth
      .command('activate <key>')
      .description('Activate a Pro license');
    auth.command('status').description('Show license status');

    const tree = extractCommandTree(program);
    const authMeta = tree.commands.find((c) => c.name === 'auth')!;
    expect(authMeta.commands.map((c) => c.name)).toEqual(['activate', 'status']);
    expect(authMeta.commands[0].description).toBe('Activate a Pro license');
  });

  it('returns empty commands array for leaf commands', () => {
    const program = new Command();
    program.name('releasejet').description('test').version('1.0.0');
    program.command('init').description('Init');
    const tree = extractCommandTree(program);
    const init = tree.commands.find((c) => c.name === 'init')!;
    expect(init.commands).toEqual([]);
  });
});
