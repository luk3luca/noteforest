/**
 * One user-visible undo/redo command over two history stacks.
 *
 * The preferred stack is the one that produced the last operation: text when
 * the user last typed (or undid/redid text), structural when the last command
 * added, removed, moved, or otherwise changed the document structure. When the
 * preferred stack is empty, the command falls back to the other stack exactly
 * once. It never loops between the two stacks and never performs two undos for
 * one user action.
 */

export type HistoryAction = 'undo' | 'redo';

export type HistoryKind = 'text' | 'structural';

export type LastHistoryOperation = HistoryKind | null;

export interface HistoryRouteInput {
  action: HistoryAction;
  /** What the last user-visible operation touched, if anything. */
  lastOperation: LastHistoryOperation;
  /** `editor.can().undo()` / `editor.can().redo()` for the text stack. */
  textAvailable: boolean;
  /** The runtime structural undo/redo stack. */
  structuralAvailable: boolean;
  /** With no previous operation, focus decides the default preference. */
  editorFocused: boolean;
}

export interface HistoryRoute {
  /** `null` when neither stack can perform the action. */
  kind: HistoryKind | null;
  /** True when the command had to use the non-preferred stack. */
  fallback: boolean;
}

/**
 * Text is the default for an editor that has focus; a command invoked from the
 * suite/sidebar without a previous edit prefers the structural stack. In both
 * cases an empty preferred stack falls back once to the other stack.
 */
export function chooseHistoryRoute(input: HistoryRouteInput): HistoryRoute {
  const preferred: HistoryKind =
    input.lastOperation ?? (input.editorFocused ? 'text' : 'structural');
  const preferredAvailable =
    preferred === 'text' ? input.textAvailable : input.structuralAvailable;
  if (preferredAvailable) return { kind: preferred, fallback: false };

  const other: HistoryKind = preferred === 'text' ? 'structural' : 'text';
  const otherAvailable = other === 'text' ? input.textAvailable : input.structuralAvailable;
  if (otherAvailable) return { kind: other, fallback: true };

  return { kind: null, fallback: false };
}
