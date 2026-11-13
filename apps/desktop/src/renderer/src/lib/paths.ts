/**
 * Renderer-safe path containment. The main process remains the authority for
 * library membership; this helper only decides which known library a tab path
 * belongs to for the active-library follow rule (LD-03).
 */
function normalizePath(value: string): string {
  const slashed = value.replace(/\\/g, '/');
  const trimmed = slashed.replace(/\/+$/, '');
  return trimmed.length === 0 ? '/' : trimmed;
}

export function isPathInside(root: string, candidate: string): boolean {
  const normalizedRoot = normalizePath(root);
  const normalizedCandidate = normalizePath(candidate);
  if (normalizedRoot === '/') return normalizedCandidate.startsWith('/');
  return (
    normalizedCandidate === normalizedRoot ||
    normalizedCandidate.startsWith(`${normalizedRoot}/`)
  );
}
