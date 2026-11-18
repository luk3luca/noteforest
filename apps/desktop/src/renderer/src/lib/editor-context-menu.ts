/**
 * One contextual menu model for the editor surfaces.
 *
 * The shell owns a single menu component; this module owns the target
 * classification, the text group (Cut/Copy/Paste/Select All), and the table
 * group. `openBlockMenu` composes them with the block menu, so a prose
 * right-click gets "everything", a card gets the block menu, a cell gets text +
 * table commands, and code/formula inputs get text only.
 *
 * Cut/Copy/Paste run the platform edit command on the focused webContents
 * through the preload bridge: rich text, the native undo stack, and the OS
 * clipboard stay correct. The target control and its selection are restored
 * before the command, so opening or focusing the menu never collapses a
 * selection. Read mode only exposes Copy and Select All.
 */

import type { Editor } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import type { MenuEntry } from '../state/shell';
import { useShell } from '../state/shell';
import {
  currentCellAlign,
  setColumnAlign,
  tableGfmAtSelection,
  type TableAlign,
} from '../editor/table-commands';
import { writeClipboardText } from './clipboard';
import { shortcutHint } from '../../../shared/shortcuts';

export type EditorContextSurface =
  | 'prose'
  | 'card'
  | 'cell'
  | 'code'
  | 'formula-source'
  | 'code-language';

/** Classify the right-click target inside one block card. */
export function classifyEditorContextTarget(target: Element | null): EditorContextSurface {
  if (target === null) return 'card';
  if (
    target.closest('[data-formula-source]') !== null ||
    target.closest('.nf-formula-source-editor') !== null
  ) {
    return 'formula-source';
  }
  if (target.closest('[data-code-language-input]') !== null) return 'code-language';
  if (target.closest('.nf-formula-node, .nf-image-node, [data-image-node]') !== null) {
    return 'card';
  }
  if (target.closest('td, th') !== null) return 'cell';
  if (target.closest('pre.nf-code-pre, .nf-code-content, pre') !== null) return 'code';
  if (target.closest('.nf-block-prose') !== null) return 'prose';
  return 'card';
}

export interface TextTargetSnapshot {
  /** The focused control: input/textarea or the editable host element. */
  element: HTMLElement | null;
  kind: 'input' | 'textarea' | 'contenteditable';
  editable: boolean;
  hasSelection: boolean;
  selectionStart: number | null;
  selectionEnd: number | null;
  range: Range | null;
  /** Select-All scope: the cell, code body, block prose, or the whole editor. */
  scope: HTMLElement | null;
  selectedText: string;
}

/**
 * A right-click on a native text control moves its caret to the click point
 * before `contextmenu` fires. Remember the selection on the right-button
 * mousedown so the menu acts on what the user had selected. Prose is not in
 * this map: a DOM range survives the right-click there.
 */
const rememberedSelections = new WeakMap<HTMLElement, { start: number; end: number }>();

export function rememberTextControlSelection(element: HTMLElement | null): void {
  if (element === null) return;
  const control =
    element instanceof HTMLInputElement
      ? element
      : element instanceof HTMLTextAreaElement
        ? element
        : null;
  if (control === null) return;
  rememberedSelections.set(control, {
    start: control.selectionStart ?? 0,
    end: control.selectionEnd ?? 0,
  });
}

function selectAllScope(target: Element): HTMLElement | null {
  const scope =
    target.closest<HTMLElement>('td, th') ??
    target.closest<HTMLElement>('pre.nf-code-pre, .nf-code-content') ??
    target.closest<HTMLElement>('.nf-block-prose') ??
    target.closest<HTMLElement>('.ProseMirror') ??
    target.closest<HTMLElement>('[contenteditable]');
  return scope;
}

function editableHost(target: Element): HTMLElement | null {
  return (
    target.closest<HTMLElement>('[contenteditable="true"]') ??
    target.closest<HTMLElement>('.ProseMirror') ??
    target.closest<HTMLElement>('[contenteditable]')
  );
}

