export function buildReleaseUrl(
  providerType: 'gitlab' | 'github',
  projectUrl: string,
  tagName: string,
): string {
  const base = projectUrl.replace(/\/+$/, '');
  const tag = encodeURIComponent(tagName);
  if (providerType === 'github') {
    return `${base}/releases/tag/${tag}`;
  }
  return `${base}/-/releases/${tag}`;
}
