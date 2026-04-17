import type { Command, Option } from 'commander';

export interface FlagMetadata {
  long: string;
  short: string | null;
  argument: string | null;
  description: string;
  required: boolean;
  type: 'boolean' | 'string';
  default: unknown;
}

export interface CommandMetadata {
  name: string;
  description: string;
  flags: FlagMetadata[];
  examples: string[];
}

export interface CommandTree {
  name: string;
  version: string;
  description: string;
  commands: CommandMetadata[];
}

function extractFlag(opt: Option): FlagMetadata {
  const flags = opt.flags;
  // Commander flag strings look like: "-t, --tag <tag>" or "--publish" or "--format <format>"
  const parts = flags.split(/\s+/);
  let short: string | null = null;
  let long = '';
  let argument: string | null = null;
  for (const p of parts) {
    const cleaned = p.replace(/,$/, '');
    if (cleaned.startsWith('--')) {
      long = cleaned;
    } else if (cleaned.startsWith('-')) {
      short = cleaned;
    } else if (cleaned.startsWith('<') || cleaned.startsWith('[')) {
      argument = cleaned;
    }
  }

  const type: 'boolean' | 'string' = argument ? 'string' : 'boolean';
  return {
    long,
    short,
    argument,
    description: opt.description,
    required: opt.mandatory === true,
    type,
    default: opt.defaultValue,
  };
}

function extractExamples(cmd: Command): string[] {
  // Commander stores additional help via `addHelpText('after', ...)`.
  // Parse lines that start with "$ " from the help text.
  const help = cmd.helpInformation();
  const examples: string[] = [];
  const lines = help.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('$ ')) {
      examples.push(trimmed.slice(2).split(/\s{2,}/)[0].trim());
    }
  }
  return examples;
}

function extractCommand(cmd: Command): CommandMetadata {
  const flags = cmd.options.map(extractFlag);
  return {
    name: cmd.name(),
    description: cmd.description(),
    flags,
    examples: extractExamples(cmd),
  };
}

export function extractCommandTree(program: Command): CommandTree {
  const commands = program.commands.map(extractCommand);
  return {
    name: program.name(),
    version: program.version() ?? '0.0.0',
    description: program.description(),
    commands,
  };
}
