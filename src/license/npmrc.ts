import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

const REGISTRY_LINE = '@releasejet:registry=https://npm.releasejet.dev/';
const TOKEN_PREFIX = '//npm.releasejet.dev/:_authToken=';

function npmrcPath(): string {
  return join(homedir(), '.npmrc');
}

function isReleasejetLine(line: string): boolean {
  return line.startsWith('@releasejet:registry=') || line.startsWith('//npm.releasejet.dev/');
}

async function readNpmrc(): Promise<string | null> {
  try {
    return await readFile(npmrcPath(), 'utf-8');
  } catch {
    return null;
  }
}

export async function isNpmrcConfigured(): Promise<boolean> {
  const content = await readNpmrc();
  if (content === null) return false;
  return content.includes(REGISTRY_LINE) && content.includes(TOKEN_PREFIX);
}

export async function writeNpmrcConfig(key: string): Promise<void> {
  const existing = await readNpmrc();
  const lines = existing ? existing.split('\n') : [];

  // Remove any existing releasejet lines
  const filtered = lines.filter((line) => !isReleasejetLine(line.trim()));

  // Remove trailing empty lines, then add our lines
  while (filtered.length > 0 && filtered[filtered.length - 1].trim() === '') {
    filtered.pop();
  }

  filtered.push(REGISTRY_LINE);
  filtered.push(`${TOKEN_PREFIX}${key}`);
  filtered.push(''); // trailing newline

  await writeFile(npmrcPath(), filtered.join('\n'), 'utf-8');
}

export async function removeNpmrcConfig(): Promise<void> {
  const existing = await readNpmrc();
  if (!existing) return;

  const lines = existing.split('\n');
  const filtered = lines.filter((line) => !isReleasejetLine(line.trim()));

  await writeFile(npmrcPath(), filtered.join('\n'), 'utf-8');
}
