declare const __VERSION__: string | undefined;

import { buildProgram } from './index.js';
import { loadConfig, DEFAULT_CONFIG } from '../core/config.js';
import { discoverPlugin } from '../plugins/loader.js';

const version = typeof __VERSION__ === 'string' ? __VERSION__ : '0.0.0-dev';
const program = buildProgram(version);

const config = await loadConfig().catch(() => DEFAULT_CONFIG);
await discoverPlugin(program, config);

program.parse();
