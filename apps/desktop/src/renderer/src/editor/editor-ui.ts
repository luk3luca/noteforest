import { useCallback, useSyncExternalStore } from 'react';
import type { Editor } from '@tiptap/core';

interface UiState {
  selectedBlockId: string | null;
  version: number;
}

const states = new WeakMap<Editor, { state: UiState; listeners: Set<() => void> }>();

function stateFor(editor: Editor): { state: UiState; listeners: Set<() => void> } {
  let entry = states.get(editor);
  if (entry === undefined) {
    entry = { state: { selectedBlockId: null, version: 0 }, listeners: new Set() };
    states.set(editor, entry);
  }
  return entry;
}

export function setEditorSelectedBlock(editor: Editor, blockId: string | null): void {
  const entry = stateFor(editor);
  if (entry.state.selectedBlockId === blockId) return;
  entry.state = { selectedBlockId: blockId, version: entry.state.version + 1 };
  for (const listener of entry.listeners) listener();
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
