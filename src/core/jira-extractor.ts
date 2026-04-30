/**
 * Extract Jira ticket IDs (e.g. "PROJ-123") from arbitrary text, restricted
 * to a project-key allowlist.
 *
 * - Case-sensitive: only uppercase keys match (Jira convention).
 * - Word-boundary anchored on both sides; "FOOPROJ-1" does not match.
 * - First-appearance order preserved; duplicates removed.
 * - Returns [] for empty input or empty allowlist.
 */
export function extractJiraTickets(text: string, projects: string[]): string[] {
  if (!text || projects.length === 0) return [];

  const escaped = projects.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`\\b(?:${escaped.join('|')})-\\d+\\b`, 'g');

  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of text.matchAll(re)) {
    const id = m[0];
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}
