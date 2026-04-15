import { describe, it, expect } from 'vitest';
import {
  generateCiBlock,
  hasCiBlock,
  appendCiBlock,
  removeCiBlock,
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
