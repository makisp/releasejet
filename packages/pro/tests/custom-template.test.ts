import { describe, it, expect, afterEach } from 'vitest';
import { writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { renderCustomTemplate, clearTemplateCache } from '@makispps/releasejet/plugin/templates';
import { fullData, githubConfig } from './fixtures.js';

afterEach(() => {
  clearTemplateCache();
});

describe('custom .hbs template', () => {
  it('renders a user-provided .hbs file', () => {
    const dir = join(tmpdir(), 'releasejet-test-' + Date.now());
    mkdirSync(dir, { recursive: true });
    const filePath = join(dir, 'custom.hbs');
    writeFileSync(filePath, '# {{title}} - custom\n{{#each categoryEntries}}{{this.heading}}: {{this.issues.length}}\n{{/each}}');

    try {
      const result = renderCustomTemplate(filePath, fullData, githubConfig);
      expect(result).toContain('# v1.2.0 - custom');
      expect(result).toContain('Bug Fixes: 2');
      expect(result).toContain('New Features: 1');
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it('throws on non-existent file', () => {
    expect(() =>
      renderCustomTemplate('/tmp/does-not-exist-' + Date.now() + '.hbs', fullData, githubConfig),
    ).toThrow();
  });

  it('provides all TemplateContext variables to custom templates', () => {
    const dir = join(tmpdir(), 'releasejet-ctx-' + Date.now());
    mkdirSync(dir, { recursive: true });
    const filePath = join(dir, 'ctx-test.hbs');
    writeFileSync(
      filePath,
      [
        'title:{{title}}',
        'date:{{data.date}}',
        'metaLine:{{metaLine}}',
        'contributors:{{contributorsList}}',
        'hasContributors:{{hasContributors}}',
        'showUncategorized:{{showUncategorized}}',
      ].join('\n'),
    );

    try {
      const result = renderCustomTemplate(filePath, fullData, githubConfig);
      expect(result).toContain('title:v1.2.0');
      expect(result).toContain('date:2026-04-14');
      expect(result).toContain('hasContributors:true');
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});
