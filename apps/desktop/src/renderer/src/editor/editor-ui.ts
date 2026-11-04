import { useCallback, useSyncExternalStore } from 'react';
import type { Editor } from '@tiptap/core';

interface UiState {
  selectedBlockId: string | null;
  /** One-shot request to start inline chapter-title editing. */
  focusChapterId: string | null;
  version: number;
}

const states = new WeakMap<Editor, { state: UiState; listeners: Set<() => void> }>();

function stateFor(editor: Editor): { state: UiState; listeners: Set<() => void> } {
  let entry = states.get(editor);
  if (entry === undefined) {
    entry = { state: { selectedBlockId: null, focusChapterId: null, version: 0 }, listeners: new Set() };
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

export function setEditorSelectedBlock(editor: Editor, blockId: string | null): void {
  update(editor, { selectedBlockId: blockId });
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
