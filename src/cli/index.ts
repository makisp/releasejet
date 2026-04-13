declare const __VERSION__: string;

import { Command } from 'commander';
import { registerGenerateCommand } from './commands/generate.js';
import { registerValidateCommand } from './commands/validate.js';
import { registerInitCommand } from './commands/init.js';
import { registerCiCommand } from './commands/ci.js';
import { registerAuthCommand } from './commands/auth.js';
import { loadConfig, DEFAULT_CONFIG } from '../core/config.js';
import { discoverPlugin } from '../plugins/loader.js';

const program = new Command();

program
  .name('releasejet')
  .description('Automated release notes generator for GitLab and GitHub')
  .version(__VERSION__);

registerGenerateCommand(program);
registerValidateCommand(program);
registerInitCommand(program);
registerCiCommand(program);
registerAuthCommand(program);

// Load config for plugin context (falls back to defaults on error)
const config = await loadConfig().catch(() => DEFAULT_CONFIG);
await discoverPlugin(program, config);

program.parse();
