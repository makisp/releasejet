import { describe, it, expect } from 'vitest';
import {
  generateCiBlock,
  hasCiBlock,
  appendCiBlock,
  removeCiBlock,
  generateGitHubActionsTemplate,
  hasProLines,
  CI_MARKER_START,
  CI_MARKER_END,
  DEFAULT_TAGS,
} from '../../src/core/ci.js';

describe('generateCiBlock', () => {
  it('generates block with a single tag', () => {
    const block = generateCiBlock(['short-duration']);
    expect(block).toContain(CI_MARKER_START);
    expect(block).toContain(CI_MARKER_END);
    expect(block).toContain('npm install -g @makispps/releasejet');
    expect(block).toContain('releasejet generate --tag "$CI_COMMIT_TAG" --publish');
    expect(block).toContain('    - short-duration');
  });

  it('generates block with multiple tags', () => {
    const block = generateCiBlock(['short-duration', 'docker']);
    expect(block).toContain('    - short-duration');
    expect(block).toContain('    - docker');
  });
});

describe('hasCiBlock', () => {
  it('returns true when both markers are present', () => {
    const content = `${CI_MARKER_START}\nsome content\n${CI_MARKER_END}`;
    expect(hasCiBlock(content)).toBe(true);
  });

  it('returns false when no markers are present', () => {
    expect(hasCiBlock('stages:\n  - build')).toBe(false);
  });

  it('returns false when only start marker is present', () => {
    expect(hasCiBlock(CI_MARKER_START)).toBe(false);
  });

  it('returns false when markers appear in wrong order', () => {
    const content = `${CI_MARKER_END}\nsome content\n${CI_MARKER_START}`;
    expect(hasCiBlock(content)).toBe(false);
  });
});

describe('appendCiBlock', () => {
  it('appends block to existing content with double newline separator', () => {
    const existing = 'stages:\n  - build\n';
    const block = generateCiBlock(['short-duration']);
    const result = appendCiBlock(existing, block);
    expect(result).toMatch(/^stages:\n {2}- build\n\n# --- ReleaseJet/);
    expect(result.endsWith('\n')).toBe(true);
  });

  it('returns just the block when existing content is empty', () => {
    const block = generateCiBlock(['short-duration']);
    const result = appendCiBlock('', block);
    expect(result).toBe(block + '\n');
  });

  it('trims trailing whitespace from existing content before appending', () => {
    const existing = 'stages:\n  - build\n\n\n';
    const block = generateCiBlock(['short-duration']);
    const result = appendCiBlock(existing, block);
    expect(result).not.toMatch(/\n{3,}/);
  });
});

describe('removeCiBlock', () => {
  it('removes the marker block and cleans up whitespace', () => {
    const block = generateCiBlock(['short-duration']);
    const content = `stages:\n  - build\n\n${block}\n`;
    const result = removeCiBlock(content);
    expect(result).toBe('stages:\n  - build');
    expect(result).not.toContain(CI_MARKER_START);
  });

  it('returns empty string when file only contains the marker block', () => {
    const block = generateCiBlock(['short-duration']);
    const result = removeCiBlock(block + '\n');
    expect(result).toBe('');
  });

  it('returns content unchanged when no markers are present', () => {
    const content = 'stages:\n  - build\n';
    expect(removeCiBlock(content)).toBe(content);
  });

  it('returns content unchanged when markers appear in wrong order', () => {
    const corrupted = `${CI_MARKER_END}\nsome content\n${CI_MARKER_START}`;
    expect(removeCiBlock(corrupted)).toBe(corrupted);
  });

  it('preserves content before and after the marker block', () => {
    const block = generateCiBlock(['short-duration']);
    const content = `stages:\n  - build\n\n${block}\n\nvariables:\n  FOO: bar`;
    const result = removeCiBlock(content);
    expect(result).toContain('stages:');
    expect(result).toContain('variables:');
    expect(result).not.toContain(CI_MARKER_START);
  });
});

describe('DEFAULT_TAGS', () => {
  it('defaults to short-duration', () => {
    expect(DEFAULT_TAGS).toEqual(['short-duration']);
  });
});

describe('generateCiBlock — Pro variant', () => {
  it('generates Pro block with registry lines and dual install', () => {
    const block = generateCiBlock(['short-duration'], { pro: true });
    expect(block).toContain(CI_MARKER_START);
    expect(block).toContain(CI_MARKER_END);
    expect(block).toContain('echo "@releasejet:registry=https://npm.releasejet.dev/"');
    expect(block).toContain('RELEASEJET_PRO_TOKEN');
    expect(block).toContain('@makispps/releasejet @releasejet/pro');
  });

  it('generates free block when pro is false', () => {
    const block = generateCiBlock(['short-duration'], { pro: false });
    expect(block).not.toContain('npm.releasejet.dev');
    expect(block).not.toContain('@releasejet/pro');
    expect(block).toContain('npm install -g @makispps/releasejet');
  });

  it('defaults to free block when options omitted', () => {
    const block = generateCiBlock(['short-duration']);
    expect(block).not.toContain('npm.releasejet.dev');
  });
});

describe('generateGitHubActionsTemplate', () => {
  it('generates free GitHub Actions template', () => {
    const template = generateGitHubActionsTemplate({ pro: false });
    expect(template).toContain('name: Release Notes');
    expect(template).toContain('npm install -g @makispps/releasejet');
    expect(template).toContain('RELEASEJET_TOKEN');
    expect(template).not.toContain('npm.releasejet.dev');
    expect(template).not.toContain('@releasejet/pro');
  });

  it('generates Pro GitHub Actions template', () => {
    const template = generateGitHubActionsTemplate({ pro: true });
    expect(template).toContain('name: Release Notes');
    expect(template).toContain('Configure Pro registry');
    expect(template).toContain('echo "@releasejet:registry=https://npm.releasejet.dev/"');
    expect(template).toContain('RELEASEJET_PRO_TOKEN');
    expect(template).toContain('@makispps/releasejet @releasejet/pro');
    expect(template).toContain('RELEASEJET_TOKEN');
  });

  it('passes RELEASEJET_PRO_TOKEN to generate step in Pro template', () => {
    const template = generateGitHubActionsTemplate({ pro: true });
    // Find the generate step and check it has the env var
    const generateStepIndex = template.indexOf('releasejet generate');
    const envAfterGenerate = template.substring(generateStepIndex);
    expect(envAfterGenerate).toContain('RELEASEJET_PRO_TOKEN');
  });

  it('does not pass RELEASEJET_PRO_TOKEN to generate step in free template', () => {
    const template = generateGitHubActionsTemplate({ pro: false });
    const generateStepIndex = template.indexOf('releasejet generate');
    const envAfterGenerate = template.substring(generateStepIndex);
    expect(envAfterGenerate).not.toContain('RELEASEJET_PRO_TOKEN');
  });
});

describe('hasProLines', () => {
  it('returns true when content contains npm.releasejet.dev', () => {
    expect(hasProLines('echo "//npm.releasejet.dev/:_authToken"')).toBe(true);
  });

  it('returns true when content contains @releasejet/pro', () => {
    expect(hasProLines('npm install -g @makispps/releasejet @releasejet/pro')).toBe(true);
  });

  it('returns false for free template content', () => {
    expect(hasProLines('npm install -g @makispps/releasejet')).toBe(false);
  });
});
