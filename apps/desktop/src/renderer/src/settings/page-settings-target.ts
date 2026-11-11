/**
 * Write identity for Page settings edits (UI Sentinel F2).
 *
 * A debounced or immediate Page settings write is started on one layer of one
 * document. `scopeRef`/`packagePathRef` describe the *current* Settings view,
 * which may change while a commit is awaiting or a debounce is pending. This
 * module captures the identity once and answers whether that identity is still
 * writable, so a tab or document change can never retarget the write.
 */

export type PageSettingsWriteScope = 'global' | 'document';

export interface PageSettingsWriteTarget {
  scope: PageSettingsWriteScope;
  /** Document the edit was made on; null when no document was open. */
  packagePath: string | null;
  /** Canonical document id captured with the path. */
  documentId: string | null;
}

/** Visible state when the target document closed before the write ran. */
export const PAGE_SETTINGS_TARGET_CLOSED_MESSAGE =
  'The document closed before this change was saved. Nothing was written.';

/** Snapshot the layer/document identity at the moment an edit starts. */
export function capturePageSettingsTarget(
  scope: PageSettingsWriteScope,
  packagePath: string | null,
  documentId: string | null,
): PageSettingsWriteTarget {
  return { scope, packagePath, documentId };
}

/**
 * A global target is always writable. A document-scoped target is gone when no
 * document was captured or the captured document is no longer open; writing
 * then would either fail half-way or land on whatever document is active now.
 */
export function pageSettingsTargetIsGone(
  target: PageSettingsWriteTarget,
  isOpen: (packagePath: string) => boolean,
): boolean {
  if (target.scope !== 'document') return false;
  if (target.packagePath === null) return true;
  return !isOpen(target.packagePath);
}
