import type { ReleaseJetPlugin, PluginContext } from '@makispps/releasejet/plugin';
import { registerBuiltinTemplate, renderTemplate } from '@makispps/releasejet/plugin/templates';
import compactSource from './templates/compact.hbs';
import detailedSource from './templates/detailed.hbs';
import changelogSource from './templates/changelog.hbs';

const TEMPLATES: Record<string, string> = {
  compact: compactSource,
  detailed: detailedSource,
  changelog: changelogSource,
};

const plugin: ReleaseJetPlugin = {
  name: '@releasejet/pro',
  version: '1.0.0',
  apiVersion: 1,
  register(context: PluginContext) {
    for (const [name, source] of Object.entries(TEMPLATES)) {
      registerBuiltinTemplate(name, source);
      context.registerFormatter(name, (data, config) => renderTemplate(name, data, config));
    }
  },
};

export default plugin;
