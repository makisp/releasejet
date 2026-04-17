import { defineConfig } from 'tsup';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig([
  {
    entry: { cli: 'src/cli/main.ts' },
    format: ['esm'],
    target: 'node20',
    clean: true,
    banner: { js: '#!/usr/bin/env node' },
    define: { __VERSION__: JSON.stringify(pkg.version) },
    loader: { '.hbs': 'text' },
  },
  {
    entry: { 'plugins/types': 'src/plugins/types.ts' },
    format: ['esm'],
    target: 'node20',
    dts: true,
  },
  {
    entry: { 'plugins/template-api': 'src/plugins/template-api.ts' },
    format: ['esm'],
    target: 'node20',
    dts: true,
    loader: { '.hbs': 'text' },
  },
]);
