import { describe, it, expect } from 'vitest';
import { extractJiraTickets } from '../../src/core/jira-extractor.js';

describe('extractJiraTickets', () => {
  it('returns a single match', () => {
    expect(extractJiraTickets('Fix login (PROJ-1)', ['PROJ'])).toEqual(['PROJ-1']);
  });

  it('returns multiple matches in first-appearance order', () => {
    expect(extractJiraTickets('PROJ-1 and PROJ-2', ['PROJ'])).toEqual(['PROJ-1', 'PROJ-2']);
  });

  it('dedupes repeated IDs across the input (title+body join)', () => {
    expect(extractJiraTickets('PROJ-1\nsee also PROJ-1', ['PROJ'])).toEqual(['PROJ-1']);
  });

  it('respects the project allowlist (drops keys not on it)', () => {
    expect(extractJiraTickets('PROJ-1 and OTHER-9', ['PROJ'])).toEqual(['PROJ-1']);
  });

  it('rejects matches without a leading word boundary', () => {
    expect(extractJiraTickets('FOOPROJ-1', ['PROJ'])).toEqual([]);
  });

  it('matches PROJ-1 inside "PROJ-1.0" via trailing word boundary', () => {
    expect(extractJiraTickets('see PROJ-1.0', ['PROJ'])).toEqual(['PROJ-1']);
  });

  it('is case-sensitive — lowercase keys do not match', () => {
    expect(extractJiraTickets('proj-1', ['PROJ'])).toEqual([]);
  });

  it('returns [] for empty string', () => {
    expect(extractJiraTickets('', ['PROJ'])).toEqual([]);
  });

  it('handles multiple project keys in the allowlist', () => {
    expect(extractJiraTickets('PROJ-1 BUG-2', ['PROJ', 'BUG'])).toEqual(['PROJ-1', 'BUG-2']);
  });

  it('returns [] when projects allowlist is empty', () => {
    expect(extractJiraTickets('PROJ-1', [])).toEqual([]);
  });

  it('preserves first-appearance order across title-then-body join', () => {
    // Caller joins as "title\n(rawBody ?? '')". An ID appearing first in the body line
    // but earlier in the title should keep title-position priority.
    const input = 'Title with BUG-9\nBody mentions PROJ-1 then BUG-9 again';
    expect(extractJiraTickets(input, ['PROJ', 'BUG'])).toEqual(['BUG-9', 'PROJ-1']);
  });
});
