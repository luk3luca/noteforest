import { Extension } from '@tiptap/core';
import type { Editor } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { getEditorBindings } from './bindings';
import { backspaceAction } from '../lib/backspace';
import { visibleBlockIds } from '../lib/tree';

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

function blockBodyIsEmpty(editor: Editor): boolean {
  const depth = blockBodyDepth(editor);
  if (depth === null) return false;
  return editor.state.selection.$from.node(depth).textContent.trim().length === 0;
}

export const BranchKeymap = Extension.create({
  name: 'branchKeymap',
  priority: 1000,

  addKeyboardShortcuts() {
    const bindings = (): ReturnType<typeof getEditorBindings> => getEditorBindings(this.editor);

    const requestDelete = (blockId: string | null): boolean => {
      if (blockId === null) return false;
      const current = bindings();
      if (current === null) return false;
      current.requestDelete(blockId);
      return true;
    };

    return {
      // Enter stays a paragraph split inside the block; at the end of a
      // heading it creates a normal paragraph so a heading is never sticky.
      Enter: () => {
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
        this.editor.commands.setHardBreak();
        return true;
      },

      // ⌘⇧Return branches from the selected text (M3). With no text selection
      // it keeps the block-child path; Control+Enter stays the explicit child
      // shortcut and never changes.
      'Mod-Shift-Enter': () => {
        const editor = this.editor;
        const current = bindings();
        if (current === null) return false;
        const selection = editor.state.selection;
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
        const id = currentBlockId(this.editor);
        const current = bindings();
        if (id === null || current === null) return false;
        current.report(current.runtime.addSibling(id));
        return true;
      },

      // Control+Enter creates a child block.
      'Ctrl-Enter': () => {
        const id = currentBlockId(this.editor);
        const current = bindings();
        if (id === null || current === null) return false;
        current.report(current.runtime.addChild(id));
        return true;
      },

      // Tab is native indent in lists/code/tables/blockquotes; "make child"
      // only on a selected block, never while typing a normal paragraph. Every
      // other case returns false so the browser moves focus out of the editor
      // instead of trapping keyboard users inside the contenteditable body.
      Tab: () => {
        const editor = this.editor;
        if (inAtomicContext(editor)) return false;
        const selection = selectedBlock(editor);
        const current = bindings();
        if (selection === null || current === null) return false;
        const id = typeof selection.node.attrs['blockId'] === 'string' ? selection.node.attrs['blockId'] : null;
        if (id === null) return false;
        current.report(current.runtime.addChild(id));
        return true;
      },

      'Shift-Tab': () => {
        const editor = this.editor;
        if (inAtomicContext(editor)) return false;
        const selection = selectedBlock(editor);
        const current = bindings();
        if (selection === null || current === null) return false;
        const id = typeof selection.node.attrs['blockId'] === 'string' ? selection.node.attrs['blockId'] : null;
        if (id === null) return false;
        current.report(current.runtime.outdent(id));
        return true;
      },

      // Plain Backspace is never destructive for a block: an empty block stays
      // and the caret moves to the previous block. Tables and code keep the
      // native behavior (Backspace edits inside the cell / code line).
      Backspace: () => {
        const editor = this.editor;
        const id = currentBlockId(editor);
        const current = bindings();
        const depth = blockBodyDepth(editor);
        const { $from } = editor.state.selection;
        const ids =
          current === null ? [] : visibleBlockIds(current.runtime.document, current.runtime.collapsed);
        const index = id === null ? -1 : ids.indexOf(id);
        const action = backspaceAction({
          selectionEmpty: editor.state.selection.empty,
          atomic: inAtomicContext(editor),
          atBlockStart: depth !== null && $from.parentOffset === 0 && $from.index(depth) === 0,
          empty: blockBodyIsEmpty(editor),
          hasPrevious: index > 0,
        });
        if (action === 'native') return false;
        if (action === 'previous' && id !== null && current !== null) {
          const previous = ids[index - 1];
          if (previous !== undefined) current.runtime.focusBlock(previous, { at: 'end' });
        }
        return true;
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
        const id = currentBlockId(this.editor);
        const current = bindings();
        if (id === null || current === null) return false;
        current.reorder(id, -1);
        return true;
      },

      'Alt-ArrowDown': () => {
        const id = currentBlockId(this.editor);
        const current = bindings();
        if (id === null || current === null) return false;
        current.reorder(id, 1);
        return true;
      },
    };
  },
});
