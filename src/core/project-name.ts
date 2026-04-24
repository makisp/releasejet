export function deriveProjectName(projectUrl: string): string | undefined {
  if (!projectUrl) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(projectUrl);
  } catch {
    return undefined;
  }
  const path = parsed.pathname.replace(/\/+$/, '');
  if (!path) return undefined;
  const last = path.slice(path.lastIndexOf('/') + 1);
  if (!last) return undefined;
  return last.endsWith('.git') ? last.slice(0, -'.git'.length) : last;
}