/** Snapshot the control the user right-clicked; null when it is not a text target. */
export function captureTextTarget(target: Element | null): TextTargetSnapshot | null {
  if (target === null) return null;
  const formControl =
    target instanceof HTMLInputElement
      ? target
      : target instanceof HTMLTextAreaElement
        ? target
        : null;
  if (formControl !== null) {
    const remembered = rememberedSelections.get(formControl);
    if (remembered !== undefined) {
      // Put the pre-right-click selection back on the control itself: the
      // native right-click moved its caret, and the menu must neither show nor
      // act on that collapsed position.
      try {
        formControl.setSelectionRange(remembered.start, remembered.end);
      } catch {
        // Unsupported input types keep the remembered values for the action.
      }
    }
    const start = remembered?.start ?? formControl.selectionStart ?? 0;
    const end = remembered?.end ?? formControl.selectionEnd ?? 0;
    return {
      element: formControl,
      kind: formControl instanceof HTMLTextAreaElement ? 'textarea' : 'input',
      editable:
        !formControl.readOnly &&
        !formControl.disabled &&
        (formControl instanceof HTMLTextAreaElement || formControl.type !== 'hidden'),
      hasSelection: start !== end,
      selectionStart: start,
      selectionEnd: end,
      range: null,
      scope: formControl,
      selectedText: formControl.value.slice(Math.min(start, end), Math.max(start, end)),
    };
  }
  const host = editableHost(target);
  if (host === null) return null;
  const selection = window.getSelection();
  let range: Range | null = null;
  if (selection !== null && selection.rangeCount > 0) {
    const candidate = selection.getRangeAt(0);
    if (host.contains(candidate.commonAncestorContainer)) {
      range = candidate.cloneRange();
    }
  }
  return {
    element: host,
    kind: 'contenteditable',
    editable: host.isContentEditable,
    hasSelection: range !== null && !range.collapsed,
    selectionStart: null,
    selectionEnd: null,
    range,
    scope: selectAllScope(target),
    selectedText: range?.toString() ?? '',
  };
}

/** Put focus and the captured selection back before a command runs. */
export function restoreTextTarget(snapshot: TextTargetSnapshot): void {
  const element = snapshot.element;
  if (element === null) return;
  try {
    element.focus({ preventScroll: true });
  } catch {
    // A disconnected control cannot be focused; the command is then a no-op.
    return;
  }
  if (snapshot.kind === 'contenteditable') {
    const selection = window.getSelection();
    if (selection === null || snapshot.range === null) return;
    try {
      selection.removeAllRanges();
      selection.addRange(snapshot.range);
    } catch {
      // A stale range after a structural change keeps focus without selection.
    }
    return;
  }
  const control = element as HTMLInputElement | HTMLTextAreaElement;
  try {
    control.setSelectionRange(snapshot.selectionStart ?? 0, snapshot.selectionEnd ?? 0);
  } catch {
    // Some input types reject setSelectionRange; focus is still restored.
  }
}

function runNativeTextCommand(command: 'cut' | 'copy' | 'paste'): void {
  const bridge = window.noteforest;
  if (bridge !== undefined && typeof bridge.editTextCommand === 'function') {
    void bridge.editTextCommand(command);
    return;
  }
  document.execCommand(command);
}

function selectAllInTarget(snapshot: TextTargetSnapshot): void {
  const element = snapshot.element;
  if (element === null) return;
  if (snapshot.kind !== 'contenteditable') {
    element.focus({ preventScroll: true });
    (element as HTMLInputElement).select();
    return;
  }
  const scope = snapshot.scope ?? element;
  try {
    element.focus({ preventScroll: true });
  } catch {
    // Selecting a read-only region needs no focus.
  }
  const range = document.createRange();
  range.selectNodeContents(scope);
  const selection = window.getSelection();
  if (selection === null) return;
  selection.removeAllRanges();
  selection.addRange(range);
}

/** Run one text action against the captured control. */
export function runTextAction(
  snapshot: TextTargetSnapshot,
  action: 'cut' | 'copy' | 'paste' | 'selectAll',
): void {
  if (action === 'selectAll') {
    selectAllInTarget(snapshot);
    return;
  }
  if (!snapshot.editable) {
    // Read mode: Copy is the only text mutation-free action. Plain text keeps
    // it deterministic and never prompts for clipboard permission.
    if (action === 'copy' && snapshot.hasSelection) {
      void writeClipboardText(snapshot.selectedText);
    }
    return;
  }
  if (!snapshot.hasSelection && action !== 'paste') return;
  restoreTextTarget(snapshot);
  runNativeTextCommand(action);
}

