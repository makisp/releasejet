export const CI_MARKER_START = '# --- ReleaseJet CI (managed by releasejet) ---';
export const CI_MARKER_END = '# --- End ReleaseJet CI ---';
export const DEFAULT_TAGS = ['short-duration'];

export function generateCiBlock(tags: string[]): string {
  const tagLines = tags.map((t) => `    - ${t}`).join('\n');
  return [
    CI_MARKER_START,
    'release-notes:',
    '  stage: deploy',
    '  image: node:20-alpine',
    '  rules:',
    '    - if: $CI_COMMIT_TAG',
    '  tags:',
    tagLines,
    '  before_script:',
    '    - npm install -g releasejet',
    '  script:',
    '    - releasejet generate --tag "$CI_COMMIT_TAG" --publish',
    CI_MARKER_END,
  ].join('\n');
}

export function hasCiBlock(content: string): boolean {
  const start = content.indexOf(CI_MARKER_START);
  const end = content.indexOf(CI_MARKER_END);
  return start !== -1 && end !== -1 && start < end;
}

export function appendCiBlock(existingContent: string, block: string): string {
  const trimmed = existingContent.trimEnd();
  if (trimmed.length === 0) return block + '\n';
  return trimmed + '\n\n' + block + '\n';
}

export function removeCiBlock(content: string): string {
  const startIdx = content.indexOf(CI_MARKER_START);
  const endIdx = content.indexOf(CI_MARKER_END);
  if (startIdx === -1 || endIdx === -1) return content;
  if (startIdx > endIdx) return content;

  const before = content.substring(0, startIdx);
  const after = content.substring(endIdx + CI_MARKER_END.length);

  const cleaned = (before + after).replace(/\n{3,}/g, '\n\n').trim();
  return cleaned;
}
