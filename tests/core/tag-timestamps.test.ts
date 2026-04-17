import { describe, it, expect } from 'vitest';
import {
  README_ANCHOR_URL,
  TAG_TIMESTAMP_TIP,
  formatLightweightTagWarning,
} from '../../src/core/tag-timestamps.js';

describe('README_ANCHOR_URL', () => {
  it('points to the Tag Timestamps section of the README on GitHub', () => {
    expect(README_ANCHOR_URL).toBe(
      'https://github.com/makisp/releasejet#tag-timestamps',
    );
  });
});

describe('TAG_TIMESTAMP_TIP', () => {
  it('mentions annotated tags, both web UIs, and the --publish flow', () => {
    expect(TAG_TIMESTAMP_TIP).toContain('Tag timestamps');
    expect(TAG_TIMESTAMP_TIP).toContain('git tag -a');
    expect(TAG_TIMESTAMP_TIP).toContain('GitLab:');
    expect(TAG_TIMESTAMP_TIP).toContain('GitHub:');
    expect(TAG_TIMESTAMP_TIP).toContain('--publish');
    expect(TAG_TIMESTAMP_TIP).toContain(README_ANCHOR_URL);
  });
});

describe('formatLightweightTagWarning', () => {
  it('interpolates the tag name', () => {
    const out = formatLightweightTagWarning('v1.2.3');
    expect(out).toContain('"v1.2.3"');
  });

  it('describes both the annotated-tag option and the release-object option', () => {
    const out = formatLightweightTagWarning('v1.0.0');
    expect(out).toContain('git tag -a');
    expect(out).toContain('--publish');
  });

  it('includes the README anchor URL', () => {
    const out = formatLightweightTagWarning('v1.0.0');
    expect(out).toContain(README_ANCHOR_URL);
  });

  it('explains the fallback behavior', () => {
    const out = formatLightweightTagWarning('v1.0.0');
    expect(out).toContain('commit date');
  });
});
