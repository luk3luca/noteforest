/**
 * The one mounted flat editor per Markdown path.
 *
 * Global ⌘Z/⇧⌘Z and the header buttons route through here: a Markdown tab has
 * no `DocumentRuntime`, so the forest history router cannot see it.
 */

import type { Editor } from '@tiptap/core';

const editors = new Map<string, Editor>();

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
