/**
 * Type-level regression fixture. Not executed by vitest — only type-checked by
 * `npm run typecheck`. Asserts that every type the plugin entry
 * (`@makispps/releasejet/plugin`) is expected to export is actually reachable
 * through the plugin barrel (`src/plugins/types.ts`). If this file fails to
 * compile, the plugin barrel is missing a public re-export.
 */

import type {
  AfterPublishPayload,
  NotificationChannelConfig,
  PluginContext,
  ReleaseJetPlugin,
} from '../../src/plugins/types.js';

export const _channel: NotificationChannelConfig = {
  type: 'slack',
  enabled: true,
  webhookUrl: 'https://hooks.slack.com/services/XXX/YYY/ZZZ',
};

export const _payload: Pick<AfterPublishPayload, 'tagName' | 'notifyDisabled'> = {
  tagName: 'v1.2.3',
  notifyDisabled: false,
};

export type _PluginContext = PluginContext;
export type _ReleaseJetPlugin = ReleaseJetPlugin;
