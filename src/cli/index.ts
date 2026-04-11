declare const __VERSION__: string;

import { Command } from 'commander';
import { registerGenerateCommand } from './commands/generate.js';
import { registerValidateCommand } from './commands/validate.js';
import { registerInitCommand } from './commands/init.js';
import { registerCiCommand } from './commands/ci.js';

const program = new Command();

program
  .name('releasejet')
  .description('Automated release notes generator for GitLab and GitHub')
  .version(__VERSION__);

registerGenerateCommand(program);
registerValidateCommand(program);
registerInitCommand(program);
registerCiCommand(program);

program.parse();
