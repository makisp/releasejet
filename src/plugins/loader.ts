import type { Command } from 'commander';
import type {
  ReleaseJetPlugin,
  PluginRuntime,
  PluginContext,
  BeforeFormatPayload,
  AfterPublishPayload,
} from './types.js';
import { PLUGIN_API_VERSION } from './types.js';
import { HookRegistry } from './hooks.js';
import { FormatterRegistry } from './formatter-registry.js';
import { readLicense } from '../license/store.js';
import { verifyLicense } from '../license/validator.js';
import type { ReleaseJetConfig } from '../types.js';

let _pluginRuntime: PluginRuntime | null = null;

export function getPluginRuntime(): PluginRuntime | null {
  return _pluginRuntime;
}

export function resetPluginRuntime(): void {
  _pluginRuntime = null;
}

function isValidPlugin(obj: unknown): obj is ReleaseJetPlugin {
  if (typeof obj !== 'object' || obj === null) return false;
  const p = obj as Record<string, unknown>;
  return (
    typeof p.name === 'string' &&
    typeof p.version === 'string' &&
    typeof p.apiVersion === 'number' &&
    typeof p.register === 'function'
  );
}

export async function discoverPlugin(
  program: Command,
  config: ReleaseJetConfig,
  debug: (...args: unknown[]) => void = () => {},
  importFn: (specifier: string) => Promise<unknown> = (s) => import(s),
): Promise<void> {
  let pluginModule: unknown;
  try {
    pluginModule = await importFn('@releasejet/pro');
  } catch {
    // Not installed — silent, free CLI
    return;
  }

  const plugin =
    (pluginModule as Record<string, unknown>)?.default ?? pluginModule;

  if (!isValidPlugin(plugin)) {
    console.warn(
      '@releasejet/pro has an invalid plugin format. Try updating it.',
    );
    return;
  }

  if (plugin.apiVersion !== PLUGIN_API_VERSION) {
    console.warn(
      `@releasejet/pro requires plugin API v${plugin.apiVersion} but this version of releasejet supports v${PLUGIN_API_VERSION}. Please update releasejet.`,
    );
    return;
  }

  const license = await readLicense();
  if (!license) {
    console.warn(
      '@releasejet/pro found but no license activated. Run `releasejet auth activate <key>`.',
    );
    return;
  }

  const status = await verifyLicense(license.token);
  if (!status.valid) {
    if (status.reason === 'expired') {
      console.warn(
        'Pro license expired. Run `releasejet auth refresh` to renew.',
      );
    } else {
      console.warn(
        'Pro license key is invalid. Run `releasejet auth activate <key>` with a valid key.',
      );
    }
    return;
  }

  const beforeFormat = new HookRegistry<BeforeFormatPayload>();
  const afterPublish = new HookRegistry<AfterPublishPayload>();
  const formatterRegistry = new FormatterRegistry();

  const context: PluginContext = {
    registerFormatter: (name, fn) => formatterRegistry.register(name, fn),
    registerCommand: (def) => {
      const cmd = program.command(def.name).description(def.description);
      for (const opt of def.options) {
        cmd.option(opt.flags, opt.description, opt.defaultValue);
      }
      cmd.action(async (opts) => def.action(opts));
    },
    extendCommand: (commandName, options) => {
      const cmd = program.commands.find((c) => c.name() === commandName);
      if (cmd) {
        for (const opt of options) {
          cmd.option(opt.flags, opt.description, opt.defaultValue);
        }
      }
    },
    hooks: { beforeFormat, afterPublish },
    config,
    logger: { debug },
  };

  plugin.register(context);

  _pluginRuntime = {
    hasFormatter: (name) => formatterRegistry.has(name),
    runFormatter: (name, data, cfg) => formatterRegistry.run(name, data, cfg),
    hooks: { beforeFormat, afterPublish },
  };

  debug(`Plugin loaded: ${plugin.name}@${plugin.version}`);
}
