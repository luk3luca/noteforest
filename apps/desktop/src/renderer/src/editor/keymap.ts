import { Extension } from '@tiptap/core';
import type { Editor } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import type { ResolvedPos } from '@tiptap/pm/model';
import { getEditorBindings } from './bindings';
import { backspaceAction } from '../lib/backspace';
import { arrowBoundaryAction, type ArrowBoundaryKey } from '../lib/arrow-boundary';
import { indentTarget, outdentTarget } from '../lib/indent';

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

function blockBodyDepth(editor: Editor): number | null {
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name === 'blockBody') return depth;
  }
  return null;
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
     * Plain arrows stay inside the block at its very start/end. Code blocks,
     * tables and a focused local text control (the formula source textarea)
     * keep the native path: those surfaces own their caret keys.
     *
     * The boundary is read from the live DOM caret, not only from the
     * ProseMirror state: Chromium moves the caret with a native shortcut
     * (⌘←/⌘→) before ProseMirror observes the selection change, and consuming
     * the next arrow against that stale state would trap the caret.
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
      if (selection instanceof NodeSelection) return false;
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
      let depth = -1;
      let atomic = false;
      for (let current = $from.depth; current > 0; current -= 1) {
        const name = $from.node(current).type.name;
        if (name === 'codeBlock' || name === 'table') atomic = true;
        if (name === 'blockBody' && depth < 0) depth = current;
      }
      if (depth < 0) return false;
      const body = $from.node(depth);
      const action = arrowBoundaryAction({
        key,
        selectionEmpty: domPoint !== null ? domPoint.isCollapsed : selection.empty,
        atomic,
        atBlockStart: $from.parentOffset === 0 && $from.index(depth) === 0,
        atBlockEnd:
          $from.parentOffset === $from.parent.content.size &&
          $from.index(depth) === body.childCount - 1,
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

      // ⌘⇧Return branches from the selected text (M3). With no text selection
      // it keeps the block-child path; Control+Enter stays the explicit child
      // shortcut and never changes.
      'Mod-Shift-Enter': () => {
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
      'Alt-Enter': () => {
        if (!canEdit()) return false;
        const id = currentBlockId(this.editor);
        const current = bindings();
        if (id === null || current === null) return false;
        current.report(current.runtime.addSibling(id));
        return true;
      },

      // Control+Enter creates a child block.
      'Ctrl-Enter': () => {
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
      Tab: () => {
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

      'Shift-Tab': () => {
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
      'Mod-Backspace': () => requestDelete(currentBlockId(this.editor)),

      // Delete only acts on a selected block node, never while editing text.
      Delete: () => {
        const selection = selectedBlock(this.editor);
        if (selection === null) return false;
        const id =
          typeof selection.node.attrs['blockId'] === 'string' ? selection.node.attrs['blockId'] : null;
        return requestDelete(id);
      },

      'Mod-.': () => {
        const id = currentBlockId(this.editor);
        const current = bindings();
        if (id === null || current === null) return false;
        current.report(current.runtime.toggleCollapse(id));
        return true;
      },

      'Mod-Shift-k': () => {
        if (!canEdit()) return false;
        bindings()?.openLinkDialog();
        return true;
      },

      Escape: () => {
        this.editor.commands.blur();
        return true;
      },

      'Mod-ArrowUp': () => {
        const id = currentBlockId(this.editor);
        const current = bindings();
        if (id === null || current === null) return false;
        current.focusRelative(id, -1);
        return true;
      },

      'Mod-ArrowDown': () => {
        const id = currentBlockId(this.editor);
        const current = bindings();
        if (id === null || current === null) return false;
        current.focusRelative(id, 1);
        return true;
      },

      'Alt-ArrowUp': () => {
        if (!canEdit()) return false;
        const id = currentBlockId(this.editor);
        const current = bindings();
        if (id === null || current === null) return false;
        current.reorder(id, -1);
        return true;
      },

      'Alt-ArrowDown': () => {
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
