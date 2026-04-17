import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ReleaseJetConfigSchema } from '../src/core/config.schema.js';
import { buildProgram } from '../src/cli/index.js';
import { extractCommandTree } from '../src/cli/metadata.js';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

async function main(): Promise<void> {
  const outDir = join(process.cwd(), 'dist', 'docs');
  await mkdir(outDir, { recursive: true });

  const configSchema = {
    title: 'ReleaseJetConfig',
    ...zodToJsonSchema(ReleaseJetConfigSchema, {
      $refStrategy: 'none',
    }),
  };
  await writeFile(
    join(outDir, 'config-schema.json'),
    JSON.stringify(configSchema, null, 2) + '\n',
    'utf-8',
  );

  const program = buildProgram(pkg.version);
  const tree = extractCommandTree(program);
  await writeFile(
    join(outDir, 'commands.json'),
    JSON.stringify(tree, null, 2) + '\n',
    'utf-8',
  );

  console.log(
    `✓ Emitted dist/docs/config-schema.json and dist/docs/commands.json (v${pkg.version})`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
