import { describe, it, expect } from 'vitest';
import { validateNotificationTemplateSyntax } from '../../src/core/notification-template-validator.js';

describe('validateNotificationTemplateSyntax', () => {
  it('returns ok for a syntactically valid template', () => {
    const r = validateNotificationTemplateSyntax('Hello {{tagName}}');
    expect(r).toEqual({ ok: true });
  });

  it('returns ok for a template using helpers (helpers are not resolved here)', () => {
    const r = validateNotificationTemplateSyntax(
      '{{#if hasBreaking}}breaking{{/if}} {{categoryCount "New Features"}}',
    );
    expect(r).toEqual({ ok: true });
  });

  it('returns ok for an empty string (caller decides what to do)', () => {
    const r = validateNotificationTemplateSyntax('');
    expect(r).toEqual({ ok: true });
  });

  it('returns an error for an unclosed block', () => {
    const r = validateNotificationTemplateSyntax('{{#if foo}}never closed');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/Parse error|Expecting/i);
    }
  });

  it('returns an error for malformed mustaches', () => {
    const r = validateNotificationTemplateSyntax('Hello {{name');
    expect(r.ok).toBe(false);
  });
});
