import type { ReleaseNotesData, ReleaseJetConfig } from '../types.js';

export const PLUGIN_API_VERSION = 1;

export type FormatterFn = (
  data: ReleaseNotesData,
  config: ReleaseJetConfig,
) => string;

export interface Hook<T> {
  on(listener: (payload: T) => void | Promise<void>): void;
}

export interface BeforeFormatPayload {
  data: ReleaseNotesData;
  config: Readonly<ReleaseJetConfig>;
}

export interface AfterPublishPayload {
  tagName: string;
  releaseName: string;
  markdown: string;
  projectUrl: string;
}

export interface PluginOption {
  flags: string;
  description: string;
  defaultValue?: unknown;
}

export interface PluginCommand {
  name: string;
  description: string;
  options: PluginOption[];
  action: (options: Record<string, unknown>) => Promise<void>;
}

export interface PluginContext {
  registerFormatter(name: string, fn: FormatterFn): void;
  registerCommand(definition: PluginCommand): void;
  extendCommand(commandName: string, options: PluginOption[]): void;
  hooks: {
    beforeFormat: Hook<BeforeFormatPayload>;
    afterPublish: Hook<AfterPublishPayload>;
  };
  config: Readonly<ReleaseJetConfig>;
  logger: { debug: (...args: unknown[]) => void };
}

export interface ReleaseJetPlugin {
  name: string;
  version: string;
  apiVersion: number;
  register(context: PluginContext): void;
}

export interface PluginRuntime {
  hasFormatter(name: string): boolean;
  runFormatter(name: string, data: ReleaseNotesData, config: ReleaseJetConfig): string;
  hooks: {
    beforeFormat: { run(payload: BeforeFormatPayload): Promise<void> };
    afterPublish: { run(payload: AfterPublishPayload): Promise<void> };
  };
}
