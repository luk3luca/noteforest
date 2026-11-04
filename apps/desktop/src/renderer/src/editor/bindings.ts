import type { Editor } from '@tiptap/core';
import type { ApplyOutcome, DocumentRuntime } from '../state/runtime';

export interface MenuAnchor {
  x: number;
  y: number;
}

export interface EditorBindings {
  runtime: DocumentRuntime;
  openBlockMenu: (blockId: string, anchor: MenuAnchor) => void;
  openChapterMenu: (chapterId: string, anchor: MenuAnchor) => void;
  openLinkDialog: () => void;
  focusRelative: (blockId: string, direction: -1 | 1) => void;
  reorder: (blockId: string, direction: -1 | 1) => void;
  canReorder: (sourceId: string, targetId: string) => boolean;
  dropOnBlock: (sourceId: string, targetId: string, after: boolean) => void;
  setDragSource: (blockId: string | null) => void;
  dragSource: () => string | null;
  requestDelete: (blockId: string) => void;
  report: (outcome: Promise<ApplyOutcome | void>) => void;
  notify: (message: string, kind?: 'error' | 'info') => void;
}

const bindings = new WeakMap<Editor, EditorBindings>();

export function setEditorBindings(editor: Editor, value: EditorBindings): void {
  bindings.set(editor, value);
}

export function clearEditorBindings(editor: Editor): void {
  bindings.delete(editor);
}

export function getEditorBindings(editor: Editor): EditorBindings | null {
  return bindings.get(editor) ?? null;
}

let dragBlockId: string | null = null;

export function getDragBlockId(): string | null {
  return dragBlockId;
}

export function setDragBlockId(blockId: string | null): void {
  dragBlockId = blockId;
}
