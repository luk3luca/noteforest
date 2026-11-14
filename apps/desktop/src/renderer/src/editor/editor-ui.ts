import { useCallback, useSyncExternalStore } from 'react';
import type { Editor } from '@tiptap/core';
import type { ImageAuthoringMode } from '../lib/image-anchor';
import type { InteractionMode } from '../../../shared/view-state';

/** Anchor-focused view state; never part of the canonical document. */
export interface EditorAnchorSelection {
  blockId: string;
  anchorId: string;
  branchId: string;
  targetBlockId: string;
}

/**
 * One image node waiting for a region/point drag. This is view state only:
 * opening or cancelling the authoring surface never touches the document.
 */
export interface EditorImageAuthoring {
  blockId: string;
  path: number[];
  mode: ImageAuthoringMode;
}

interface UiState {
  selectedBlockId: string | null;
  /** True while the block's prose owns a text caret, not a block selection. */
  editing: boolean;
  /** Edit/read interaction mode for the continuous editor (ADR-0007). */
  interactionMode: InteractionMode;
  selectedAnchor: EditorAnchorSelection | null;
  imageAuthoring: EditorImageAuthoring | null;
  /** One-shot request to start inline chapter-title editing. */
  focusChapterId: string | null;
  version: number;
}

const states = new WeakMap<Editor, { state: UiState; listeners: Set<() => void> }>();

function stateFor(editor: Editor): { state: UiState; listeners: Set<() => void> } {
  let entry = states.get(editor);
  if (entry === undefined) {
    entry = {
      state: {
        selectedBlockId: null,
        editing: false,
        interactionMode: 'edit',
        selectedAnchor: null,
        imageAuthoring: null,
        focusChapterId: null,
        version: 0,
      },
      listeners: new Set(),
    };
    states.set(editor, entry);
  }
  return entry;
}

function update(editor: Editor, patch: Partial<Omit<UiState, 'version'>>): void {
  const entry = stateFor(editor);
  let changed = false;
  for (const key of Object.keys(patch) as Array<keyof typeof patch>) {
    if (entry.state[key] !== patch[key]) changed = true;
  }
  if (!changed) return;
  entry.state = { ...entry.state, ...patch, version: entry.state.version + 1 };
  for (const listener of entry.listeners) listener();
}

export function setEditorSelectedBlock(
  editor: Editor,
  blockId: string | null,
  editing = false,
): void {
  update(editor, { selectedBlockId: blockId, editing: blockId === null ? false : editing });
}

export function setEditorSelectedAnchor(
  editor: Editor,
  selectedAnchor: EditorAnchorSelection | null,
): void {
  update(editor, { selectedAnchor });
}

/** Mirror the shell interaction mode into node views that own editing chrome. */
export function setEditorInteractionMode(editor: Editor, interactionMode: InteractionMode): void {
  update(editor, { interactionMode });
}

/**
 * Subscribe a plain DOM node view to the editor UI state. React node views use
 * `useEditorUi`; the code and formula node views are plain DOM and need the
 * same signal to close their own editors when the shell leaves Edit (F1).
 */
export function subscribeEditorUi(editor: Editor, listener: () => void): () => void {
  const entry = stateFor(editor);
  entry.listeners.add(listener);
  return () => {
    entry.listeners.delete(listener);
  };
}

export function setEditorImageAuthoring(
  editor: Editor,
  imageAuthoring: EditorImageAuthoring | null,
): void {
  update(editor, { imageAuthoring });
}

export function clearEditorImageAuthoring(editor: Editor): void {
  const entry = stateFor(editor);
  if (entry.state.imageAuthoring === null) return;
  update(editor, { imageAuthoring: null });
}

export function setEditorChapterFocus(editor: Editor, chapterId: string | null): void {
  update(editor, { focusChapterId: chapterId });
}

export function clearEditorChapterFocus(editor: Editor, chapterId: string): void {
  const entry = stateFor(editor);
  if (entry.state.focusChapterId !== chapterId) return;
  update(editor, { focusChapterId: null });
}

export function useEditorUi(editor: Editor): UiState {
  const subscribe = useCallback(
    (listener: () => void) => {
      const entry = stateFor(editor);
      entry.listeners.add(listener);
      return () => entry.listeners.delete(listener);
    },
    [editor],
  );
  const version = useSyncExternalStore(
    subscribe,
    () => stateFor(editor).state.version,
    () => 0,
  );
  const state = stateFor(editor).state;
  void version;
  return state;
}
