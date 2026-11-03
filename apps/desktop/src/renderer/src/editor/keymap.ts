import { Extension } from '@tiptap/core';
import type { Editor } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { getEditorBindings } from './bindings';

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

function inAtomicContext(editor: Editor): boolean {
  return (
    editor.isActive('codeBlock') ||
    editor.isActive('table') ||
    editor.isActive('listItem') ||
    editor.isActive('blockquote')
  );
}

function atEndOfBlockBody(editor: Editor): boolean {
  if (!editor.state.selection.empty) return false;
  if (inAtomicContext(editor)) return false;
  const depth = blockBodyDepth(editor);
  if (depth === null) return false;
  const { $from } = editor.state.selection;
  const body = $from.node(depth);
  if ($from.index(depth) !== body.childCount - 1) return false;
  const parent = $from.parent;
  if (parent.type.name !== 'paragraph' && parent.type.name !== 'heading') return false;
  return $from.parentOffset === parent.content.size;
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

    return {
      Enter: () => {
        const editor = this.editor;
        if (!atEndOfBlockBody(editor)) return false;
        const id = currentBlockId(editor);
        const current = bindings();
        if (id === null || current === null) return false;
        current.report(current.runtime.addSibling(id));
        return true;
      },

      Tab: () => {
        const editor = this.editor;
        if (editor.isActive('codeBlock') || editor.isActive('table')) return false;
        const id = currentBlockId(editor);
        const current = bindings();
        if (id === null || current === null) return false;
        current.report(current.runtime.addChild(id));
        return true;
      },

      'Shift-Tab': () => {
        const editor = this.editor;
        if (editor.isActive('codeBlock') || editor.isActive('table')) return false;
        const id = currentBlockId(editor);
        const current = bindings();
        if (id === null || current === null) return false;
        current.report(current.runtime.outdent(id));
        return true;
      },

      Backspace: () => {
        const editor = this.editor;
        if (!editor.state.selection.empty) return false;
        if (editor.isActive('codeBlock') || editor.isActive('table')) return false;
        const { $from } = editor.state.selection;
        if ($from.parentOffset !== 0) return false;
        const depth = blockBodyDepth(editor);
        if (depth === null || $from.index(depth) !== 0) return false;
        if (!blockBodyIsEmpty(editor)) return false;
        const id = currentBlockId(editor);
        const current = bindings();
        if (id === null || current === null) return false;
        if (Object.keys(current.runtime.document.blocks).length <= 1) return false;
        current.report(current.runtime.deleteBlock(id, 'promote'));
        return true;
      },

      'Mod-Enter': () => {
        const id = currentBlockId(this.editor);
        const current = bindings();
        if (id === null || current === null) return false;
        current.report(current.runtime.addChild(id));
        return true;
      },

      'Mod-Shift-Enter': () => {
        const id = currentBlockId(this.editor);
        const current = bindings();
        if (id === null || current === null) return false;
        current.report(current.runtime.addSibling(id));
        return true;
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
