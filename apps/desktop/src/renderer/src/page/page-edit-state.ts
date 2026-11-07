/**
 * One active Page Edit overlay per open document.
 *
 * Layout/mode switches, page navigation, and block selection live in the shell
 * actions and PageView, while the overlay owns the ProseMirror buffer. This
 * registry is the narrow bridge: an action can commit the active overlay before
 * it changes the view, so a keystroke is never lost and no second editor is
 * created. It holds no document content and never writes canonical data itself.
 */

/** Why a Page Edit overlay was asked to commit. */
export type PageEditCommitReason =
  | 'outside'
  | 'escape'
  | 'shortcut'
  | 'navigation'
  | 'layout'
  | 'mode'
  | 'block'
  | 'external';

export interface PageEditHandle {
  blockId: string;
  /**
   * Commit the active block. Resolves true when the overlay closed (including
   * an unchanged block), false when the command was rejected and the overlay
   * must stay open with the typed content.
   */
  commit: (reason: PageEditCommitReason) => Promise<boolean>;
}

const handles = new Map<string, PageEditHandle>();

/** Register the one active overlay for a document; returns an unregister function. */
export function registerPageEdit(
  packagePath: string,
  handle: PageEditHandle,
): () => void {
  handles.set(packagePath, handle);
  return () => {
    if (handles.get(packagePath) === handle) handles.delete(packagePath);
  };
}

/** Block currently edited in Page Edit, or null. */
export function pageEditBlockId(packagePath: string): string | null {
  return handles.get(packagePath)?.blockId ?? null;
}

/**
 * Commit the active Page Edit overlay before a view transition. No overlay (or
 * an overlay that already closed) resolves true, so every command path can call
 * this unconditionally.
 */
export async function commitPageEdit(packagePath: string): Promise<boolean> {
  const handle = handles.get(packagePath);
  if (handle === undefined) return true;
  return handle.commit('external');
}
