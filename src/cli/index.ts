import { Command } from 'commander';
import { registerGenerateCommand } from './commands/generate.js';
import { registerValidateCommand } from './commands/validate.js';
import { registerInitCommand } from './commands/init.js';
import { registerCiCommand } from './commands/ci.js';
import { registerAuthCommand } from './commands/auth.js';

export function buildProgram(version: string): Command {
  const program = new Command();
  program
    .name('releasejet')
    .description('Automated release notes generator for GitLab and GitHub')
    .version(version);

  registerGenerateCommand(program);
  registerValidateCommand(program);
  registerInitCommand(program);
  registerCiCommand(program);
  registerAuthCommand(program);

  return program;
}
