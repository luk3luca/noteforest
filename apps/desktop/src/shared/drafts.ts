/**
 * Draft document keys shared by the main process and the renderer.
 *
 * A draft is an in-memory document that has not materialized into a package
 * yet. It needs a stable document key for the renderer tab, the runtime
 * registry, and the IPC document commands, but it must never be mistaken for a
 * filesystem path: no package folder, lock, or recent entry exists until the
 * first real mutation.
 *
 * The key is opaque on purpose. The canonical document id is generated at
 * draft creation, so materialization changes the key/path but never identity.
 */

export const DRAFT_KEY_PREFIX = 'draft:';

/** Stable in-memory key for one draft session. */
export function draftKey(draftId: string): string {
  return `${DRAFT_KEY_PREFIX}${draftId}`;
}

/** The draft id encoded in a document key, or null for a real package path. */
export function draftIdFromKey(value: string | null | undefined): string | null {
  if (typeof value !== 'string' || !value.startsWith(DRAFT_KEY_PREFIX)) return null;
  const id = value.slice(DRAFT_KEY_PREFIX.length);
  return id.length > 0 ? id : null;
}

export function isDraftKey(value: string | null | undefined): boolean {
  return draftIdFromKey(value) !== null;
}
