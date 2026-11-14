import { Bold, Code, GitBranch, Italic, Link2, Sigma } from 'lucide-react';
import { BubbleMenu } from '@tiptap/react/menus';
import type { Editor } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getEditorBindings } from './bindings';
import { useShell } from '../state/shell';

interface ToolbarProps {
  editor: Editor;
  /**
   * `markdown` hides forest-only actions (branch from selection) and the math
   * dialog, which targets a NoteForest block. The formatting/link controls and
   * the bubble behavior are the same surface.
   */
  variant?: 'forest' | 'markdown';
}

/** Formula atoms own their actions in the source-editor row, not here. */
const FORMULA_NODE_TYPES = new Set(['inlineMath', 'blockMath', 'mathBlock']);

export function SelectionToolbar({ editor, variant = 'forest' }: ToolbarProps): JSX.Element {
  const [linkOpen, setLinkOpen] = useState(false);
  const [href, setHref] = useState('');

  const resetLink = useCallback((): void => {
    setLinkOpen(false);
    setHref('');
  }, []);

  // A new selection always starts from the buttons: the previous link form is
  // stale target state and must not survive the bubble hiding or a move.
  useEffect(() => {
    editor.on('selectionUpdate', resetLink);
    return () => {
      editor.off('selectionUpdate', resetLink);
    };
  }, [editor, resetLink]);

  const menuOptions = useMemo(() => ({ onHide: resetLink }), [resetLink]);

  const openLink = (): void => {
    setHref(String(editor.getAttributes('link')['href'] ?? ''));
    setLinkOpen(true);
  };

  const applyLink = (): void => {
    const value = href.trim();
    if (value.length === 0) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: value }).run();
    }
    setLinkOpen(false);
  };

  return (
    <BubbleMenu
      editor={editor}
      className="nf-bubble"
      data-testid="selection-toolbar"
      options={menuOptions}
      // The table owns its own contextual toolbar; a cell selection must not
      // stack both bubbles. The default "non-empty selection" rule stays.
      // A formula NodeSelection is owned by the formula action row, and an open
      // formula source editor must keep the textarea focus and its caret.
      shouldShow={({ editor: current, state }) => {
        if (!current.isEditable || state.selection.empty) return false;
        const selection = state.selection;
        if (selection instanceof NodeSelection && FORMULA_NODE_TYPES.has(selection.node.type.name)) {
          return false;
        }
        if (current.view.dom.querySelector('.nf-formula-node-editing') !== null) return false;
        return !current.isActive('table');
      }}
    >
      {linkOpen ? (
        <form
          className="nf-bubble-link"
          onSubmit={(event) => {
            event.preventDefault();
            applyLink();
          }}
        >
          <input
            className="nf-bubble-input"
            autoFocus
            value={href}
            placeholder="https://…"
            aria-label="Link URL"
            onChange={(event) => setHref(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                setLinkOpen(false);
              }
            }}
          />
          <button type="submit" className="nf-bubble-button">
            Apply
          </button>
        </form>
      ) : (
        <div className="nf-bubble-row">
          {variant === 'markdown' ? null : (
            <button
              type="button"
              className="nf-bubble-button nf-bubble-branch"
              aria-label="Branch from selection"
              title="Branch from selection (⌘⇧Return)"
              data-action="branch-from-selection"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => getEditorBindings(editor)?.branchFromSelection()}
            >
              <GitBranch size={14} strokeWidth={1.5} aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            className="nf-bubble-button"
            aria-label="Bold"
            aria-pressed={editor.isActive('bold')}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <Bold size={14} strokeWidth={1.5} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="nf-bubble-button"
            aria-label="Italic"
            aria-pressed={editor.isActive('italic')}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <Italic size={14} strokeWidth={1.5} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="nf-bubble-button"
            aria-label="Inline code"
            aria-pressed={editor.isActive('code')}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => editor.chain().focus().toggleCode().run()}
          >
            <Code size={14} strokeWidth={1.5} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="nf-bubble-button"
            aria-label="Link"
            aria-pressed={editor.isActive('link')}
            onMouseDown={(event) => event.preventDefault()}
            onClick={openLink}
          >
            <Link2 size={14} strokeWidth={1.5} aria-hidden="true" />
          </button>
          {variant === 'markdown' ? null : (
            <button
              type="button"
              className="nf-bubble-button"
              aria-label="Insert math"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() =>
                useShell.getState().openDialog({ kind: 'math', mathKind: 'inline', latex: '', pos: null })
              }
            >
              <Sigma size={14} strokeWidth={1.5} aria-hidden="true" />
            </button>
          )}
        </div>
      )}
    </BubbleMenu>
  );
}
