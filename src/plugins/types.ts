import type { ReleaseNotesData, ReleaseJetConfig } from '../types.js';

export type { NotificationChannelConfig } from '../types.js';

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

export interface AfterGeneratePayload {
  tagName: string;
  /** Previous tag in the same stream, or null for the first release in that stream. */
  previousTag: string | null;
  markdown: string;
  projectUrl: string;
  /** Provider type — exposed so adapters can route without re-inspecting config. */
  provider: 'gitlab' | 'github';
  /** Structured release-notes data (issues, counts, contributors, etc.). */
  data: ReleaseNotesData;
  /** True when the user passed --no-notify; plugins should skip notification dispatch. */
  notifyDisabled: boolean;
  /** Project name to display above the release header in notifications.
   *  Populated from `ReleaseJetConfig.projectName` or `deriveProjectName(projectUrl)`;
   *  undefined when neither resolves. */
  projectName?: string;
  /** ISO-8601 timestamp of when notes were generated (set once per logical event,
   *  reused across retries by the webhook adapter). */
  generatedAt: string;
}

export interface AfterPublishPayload extends AfterGeneratePayload {
  releaseName: string;
  /** Provider-specific URL to the published release page. */
  releaseUrl: string;
  /** ISO-8601 timestamp of when the release page was created on the provider. */
  publishedAt: string;
}

export interface PluginOption {
  flags: string;
  description: string;
  defaultValue?: string | boolean;
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
