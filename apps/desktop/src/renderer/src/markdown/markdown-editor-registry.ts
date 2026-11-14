/**
 * The one mounted flat editor per Markdown path.
 *
 * Global ⌘Z/⇧⌘Z and the header buttons route through here: a Markdown tab has
 * no `DocumentRuntime`, so the forest history router cannot see it.
 */

import type { Editor } from '@tiptap/core';

const editors = new Map<string, Editor>();

/**
 * Flat guest editors. The shared formula node view uses this to hide the
 * "Branch from term" action: a Markdown file has no blocks or anchors, so that
 * control would be a dead end. A `WeakSet` keeps the marker with the editor
 * instance (no path bookkeeping, no leak after unmount).
 */
const flatEditors = new WeakSet<Editor>();

export function markFlatMarkdownEditor(editor: Editor): void {
  flatEditors.add(editor);
}

export function isFlatMarkdownEditor(editor: Editor): boolean {
  return flatEditors.has(editor);
}

export function registerMarkdownEditor(path: string, editor: Editor): void {
  editors.set(path, editor);
}

export function unregisterMarkdownEditor(path: string, editor: Editor): void {
  if (editors.get(path) === editor) editors.delete(path);
}

export function markdownEditor(path: string | null | undefined): Editor | null {
  if (path === null || path === undefined) return null;
  return editors.get(path) ?? null;
}

export function markdownHistory(path: string | null | undefined, action: 'undo' | 'redo'): boolean {
  const editor = markdownEditor(path);
  if (editor === null || !editor.isEditable) return false;
  return action === 'undo' ? editor.commands.undo() : editor.commands.redo();
}