function textEntry(
  id: string,
  label: string,
  shortcut: string | undefined,
  snapshot: TextTargetSnapshot,
  action: 'cut' | 'copy' | 'paste' | 'selectAll',
): MenuEntry {
  let disabled = false;
  if (action === 'cut') disabled = !snapshot.hasSelection || !snapshot.editable;
  else if (action === 'copy') disabled = !snapshot.hasSelection;
  else if (action === 'paste') disabled = !snapshot.editable;
  return {
    id,
    label,
    ...(shortcut === undefined ? {} : { shortcut }),
    disabled,
    ...(disabled ? {} : { onSelect: () => runTextAction(snapshot, action) }),
  };
}

/**
 * Text group. Read mode exposes Copy/Select All only; Cut and Paste imply an
 * editable target.
 */
export function textMenuEntries(
  snapshot: TextTargetSnapshot,
  options: { readOnly: boolean },
): MenuEntry[] {
  // The OS Edit roles own these keys; the hints come from the catalogue so the
  // menu and every other surface spell them once (K1).
  const copy = textEntry('text-copy', 'Copy', shortcutHint('text-copy'), snapshot, 'copy');
  const selectAll = textEntry(
    'text-select-all',
    'Select All',
    shortcutHint('text-select-all'),
    snapshot,
    'selectAll',
  );
  if (options.readOnly || !snapshot.editable) return [copy, selectAll];
  return [
    textEntry('text-cut', 'Cut', shortcutHint('text-cut'), snapshot, 'cut'),
    copy,
    textEntry('text-paste', 'Paste', shortcutHint('text-paste'), snapshot, 'paste'),
    selectAll,
  ];
}

export interface TableMenuContext {
  editor: Editor | null;
  /** ProseMirror position of the right-clicked cell, when resolvable. */
  cellPosition: number | null;
}

function findCellDepth(editor: Editor, position: number): number {
  const $pos = editor.state.doc.resolve(position);
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const name = $pos.node(depth).type.name;
    if (name === 'tableCell' || name === 'tableHeader') return depth;
  }
  return -1;
}

/**
 * Align the ProseMirror selection with the cell that was right-clicked when
 * the browser did not move it. This is a selection-only transaction: no
 * document mutation and no history entry. A selection already inside the same
 * cell is never collapsed.
 */
export function ensureCellSelection(
  editor: Editor | null,
  target: Element | null,
  x: number,
  y: number,
): number | null {
  if (editor === null || target === null) return null;
  const cell = target.closest('td, th');
  if (cell === null) return null;
  const coords = editor.view.posAtCoords({ left: x, top: y });
  if (coords === null) return null;
  const depth = findCellDepth(editor, coords.pos);
  if (depth < 0) return null;
  const $target = editor.state.doc.resolve(coords.pos);
  const targetStart = $target.before(depth);
  const { $from } = editor.state.selection;
  let currentCellStart: number | null = null;
  for (let current = $from.depth; current > 0; current -= 1) {
    const name = $from.node(current).type.name;
    if (name === 'tableCell' || name === 'tableHeader') {
      currentCellStart = $from.before(current);
      break;
    }
  }
  if (currentCellStart !== targetStart) {
    const selection = TextSelection.near($target, 1);
    const transaction = editor.state.tr.setSelection(selection);
    transaction.setMeta('addToHistory', false);
    editor.view.dispatch(transaction);
  }
  return coords.pos;
}

function tableRun(
  editor: Editor,
  cellPosition: number | null,
  run: (chain: ReturnType<Editor['chain']>) => void,
): void {
  const chain = editor.chain().focus();
  if (cellPosition !== null) chain.setTextSelection(cellPosition);
  run(chain);
}

function tableItem(
  editor: Editor | null,
  cellPosition: number | null,
  id: string,
  label: string,
  shortcut: string | undefined,
  action: 'row-above' | 'row-below' | 'row-delete' | 'column-left' | 'column-right' | 'column-delete',
): MenuEntry {
  if (editor === null) {
    return { id, label, disabled: true, ...(shortcut === undefined ? {} : { shortcut }) };
  }
  return {
    id,
    label,
    ...(shortcut === undefined ? {} : { shortcut }),
    onSelect: () => {
      tableRun(editor, cellPosition, (chain) => {
        if (action === 'row-above') chain.addRowBefore().run();
        else if (action === 'row-below') chain.addRowAfter().run();
        else if (action === 'row-delete') chain.deleteRow().run();
        else if (action === 'column-left') chain.addColumnBefore().run();
        else if (action === 'column-right') chain.addColumnAfter().run();
        else chain.deleteColumn().run();
      });
    },
  };
}

