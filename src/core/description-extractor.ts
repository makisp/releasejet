const MAX_LEN = 200;
const ELLIPSIS = '…';

/**
 * Extract a cleaned, short excerpt from a raw issue/PR body.
 *
 * Returns undefined when the input is missing or yields nothing usable
 * after cleaning.
 */
export function extractDescription(raw: string | null | undefined): string | undefined {
  if (raw == null) return undefined;
  let text = raw.replace(/\r\n/g, '\n');
  if (text.trim() === '') return undefined;

  // Strip leading HTML comments (one or many, possibly multi-line),
  // discarding any whitespace between/after them.
  text = text.replace(/^(?:\s*<!--[\s\S]*?-->\s*)+/, '');

  // Walk lines from the top, skipping blanks, ATX headers, and blockquote
  // lines. Find the first prose line.
  const lines = text.split('\n');
  let firstProseIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === '') continue;
    if (/^#{1,6}\s/.test(trimmed)) continue; // ATX header
    if (trimmed.startsWith('>')) continue;   // blockquote
    firstProseIdx = i;
    break;
  }
  if (firstProseIdx === -1) return undefined;

  // Take everything until the next blank line — first paragraph.
  const paraLines: string[] = [];
  for (let i = firstProseIdx; i < lines.length; i++) {
    if (lines[i].trim() === '') break;
    paraLines.push(lines[i]);
  }
  let paragraph = paraLines.join(' ').replace(/\s+/g, ' ').trim();
  if (paragraph === '') return undefined;

  // Truncate at last word boundary ≤ 199 chars, then append a single ellipsis.
  if (paragraph.length > MAX_LEN) {
    const slice = paragraph.slice(0, MAX_LEN - 1);
    const lastSpace = slice.lastIndexOf(' ');
    const cut = lastSpace > 0 ? slice.slice(0, lastSpace) : slice;
    paragraph = cut + ELLIPSIS;
  }

  return paragraph;
}
