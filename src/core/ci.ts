export const CI_MARKER_START = '# --- ReleaseJet CI (managed by releasejet) ---';
export const CI_MARKER_END = '# --- End ReleaseJet CI ---';
export const DEFAULT_TAGS = ['short-duration'];

const GITHUB_ACTIONS_PATH = '.github/workflows/release-notes.yml';
const GITLAB_CI_PATH = '.gitlab-ci.yml';

export { GITHUB_ACTIONS_PATH, GITLAB_CI_PATH };

interface CiOptions {
  pro?: boolean;
}

export function generateCiBlock(tags: string[], options?: CiOptions): string {
  const pro = options?.pro ?? false;
  const tagLines = tags.map((t) => `    - ${t}`).join('\n');

  const beforeScriptLines = pro
    ? [
        '  before_script:',
        '    - echo "@releasejet:registry=https://npm.releasejet.dev/" >> ~/.npmrc',
        '    - echo "//npm.releasejet.dev/:_authToken=${RELEASEJET_PRO_TOKEN}" >> ~/.npmrc',
        '    - npm install -g @makispps/releasejet @releasejet/pro',
      ]
    : [
        '  before_script:',
        '    - npm install -g @makispps/releasejet',
      ];

  return [
    CI_MARKER_START,
    'release-notes:',
    '  stage: deploy',
    '  image: node:20-alpine',
    '  rules:',
    '    - if: $CI_COMMIT_TAG',
    '  tags:',
    tagLines,
    ...beforeScriptLines,
    '  script:',
    '    - releasejet generate --tag "$CI_COMMIT_TAG" --publish',
    CI_MARKER_END,
  ].join('\n');
}

export function generateGitHubActionsTemplate(options?: CiOptions): string {
  const pro = options?.pro ?? false;

  const registryStep = pro
    ? `      - name: Configure Pro registry
        run: |
          echo "@releasejet:registry=https://npm.releasejet.dev/" >> ~/.npmrc
          echo "//npm.releasejet.dev/:_authToken=\${RELEASEJET_PRO_TOKEN}" >> ~/.npmrc
        env:
          RELEASEJET_PRO_TOKEN: \${{ secrets.RELEASEJET_PRO_TOKEN }}
`
    : '';

  const installPackage = pro
    ? '@makispps/releasejet @releasejet/pro'
    : '@makispps/releasejet';

  return `name: Release Notes
on:
  push:
    tags:
      - '**'
jobs:
  release-notes:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
${registryStep}      - run: npm install -g ${installPackage}
      - run: releasejet generate --tag "\${{ github.ref_name }}" --publish
        env:
          RELEASEJET_TOKEN: \${{ secrets.RELEASEJET_TOKEN }}
`;
}

export function hasProLines(content: string): boolean {
  return content.includes('npm.releasejet.dev') || content.includes('@releasejet/pro');
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
