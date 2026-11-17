/**
 * One active Page Edit block overlay (ADR-0007).
 *
 * The overlay is editor chrome over the exact A4 page, not a second page
 * layout: it reuses the same content schema/extensions as the continuous
 * editor, is positioned from the clicked fragment's page box, is not clipped by
 * the sheet edge, and scrolls internally when the block spans pages. It never
 * feeds the runtime while typing; one commit per user session goes through
 * `block.editContent`, which creates exactly one structural undo entry. Page
 * Read never mounts this component.
 */

import { EditorContent, useEditor } from '@tiptap/react';
import type { Editor } from '@tiptap/core';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import type { PageFragment, PageGeometry, PageSettings } from '@noteforest/layout';
import { pageCssVariables } from '@noteforest/layout';
import { createEditorExtensions } from '../editor/extensions';
import {
  blockBodyContent,
  knownImageAssets,
  type PMNode,
} from '../lib/adapter';
import { blockContentFromEditorJson, editorJsonIsEmpty } from '../lib/page-edit';
import { blockTitle } from '../lib/tree';
import { openTextOnlyContextMenu } from '../lib/editor-context-menu';
import { ariaKeyshortcuts, shortcutHint } from '../lib/shortcuts';
import type { DocumentRuntime } from '../state/runtime';
import {
  pageCommitReason,
  registerPageEdit,
  PAGE_COMMIT_SHORTCUT_IDS,
  PAGE_EDIT_SHORTCUT_COMMIT_EVENT,
  type PageEditCommitReason,
} from './page-edit-state';

interface PageBlockEditorProps {
  runtime: DocumentRuntime;
  blockId: string;
  /** Fragment the user opened; its page-local box anchors the overlay. */
  fragment: PageFragment;
  geometry: PageGeometry;
  /** Resolved personal settings; the overlay uses the same page theme as Read. */
  settings: PageSettings;
  onCommitted: (reason: PageEditCommitReason) => void;
}

interface InitialEditorState {
  /** Canonical root at open; unknown root fields survive the commit. */
  base: Parameters<typeof blockBodyContent>[0];
  content: PMNode[];
  title: string;
}