function alignItem(
  editor: Editor | null,
  cellPosition: number | null,
  align: TableAlign,
  current: TableAlign | null,
): MenuEntry {
  const label = `Align ${align}`;
  if (editor === null) return { id: `table-align-${align}`, label, disabled: true };
  return {
    id: `table-align-${align}`,
    label,
    checked: current === align,
    onSelect: () => {
      if (cellPosition !== null) {
        const selection = TextSelection.near(editor.state.doc.resolve(cellPosition), 1);
        const transaction = editor.state.tr.setSelection(selection);
        transaction.setMeta('addToHistory', false);
        editor.view.dispatch(transaction);
      }
      setColumnAlign(editor, align);
    },
  };
}

/**
 * Table commands for a cell. They are a compact group inside the same menu:
 * row/column insert/delete, alignment, and Copy as Markdown. Block structure
 * actions and image/table insertion never appear here.
 */
export function tableMenuEntries(context: TableMenuContext): MenuEntry[] {
  const { editor, cellPosition } = context;
  if (editor !== null && cellPosition !== null) {
    const current = currentCellAlign(editor);
    return [
      tableItem(editor, cellPosition, 'table-row-above', 'Insert row above', undefined, 'row-above'),
      tableItem(editor, cellPosition, 'table-row-below', 'Insert row below', undefined, 'row-below'),
      tableItem(editor, cellPosition, 'table-row-delete', 'Delete row', undefined, 'row-delete'),
      tableItem(editor, cellPosition, 'table-column-left', 'Insert column left', undefined, 'column-left'),
      tableItem(editor, cellPosition, 'table-column-right', 'Insert column right', undefined, 'column-right'),
      tableItem(editor, cellPosition, 'table-column-delete', 'Delete column', undefined, 'column-delete'),
      alignItem(editor, cellPosition, 'left', current),
      alignItem(editor, cellPosition, 'center', current),
      alignItem(editor, cellPosition, 'right', current),
      {
        id: 'table-copy-markdown',
        label: 'Copy as Markdown',
        onSelect: () => {
          if (cellPosition !== null) {
            const selection = TextSelection.near(editor.state.doc.resolve(cellPosition), 1);
            const transaction = editor.state.tr.setSelection(selection);
            transaction.setMeta('addToHistory', false);
            editor.view.dispatch(transaction);
          }
          const gfm = tableGfmAtSelection(editor);
          if (gfm !== null) void writeClipboardText(gfm);
        },
      },
    ];
  }
  const staticIds: Array<[string, string]> = [
    ['table-row-above', 'Insert row above'],
    ['table-row-below', 'Insert row below'],
    ['table-row-delete', 'Delete row'],
    ['table-column-left', 'Insert column left'],
    ['table-column-right', 'Insert column right'],
    ['table-column-delete', 'Delete column'],
    ['table-align-left', 'Align left'],
    ['table-align-center', 'Align center'],
    ['table-align-right', 'Align right'],
    ['table-copy-markdown', 'Copy as Markdown'],
  ];
  return staticIds.map(([id, label]) => ({ id, label, disabled: true }));
}

/** A text-only menu: code content, code language, and the formula source. */
export function openTextOnlyContextMenu(
  target: Element | null,
  anchor: { x: number; y: number },
  options: { onClose?: () => void } = {},
): boolean {
  const snapshot = captureTextTarget(target);
  if (snapshot === null) return false;
  const readOnly = !snapshot.editable;
  const returnFocus = snapshot.element;
  useShell
    .getState()
    .openContextMenu(anchor.x, anchor.y, textMenuEntries(snapshot, { readOnly }), {
      onClose: () => {
        options.onClose?.();
        // Escape/outside-close returns focus to the text control. A text
        // action already restored it; a newly opened menu owns focus now.
        requestAnimationFrame(() => {
          if (useShell.getState().contextMenu !== null) return;
          const active = document.activeElement;
          if (active !== null && active !== document.body) return;
          if (returnFocus !== null && returnFocus.isConnected) {
            returnFocus.focus({ preventScroll: true });
          }
        });
      },
    });
  return true;
}
