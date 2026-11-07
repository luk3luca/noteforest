/**
 * Cross-document image clipboard (M3c3b4).
 *
 * Clipboard payload (v1): the standard ProseMirror HTML/text slice. A
 * NoteForest image always carries `data-asset-id` (the content-addressed
 * SHA-256 id) plus its alt text and optional dimensions; it never carries a
 * filesystem path. The source package path is a session-local sidecar captured
 * on copy, because a document may be closed between copy and paste.
 *
 * Paste rule:
 * - the destination already has the asset record -> keep `assetId` (same
 *   document paste and deduplicated re-paste);
 * - otherwise the pasted image starts as a placeholder with no `assetId` and
 *   an editor-only `clipboardAssetId`;
 * - the repair pass copies the verified bytes from the source package into the
 *   destination package through the main process, records the canonical asset,
 *   and only then writes `assetId` into the node;
 * - if the source is unavailable, the placeholder becomes a labeled
 *   `unavailable: "cross-document-copy"` image node. It never keeps a dangling
 *   asset id, and the alt text is preserved.
 *
 * The repair is deliberately asynchronous: import/hash/write happens in the
 * main process, while the editor buffer never contains an id that resolves only
 * in another package.
 */

import type { Editor } from '@tiptap/core';
import { allRuntimes } from '../state/registry';
import type { DocumentRuntime } from '../state/runtime';

/** Source package for the last image copy, keyed by content id. */
const copiedFrom = new Map<string, string>();

/** Editors with an in-flight repair; avoids duplicate imports on rapid paste. */
const repairing = new WeakSet<Editor>();

function imageAssetIdOf(node: { type: { name: string }; attrs: Record<string, unknown> }): string {
  if (node.type.name !== 'image') return '';
  const id = node.attrs['assetId'];
  return typeof id === 'string' ? id : '';
}

function pendingAssetIdOf(node: { type: { name: string }; attrs: Record<string, unknown> }): string {
  if (node.type.name !== 'image') return '';
  const id = node.attrs['clipboardAssetId'];
  return typeof id === 'string' ? id : '';
}

/**
 * Remember where the copied images came from. Called from the editor's `copy`
 * handler before ProseMirror serializes the selection. A non-image copy clears
 * the sidecar because the clipboard no longer holds those images.
 */
export function rememberCopiedImages(editor: Editor, packagePath: string): void {
  const ids = new Set<string>();
  try {
    const slice = editor.state.selection.content();
    slice.content.descendants((node) => {
      const id = imageAssetIdOf(node);
      if (id.length > 0) ids.add(id);
    });
  } catch {
    // A selection that cannot be serialized falls back to the open-document
    // lookup during paste.
  }
  copiedFrom.clear();
  for (const id of ids) copiedFrom.set(id, packagePath);
}

/** The source package for an asset: the copy sidecar, then any open document. */
export function sourcePackageForAsset(assetId: string): string | null {
  const remembered = copiedFrom.get(assetId);
  if (remembered !== undefined) return remembered;
  for (const runtime of allRuntimes()) {
    if (runtime.document.assets[assetId] !== undefined) return runtime.packagePath;
  }
  return null;
}

function pendingIds(doc: Editor['state']['doc']): string[] {
  const ids = new Set<string>();
  doc.descendants((node) => {
    const id = pendingAssetIdOf(node);
    if (id.length > 0) ids.add(id);
  });
  return [...ids].sort();
}

/**
 * Copy/record every pending pasted image, then update the editor nodes in one
 * transaction. Safe to call after any paste; it is a no-op when no image is
 * waiting for a cross-document import.
 */
export function scheduleImageClipboardRepair(
  runtime: DocumentRuntime,
  editor: Editor,
): void {
  if (repairing.has(editor)) return;
  repairing.add(editor);
  void (async () => {
    try {
      for (let pass = 0; pass < 3; pass += 1) {
        const ids = pendingIds(editor.state.doc);
        if (ids.length === 0) return;
        const resolved = new Map<string, string>();
        for (const id of ids) {
          if (runtime.document.assets[id] !== undefined) {
            resolved.set(id, id);
            continue;
          }
          if (!runtime.editable) continue;
          const source = sourcePackageForAsset(id);
          if (source === null || source === runtime.packagePath) continue;
          const copied = await window.noteforest.copyImageAsset(
            source,
            runtime.packagePath,
            id,
          );
          if (!copied.ok) continue;
          const recorded = await runtime.recordAsset(copied.asset);
          if (!recorded.ok) continue;
          resolved.set(id, copied.asset.id);
        }

        const tr = editor.state.tr;
        editor.state.doc.descendants((node, pos) => {
          const pending = pendingAssetIdOf(node);
          if (pending.length === 0) return;
          const assetId = resolved.get(pending);
          const attrs: Record<string, unknown> = {
            ...node.attrs,
            clipboardAssetId: null,
          };
          if (assetId === undefined) {
            // No bytes and no source: keep a labeled placeholder, never the id.
            attrs['assetId'] = null;
            attrs['unavailable'] = 'cross-document-copy';
          } else {
            attrs['assetId'] = assetId;
            attrs['unavailable'] = null;
          }
          tr.setNodeMarkup(pos, undefined, attrs);
        });
        if (tr.docChanged) editor.view.dispatch(tr);
      }
    } finally {
      repairing.delete(editor);
    }
  })();
}
