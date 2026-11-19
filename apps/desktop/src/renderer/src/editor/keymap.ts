import { Extension } from '@tiptap/core';
import type { Editor } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import type { ResolvedPos } from '@tiptap/pm/model';
import { getEditorBindings } from './bindings';
import { toggleLastHighlight } from './highlight-mark';
import { backspaceAction } from '../lib/backspace';
import {
  arrowBoundaryAction,
  visualLineBands,
  visualLineBoundary,
  type ArrowBoundaryKey,
  type ArrowVisualLine,
  type VerticalBounds,
} from '../lib/arrow-boundary';
import { indentTarget, outdentTarget } from '../lib/indent';
import { tiptapKeys } from '../../../shared/shortcuts';

/**
 * The TipTap spellings come from the shortcut catalogue, never from a literal:
 * a renamed binding fails the catalogue tests instead of drifting away from the
 * displayed list. Plain text keys (arrows, Backspace, Shift-Enter, Escape) stay
 * literal here on purpose: they are editor behaviour, not application verbs.
 */
function tipTapKey(id: string): string {
  const keys = tiptapKeys(id);
  const key = keys[0];
  if (key === undefined) throw new Error(`Shortcut ${id} has no TipTap key.`);
  return key;
}

function blockIdAt($pos: ResolvedPos): string | null {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    if (node.type.name === 'branchBlock') {
      return typeof node.attrs['blockId'] === 'string' ? node.attrs['blockId'] : null;
    }
  }
  return null;
}

function currentBlockId(editor: Editor): string | null {
  const selection = editor.state.selection;
  if (selection instanceof NodeSelection && selection.node.type.name === 'branchBlock') {
    return typeof selection.node.attrs['blockId'] === 'string' ? selection.node.attrs['blockId'] : null;
  }
  const { $from } = selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === 'branchBlock') {
      return typeof node.attrs['blockId'] === 'string' ? node.attrs['blockId'] : null;
    }
  }
  return null;
}

/** Depth of the nearest `blockBody` ancestor of a position, or -1. */
function blockBodyDepthAt($pos: ResolvedPos): number {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).type.name === 'blockBody') return depth;
  }
  return -1;
}

function blockBodyDepth(editor: Editor): number | null {
  const depth = blockBodyDepthAt(editor.state.selection.$from);
  return depth < 0 ? null : depth;
}

/** A code block or table ancestor: those surfaces own their caret keys. */
function atomicBlockAt($pos: ResolvedPos): boolean {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const name = $pos.node(depth).type.name;
    if (name === 'codeBlock' || name === 'table') return true;
  }
  return false;
}

/**
 * The caret box and the block content's visual lines, read from the live DOM.
 *
 * The ProseMirror state can lag a native caret move (⌘←/⌘→), so the caller
 * resolves the DOM caret to a position and passes it here; the geometry comes
 * from that position, never from the stale state. `null` means "not measured":
 * the offset boundary stays in charge.
 */
function visualLineAt(editor: Editor, $from: ResolvedPos): ArrowVisualLine | null {
  const dom = window.getSelection();
  const anchor = dom !== null && dom.rangeCount > 0 ? dom.anchorNode : null;
  if (anchor === null) return null;
  const element = anchor instanceof HTMLElement ? anchor : anchor.parentElement;
  const content = element?.closest<HTMLElement>('.nf-block-prose') ?? null;
  if (content === null) return null;
  const caret = caretBox(editor, $from);
  if (caret === null) return null;
  const bands = visualLineBands(contentLineRects(content));
  if (bands.length === 0) return null;
  const line = visualLineBoundary(caret, bands);
  // No measured line and no boundary is the same outcome as the offset check;
  // returning null keeps the offset boundary authoritative when geometry and
  // document disagree.
  return line.atFirstLine || line.atLastLine ? line : null;
}

/** The caret box at a document position, or the live DOM caret as fallback. */
function caretBox(editor: Editor, $from: ResolvedPos): VerticalBounds | null {
  try {
    const coords = editor.view.coordsAtPos($from.pos);
    if (coords.bottom > coords.top) return coords;
  } catch {
    // A position the view cannot measure keeps the offset boundary.
  }
  const dom = window.getSelection();
  if (dom === null || dom.rangeCount === 0) return null;
  const rect = dom.getRangeAt(0).getBoundingClientRect();
  return rect.height > 0 ? rect : null;
}

