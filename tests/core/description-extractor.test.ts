import { describe, it, expect } from 'vitest';
import { extractDescription } from '../../src/core/description-extractor.js';

describe('extractDescription', () => {
  it('returns undefined for null/undefined/empty/whitespace-only', () => {
    expect(extractDescription(null)).toBeUndefined();
    expect(extractDescription(undefined)).toBeUndefined();
    expect(extractDescription('')).toBeUndefined();
    expect(extractDescription('   \n  \t  ')).toBeUndefined();
  });

  it('returns first paragraph as-is when prose only (whitespace collapsed)', () => {
    const raw = 'Users were redirected to /login instead of their target after SSO callback.';
    expect(extractDescription(raw)).toBe(
      'Users were redirected to /login instead of their target after SSO callback.',
    );
  });

  it('strips leading HTML comments (single and multiple)', () => {
    const raw = '<!-- bug template -->\n<!-- thanks for reporting -->\nThe button is broken on Safari.';
    expect(extractDescription(raw)).toBe('The button is broken on Safari.');
  });

  it('skips leading "## Description" header and takes prose below', () => {
    const raw = '## Description\n\nThe export feature crashes when the dataset exceeds 10k rows.';
    expect(extractDescription(raw)).toBe(
      'The export feature crashes when the dataset exceeds 10k rows.',
    );
  });

  it('skips leading blockquote lines and takes first non-quote prose', () => {
    const raw = '> Original report from Slack:\n> Thanks for the heads-up.\n\nThe loader hangs on slow networks.';
    expect(extractDescription(raw)).toBe('The loader hangs on slow networks.');
  });

  it('skips multiple leading headers + blank lines', () => {
    const raw = '# Title\n\n## Subtitle\n\n### Detail\n\nActual prose starts here.';
    expect(extractDescription(raw)).toBe('Actual prose starts here.');
  });

  it('returns undefined when body is only headers / comments / blank lines', () => {
    const raw = '<!-- comment -->\n\n## Heading only\n\n> quote only\n\n';
    expect(extractDescription(raw)).toBeUndefined();
  });

  it('truncates very long single paragraph at last word boundary ≤ 199 chars with single ellipsis', () => {
    const word = 'lorem';
    const raw = (word + ' ').repeat(80).trim(); // 80 * 6 - 1 = 479 chars
    const result = extractDescription(raw)!;
    expect(result.endsWith('…')).toBe(true);
    expect(result.length).toBeLessThanOrEqual(200);
    // Last char before ellipsis must be a word char (no trailing space)
    expect(result[result.length - 2]).toMatch(/\w/);
    // No double-ellipsis
    expect(result.endsWith('……')).toBe(false);
  });

  it('collapses internal whitespace (multiple spaces, tabs, newlines within paragraph)', () => {
    const raw = 'Multi    spaces\tand\ttabs\nwithin one paragraph.';
    expect(extractDescription(raw)).toBe('Multi spaces and tabs within one paragraph.');
  });

  it('handles CRLF line endings identically to LF', () => {
    const lf = '## Description\n\nFirst paragraph.\n\nSecond paragraph.';
    const crlf = '## Description\r\n\r\nFirst paragraph.\r\n\r\nSecond paragraph.';
    expect(extractDescription(crlf)).toBe(extractDescription(lf));
    expect(extractDescription(crlf)).toBe('First paragraph.');
  });
});
