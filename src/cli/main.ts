declare const __VERSION__: string | undefined;

import { buildProgram } from './index.js';
import { loadConfig, DEFAULT_CONFIG } from '../core/config.js';
import { discoverPlugin } from '../plugins/loader.js';
import { createLogger } from './logger.js';

const version = typeof __VERSION__ === 'string' ? __VERSION__ : '0.0.0-dev';
const program = buildProgram(version);

// discoverPlugin runs before commander parses argv, so detect --debug directly.
const logger = createLogger(process.argv.includes('--debug'));

const config = await loadConfig().catch(() => DEFAULT_CONFIG);
await discoverPlugin(program, config, logger.debug);

program.parse();
