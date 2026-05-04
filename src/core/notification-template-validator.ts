import Handlebars from 'handlebars';

export type ValidationResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Syntax-only Handlebars parse. Surfaces parse errors (unclosed blocks,
 * malformed mustaches, etc.) without resolving helpers — helpers are
 * registered on the Pro plugin's isolated Handlebars instance and are not
 * visible to this core-side validator. That's by design: `validate` shouldn't
 * fail because a Pro-only helper isn't loaded.
 *
 * Uses Handlebars.parse() rather than compile(): in 4.7.x compile is lenient
 * about unclosed blocks (errors only surface when the delegate is invoked),
 * while parse() throws synchronously on the same input. parse() runs the same
 * AST checks the Pro plugin's compile path will hit at register-time.
 */
export function validateNotificationTemplateSyntax(source: string): ValidationResult {
  try {
    Handlebars.parse(source);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
