import { describe, it, expect } from 'vitest';
import { FormatterRegistry } from '../../src/plugins/formatter-registry.js';
import type { ReleaseNotesData, ReleaseJetConfig } from '../../src/types.js';

const stubData: ReleaseNotesData = {
  tagName: 'v1.0.0',
  version: '1.0.0',
  clientPrefix: null,
  date: '2026-04-13',
  milestone: null,
  projectUrl: 'https://github.com/owner/repo',
  issues: { categorized: {}, uncategorized: [] },
  totalCount: 0,
  uncategorizedCount: 0,
  contributors: [],
};

const stubConfig: ReleaseJetConfig = {
  provider: { type: 'github', url: 'https://github.com' },
  source: 'issues',
  clients: [],
  categories: { feature: 'Features' },
  uncategorized: 'lenient',
};

describe('FormatterRegistry', () => {
  it('registers and runs a formatter by name', () => {
    const registry = new FormatterRegistry();
    registry.register('compact', () => '## Compact output');

    expect(registry.has('compact')).toBe(true);
    expect(registry.run('compact', stubData, stubConfig)).toBe('## Compact output');
  });

  it('returns false for unregistered formatter', () => {
    const registry = new FormatterRegistry();
    expect(registry.has('nonexistent')).toBe(false);
  });

  it('throws when running an unregistered formatter', () => {
    const registry = new FormatterRegistry();
    expect(() => registry.run('nonexistent', stubData, stubConfig)).toThrow(
      'Template "nonexistent" not found.',
    );
  });

  it('passes data and config to the formatter function', () => {
    const registry = new FormatterRegistry();
    registry.register('custom', (data, config) => {
      return `${data.tagName} - ${config.provider.type}`;
    });

    expect(registry.run('custom', stubData, stubConfig)).toBe('v1.0.0 - github');
  });
});