/**
 * The visual lines of one block body: every text line plus one box for a child
 * that renders no text (an empty paragraph, a block formula, an image). Only
 * the prose is measured: the chrome layers sit beside it and never count as a
 * line.
 */
function contentLineRects(content: HTMLElement): VerticalBounds[] {
  const rects: VerticalBounds[] = [];
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if (node.nodeValue === null || node.nodeValue.length === 0) continue;
    range.selectNodeContents(node);
    for (const rect of range.getClientRects()) {
      if (rect.height > 0) rects.push(rect);
    }
  }
  for (const child of content.children) {
    if (!(child instanceof HTMLElement)) continue;
    const box = child.getBoundingClientRect();
    if (box.height <= 0) continue;
    const childRange = document.createRange();
    childRange.selectNodeContents(child);
    if (childRange.getClientRects().length === 0) rects.push(box);
  }
  return rects;
}

/** Contexts where the native editor keymap owns Tab/Backspace. */
function inAtomicContext(editor: Editor): boolean {
  return (
    editor.isActive('codeBlock') ||
    editor.isActive('table') ||
    editor.isActive('listItem') ||
    editor.isActive('blockquote')
  );
}

function selectedBlock(editor: Editor): NodeSelection | null {
  const selection = editor.state.selection;
  return selection instanceof NodeSelection && selection.node.type.name === 'branchBlock'
    ? selection
    : null;
}

