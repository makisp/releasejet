import type { ReleaseNotesData, ReleaseJetConfig } from '../types.js';
import { renderTemplate } from './template-engine.js';

export function formatReleaseNotes(
  data: ReleaseNotesData,
  config: ReleaseJetConfig,
): string {
  return renderTemplate('default', data, config);
}