export function PageBlockEditor({
  runtime,
  blockId,
  fragment,
  geometry,
  settings,
  onCommitted,
}: PageBlockEditorProps): JSX.Element {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const initialRef = useRef<InitialEditorState | null>(null);
  const initialJsonRef = useRef<string | null>(null);
  const initialEmptyRef = useRef(false);
  const commitRef = useRef<Promise<boolean> | null>(null);
  const closedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);

  if (initialRef.current === null) {
    const block = runtime.document.blocks[blockId];
    const base = block?.content ?? { type: 'doc', children: [] };
    initialRef.current = {
      base,
      content: blockBodyContent(
        base,
        knownImageAssets(runtime.document, runtime.assetAvailability),
      ),
      title: blockTitle(block),
    };
  }
  const initial = initialRef.current;

  const editor = useEditor(
    {
      extensions: createEditorExtensions({ placeholder: 'Edit this block…' }),
      content: { type: 'doc', content: initial.content },
      editable: runtime.editable,
      editorProps: {
        attributes: {
          class: 'nf-block-prose nf-page-edit-prose',
          spellcheck: 'false',
          'aria-label': `Edit ${initial.title}`,
        },
      },
      onCreate: ({ editor: created }) => {
        initialJsonRef.current = JSON.stringify(created.getJSON());
        initialEmptyRef.current = editorJsonIsEmpty(created.getJSON() as PMNode);
        // Focus enters at the start without scrolling the overlay body to the
        // end of a block that spans pages. The page behind stays at its exact
        // position; the user can scroll the overlay itself.
        created.commands.focus('start', { scrollIntoView: false });
      },
    },
    [blockId],
  );

  useEffect(() => {
    editorRef.current = editor;
    if (editor === null || initialJsonRef.current !== null) return;
    const json = editor.getJSON() as PMNode;
    initialJsonRef.current = JSON.stringify(json);
    initialEmptyRef.current = editorJsonIsEmpty(json);
    editor.commands.focus('start', { scrollIntoView: false });
  }, [editor]);

  const commit = useCallback(
    (reason: PageEditCommitReason): Promise<boolean> => {
      if (closedRef.current) return Promise.resolve(true);
      if (commitRef.current !== null) return commitRef.current;
      const currentEditor = editorRef.current;
      if (currentEditor === null) {
        // No editor means nothing was typed; closing cannot lose text.
        closedRef.current = true;
        onCommitted(reason);
        return Promise.resolve(true);
      }
      const json = currentEditor.getJSON() as PMNode;
      const jsonString = JSON.stringify(json);
      const unchanged = initialJsonRef.current === jsonString;
      // Documented Esc exception: a block that was empty when opened and is
      // still empty has nothing to commit. A block the user emptied is a real
      // change and is committed, so Esc never silently discards a deletion.
      const emptyNoOp =
        reason === 'escape' &&
        initialEmptyRef.current &&
        editorJsonIsEmpty(json);
      if (unchanged || emptyNoOp) {
        closedRef.current = true;
        setError(null);
        onCommitted(reason);
        return Promise.resolve(true);
      }
      setError(null);
      setCommitting(true);
      const promise = runtime
        .editBlockContent(blockId, blockContentFromEditorJson(initial.base, json))
        .then((outcome) => {
          if (!outcome.ok) {
            // Keep the overlay and its live ProseMirror buffer. The typed text
            // is never extracted-and-discarded on a rejected commit.
            setError(outcome.message ?? 'Could not commit this block.');
            return false;
          }
          closedRef.current = true;
          onCommitted(reason);
          return true;
        })
        .catch((failure: unknown) => {
          setError(
            failure instanceof Error ? failure.message : 'Could not commit this block.',
          );
          return false;
        })
        .finally(() => {
          commitRef.current = null;
          setCommitting(false);
        });
      commitRef.current = promise;
      return promise;
    },
    [blockId, initial.base, onCommitted, runtime],
  );

  // One active overlay per document. Shell actions and page navigation call
  // this handle before changing the view.
  useEffect(
    () => registerPageEdit(runtime.packagePath, { blockId, commit }),
    [blockId, commit, runtime.packagePath],
  );

  // Click outside commits. The event is captured before the page fragment and
  // toolbar handlers run, so selecting another block or changing page commits
  // the active editor first. Commit is idempotent and shares the in-flight
  // promise with those handlers.
  useEffect(() => {
    const onPointerDown = (event: PointerEvent): void => {
      const root = rootRef.current;
      if (root === null) return;
      if (event.target instanceof Node && root.contains(event.target)) return;
      // Editor chrome that belongs to this overlay but lives in the body (the
      // context menu and the fixed Page formula panel) is not an outside click.
      if (
        event.target instanceof Element &&
        event.target.closest('.nf-menu-overlay, [data-page-edit-extension]') !== null
      ) {
        return;
      }
      void commit('outside');
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [commit]);

  // ⌘S is routed by the shell when the overlay owns focus. Commit first so the
  // saved file cannot omit the typed block.
  useEffect(() => {
    const onCommitRequest = (): void => {
      void commit('shortcut').then((ok) => {
        if (ok) void runtime.saveNow();
      });
    };
    window.addEventListener('nf:page-edit-commit', onCommitRequest);
    return () => window.removeEventListener('nf:page-edit-commit', onCommitRequest);
  }, [commit, runtime]);

  // ⌘↵ inside body-mounted Page Edit chrome (the formula panel) is forwarded to
  // the same commit as the overlay's own key handler: the panel lives on the
  // body to stay viewport-clamped, so `onKeyDownCapture` is not its ancestor.
  useEffect(() => {
    const root = rootRef.current;
    if (root === null) return;
    const onShortcutCommit = (): void => {
      void commit('shortcut');
    };
    root.addEventListener(PAGE_EDIT_SHORTCUT_COMMIT_EVENT, onShortcutCommit);
    return () => root.removeEventListener(PAGE_EDIT_SHORTCUT_COMMIT_EVENT, onShortcutCommit);
  }, [commit]);

  useEffect(() => {
    rootRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, []);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    // The chords (Esc, ⌘⏎) come from the catalogue; only the commit reason is
    // decided here, so this overlay is not a second chord writer (VF S3-1).
    const reason = pageCommitReason(event);
    if (reason === null) return;
    event.preventDefault();
    event.stopPropagation();
    void commit(reason);
  };

  // Page Edit is a one-block editor overlay: its prose owns a text-only menu
  // (Cut/Copy/Paste/Select All). Block structure actions stay on the
  // Continuous card menu; they must not mutate the block behind this buffer.
  const onContextMenu = (event: ReactMouseEvent<HTMLDivElement>): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('[data-formula-source], [data-code-language-input]') !== null) return;
    event.preventDefault();
    event.stopPropagation();
    openTextOnlyContextMenu(target, { x: event.clientX, y: event.clientY });
  };

  const spanning = !fragment.isFirst || !fragment.isLast;
  // The overlay is positioned in the page-layout coordinate system of the
  // resolved settings and uses the same theme variables as the sheet behind it.
  const style: CSSProperties = {
    ...(pageCssVariables(settings.theme) as CSSProperties),
    left: geometry.marginsPx.left + fragment.page.x,
    top: geometry.marginsPx.top + fragment.page.y,
    width: fragment.page.width,
    maxHeight: geometry.contentHeightPx,
  };

  return (
    <div
      className="nf-page-edit-overlay nf-page-scope"
      ref={rootRef}
      style={style}
      role="dialog"
      aria-modal="false"
      aria-label={`Edit block: ${initial.title}`}
      aria-keyshortcuts={ariaKeyshortcuts(PAGE_COMMIT_SHORTCUT_IDS)}
      data-page-edit-overlay="true"
      data-page-edit-block={blockId}
      data-page-edit-spanning={spanning ? 'true' : undefined}
      onKeyDownCapture={onKeyDown}
      onContextMenu={onContextMenu}
    >
      <div className="nf-page-edit-header">
        <span className="nf-page-edit-title" data-page-edit-title="true" title={initial.title}>
          Editing <strong>{initial.title}</strong>
        </span>
        <span className="nf-page-edit-hint">
          {shortcutHint(PAGE_COMMIT_SHORTCUT_IDS[0] ?? '') ?? ''} or{' '}
          {shortcutHint(PAGE_COMMIT_SHORTCUT_IDS[1] ?? '') ?? ''} commits
        </span>
        <button
          type="button"
          className="nf-button nf-page-edit-done"
          data-page-edit-done="true"
          disabled={committing}
          onClick={() => void commit('shortcut')}
        >
          Done
        </button>
      </div>
      {error === null ? null : (
        <div className="nf-page-edit-error" role="alert" data-page-edit-error="true">
          {error} Your text is still here; retry or copy it before closing.
        </div>
      )}
      <div className="nf-page-edit-scroll" data-page-edit-scroll="true">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