export const BranchKeymap = Extension.create({
  name: 'branchKeymap',
  priority: 1000,

  addKeyboardShortcuts() {
    const bindings = (): ReturnType<typeof getEditorBindings> => getEditorBindings(this.editor);
    // Continuous Read keeps the ProseMirror surface mounted and focusable, so
    // mutating shortcuts must opt in explicitly; navigation and collapse stay
    // available.
    const canEdit = (): boolean => this.editor.isEditable;

    const requestDelete = (blockId: string | null): boolean => {
      if (!canEdit() || blockId === null) return false;
      const current = bindings();
      if (current === null) return false;
      current.requestDelete(blockId);
      return true;
    };

    /**
     * Plain arrows stay inside the block at its first/last visual line. Code
     * blocks, tables and a focused local text control (the formula source
     * textarea) keep the native path: those surfaces own their caret keys.
     *
     * The boundary is read from the live DOM caret, not only from the
     * ProseMirror state: Chromium moves the caret with a native shortcut
     * (⌘←/⌘→) before ProseMirror observes the selection change, and consuming
     * the next arrow against that stale state would trap the caret. The
     * vertical boundary is the visual line, so a mid-word caret on the first or
     * last line is still inside the block.
     */
    const arrowStays = (key: ArrowBoundaryKey): boolean => {
      if (!canEdit()) return false;
      const active = document.activeElement;
      if (
        active instanceof HTMLElement &&
        (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')
      ) {
        return false;
      }
      const editor = this.editor;
      const selection = editor.state.selection;
      // A selected node is not a caret: from a formula at the block end the
      // native key leaves the block. Code blocks and tables own their keys; an
      // atom is only guarded here, never converted to its source text or moved.
      if (selection instanceof NodeSelection) {
        const nodeName = selection.node.type.name;
        if (atomicBlockAt(selection.$from) || nodeName === 'codeBlock' || nodeName === 'table') {
          return false;
        }
        const depth = blockBodyDepthAt(selection.$from);
        if (depth < 0) return false;
        const action = arrowBoundaryAction({
          key,
          // A node selection is not a text selection, but its end is still the
          // block's boundary. The start stays native so the key collapses the
          // selection inside the block instead of trapping it.
          selectionEmpty: true,
          atomic: false,
          atBlockStart: false,
          atBlockEnd: selection.from + selection.node.nodeSize === selection.$from.end(depth),
        });
        return action === 'stay';
      }
      const dom = window.getSelection();
      const domPoint =
        dom !== null &&
        dom.rangeCount > 0 &&
        dom.anchorNode !== null &&
        editor.view.dom.contains(dom.anchorNode)
          ? dom
          : null;
      if (domPoint !== null && !domPoint.isCollapsed) return false;
      let $from = selection.$from;
      if (domPoint !== null) {
        try {
          const domResolved = editor.state.doc.resolve(
            editor.view.posAtDOM(domPoint.anchorNode as Node, domPoint.anchorOffset),
          );
          // The browser caret is the visible truth. If it is in another block
          // than the editor state (a click or a menu focus the state has not
          // observed yet), let the native key move it: consuming at a boundary
          // read from the stale block would trap the caret.
          if (blockIdAt(domResolved) !== blockIdAt(selection.$from)) return false;
          $from = domResolved;
        } catch {
          // A DOM point that does not map to the document keeps the state.
        }
      }
      const depth = blockBodyDepthAt($from);
      if (depth < 0) return false;
      const body = $from.node(depth);
      const atomic = atomicBlockAt($from);
      // A table or code line owns its keys; never measure its (possibly long)
      // content just to hand the key back.
      const line =
        !atomic && (key === 'ArrowUp' || key === 'ArrowDown')
          ? visualLineAt(editor, $from)
          : null;
      const action = arrowBoundaryAction({
        key,
        selectionEmpty: domPoint !== null ? domPoint.isCollapsed : selection.empty,
        atomic,
        atBlockStart: $from.parentOffset === 0 && $from.index(depth) === 0,
        atBlockEnd:
          $from.parentOffset === $from.parent.content.size &&
          $from.index(depth) === body.childCount - 1,
        atFirstLine: line?.atFirstLine,
        atLastLine: line?.atLastLine,
      });
      return action === 'stay';
    };

    return {
      // Plain arrow keys never leave the active block; the native path still
      // handles every in-block caret move. ⌘↑/⌘↓, click and the outline remain
      // the block navigation.
      ArrowUp: () => arrowStays('ArrowUp'),
      ArrowDown: () => arrowStays('ArrowDown'),
      ArrowLeft: () => arrowStays('ArrowLeft'),
      ArrowRight: () => arrowStays('ArrowRight'),

      // Enter stays a paragraph split inside the block; at the end of a
      // heading it creates a normal paragraph so a heading is never sticky.
      Enter: () => {
        if (!canEdit()) return false;
        const editor = this.editor;
        if (!editor.state.selection.empty) return false;
        if (inAtomicContext(editor)) return false;
        const { $from } = editor.state.selection;
        const parent = $from.parent;
        if (parent.type.name !== 'heading') return false;
        if ($from.parentOffset !== parent.content.size) return false;
        const paragraph = editor.state.schema.nodes['paragraph'];
        if (paragraph === undefined) return false;
        const transaction = editor.state.tr;
        if (parent.content.size === 0) {
          transaction.setNodeMarkup($from.before(), paragraph, {});
          editor.view.dispatch(transaction.scrollIntoView());
          return true;
        }
        editor.chain().splitBlock().run();
        const after = editor.state.selection.$from;
        if (after.parent.type.name === 'heading') {
          const conversion = editor.state.tr;
          conversion.setNodeMarkup(after.before(), paragraph, {});
          editor.view.dispatch(conversion.scrollIntoView());
        }
        return true;
      },

      // Shift+Enter is the hard line break, not a new block.
      'Shift-Enter': () => {
        if (!canEdit()) return false;
        this.editor.commands.setHardBreak();
        return true;
      },

      // ⇧⌘Return branches from the selected text (M3). With no text selection
      // it keeps the block-child path; Control+Enter stays the explicit child
      // shortcut and never changes.
      [tipTapKey('branch-from-selection')]: () => {
        if (!canEdit()) return false;
        const editor = this.editor;
        const current = bindings();
        if (current === null) return false;
        const selection = editor.state.selection;
        if (
          selection instanceof NodeSelection &&
          (selection.node.type.name === 'inlineMath' ||
            selection.node.type.name === 'blockMath' ||
            selection.node.type.name === 'codeBlock')
        ) {
          current.branchFromSelection();
          return true;
        }
        if (!selection.empty && !(selection instanceof NodeSelection)) {
          current.branchFromSelection();
          return true;
        }
        const id = currentBlockId(editor);
        if (id === null) return false;
        current.report(current.runtime.addChild(id));
        return true;
      },

      // Option+Enter creates a sibling block.
      [tipTapKey('add-sibling')]: () => {
        if (!canEdit()) return false;
        const id = currentBlockId(this.editor);
        const current = bindings();
        if (id === null || current === null) return false;
        current.report(current.runtime.addSibling(id));
        return true;
      },

      // Control+Enter creates a child block.
      [tipTapKey('add-child')]: () => {
        if (!canEdit()) return false;
        const id = currentBlockId(this.editor);
        const current = bindings();
        if (id === null || current === null) return false;
        current.report(current.runtime.addChild(id));
        return true;
      },

      // Tab is native indent in lists/code/tables/blockquotes. On a selected
      // block it is the structural Indent: become the last child of the
      // previous primary sibling (the same block.move path as the menu and
      // palette). Every other case returns false so the browser moves focus out
      // of the editor instead of trapping keyboard users inside the body.
      [tipTapKey('indent')]: () => {
        if (!canEdit()) return false;
        const editor = this.editor;
        if (inAtomicContext(editor)) return false;
        const selection = selectedBlock(editor);
        const current = bindings();
        if (selection === null || current === null) return false;
        const id = typeof selection.node.attrs['blockId'] === 'string' ? selection.node.attrs['blockId'] : null;
        if (id === null) return false;
        const check = indentTarget(current.runtime.document, id);
        if (!check.ok) {
          current.notify(check.reason, 'info');
          return true;
        }
        current.report(current.runtime.indent(id));
        return true;
      },

      [tipTapKey('outdent')]: () => {
        if (!canEdit()) return false;
        const editor = this.editor;
        if (inAtomicContext(editor)) return false;
        const selection = selectedBlock(editor);
        const current = bindings();
        if (selection === null || current === null) return false;
        const id = typeof selection.node.attrs['blockId'] === 'string' ? selection.node.attrs['blockId'] : null;
        if (id === null) return false;
        const check = outdentTarget(current.runtime.document, id);
        if (!check.ok) {
          current.notify(check.reason, 'info');
          return true;
        }
        current.report(current.runtime.outdent(id));
        return true;
      },

      // Plain Backspace never leaves the active block: at its very start the
      // key is swallowed (empty blocks stay; no cross-block join) and every
      // other position keeps the native editor keymap. Tables, code, lists and
      // blockquotes stay native so Backspace edits inside them.
      Backspace: () => {
        const editor = this.editor;
        const depth = blockBodyDepth(editor);
        const selection = editor.state.selection;
        const { $from } = selection;
        const action = backspaceAction({
          // NodeSelection.empty is true; only a real collapsed caret counts.
          selectionEmpty: selection.empty && !(selection instanceof NodeSelection),
          atomic: inAtomicContext(editor),
          atBlockStart: depth !== null && $from.parentOffset === 0 && $from.index(depth) === 0,
        });
        return action === 'stay';
      },

      // ⌘Backspace deletes the active block (confirmation when it has
      // children). It is the only keyboard path to block deletion.
      [tipTapKey('delete-block')]: () => requestDelete(currentBlockId(this.editor)),

      // Delete only acts on a selected block node, never while editing text.
      [tipTapKey('delete-block-selected')]: () => {
        const selection = selectedBlock(this.editor);
        if (selection === null) return false;
        const id =
          typeof selection.node.attrs['blockId'] === 'string' ? selection.node.attrs['blockId'] : null;
        return requestDelete(id);
      },

      [tipTapKey('collapse')]: () => {
        const id = currentBlockId(this.editor);
        const current = bindings();
        if (id === null || current === null) return false;
        current.report(current.runtime.toggleCollapse(id));
        return true;
      },

      [tipTapKey('link')]: () => {
        if (!canEdit()) return false;
        bindings()?.openLinkDialog();
        return true;
      },

      // ⇧⌘H is the highlighter's only chord: apply the session's last tone, or
      // remove it when the whole selection already carries it. It never runs in
      // Read mode (the keymap is gated by `canEdit`), and a caret is a no-op.
      [tipTapKey('highlight')]: () => {
        if (!canEdit()) return false;
        return toggleLastHighlight(this.editor);
      },

      Escape: () => {
        this.editor.commands.blur();
        return true;
      },

      [tipTapKey('block-previous')]: () => {
        const id = currentBlockId(this.editor);
        const current = bindings();
        if (id === null || current === null) return false;
        current.focusRelative(id, -1);
        return true;
      },

      [tipTapKey('block-next')]: () => {
        const id = currentBlockId(this.editor);
        const current = bindings();
        if (id === null || current === null) return false;
        current.focusRelative(id, 1);
        return true;
      },

      [tipTapKey('block-move-up')]: () => {
        if (!canEdit()) return false;
        const id = currentBlockId(this.editor);
        const current = bindings();
        if (id === null || current === null) return false;
        current.reorder(id, -1);
        return true;
      },

      [tipTapKey('block-move-down')]: () => {
        if (!canEdit()) return false;
        const id = currentBlockId(this.editor);
        const current = bindings();
        if (id === null || current === null) return false;
        current.reorder(id, 1);
        return true;
      },
    };
  },
});
