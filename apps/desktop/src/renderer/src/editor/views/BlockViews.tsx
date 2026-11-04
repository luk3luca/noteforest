import { ChevronRight, GripVertical, Plus } from 'lucide-react';
import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from 'react';
import { getEditorBindings, setDragBlockId } from '../bindings';
import { clearEditorChapterFocus, useEditorUi } from '../editor-ui';

function stringAttr(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function numberAttr(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function ChapterView({ node, editor }: NodeViewProps): JSX.Element {
  const title = stringAttr(node.attrs['title'], 'Untitled chapter');
  const chapterId = stringAttr(node.attrs['chapterId']);
  const bindings = getEditorBindings(editor);
  const ui = useEditorUi(editor);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const committing = useRef(false);
  const headRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!editing) setValue(title);
  }, [title, editing]);

  // One-shot request from "+ Add chapter": start editing the new title.
  const focusRequested = ui.focusChapterId === chapterId;
  useEffect(() => {
    if (!focusRequested) return;
    clearEditorChapterFocus(editor, chapterId);
    setValue(title);
    setEditing(true);
    requestAnimationFrame(() => {
      headRef.current?.scrollIntoView({ block: 'nearest' });
    });
  }, [focusRequested, editor, chapterId, title]);

  const commit = useCallback(() => {
    if (committing.current) return;
    committing.current = true;
    const clean = value.trim();
    setEditing(false);
    if (bindings === null || clean === title.trim()) {
      setValue(title);
      committing.current = false;
      return;
    }
    bindings.report(
      bindings.runtime
        .applyStructural({
          type: 'chapter.rename',
          chapterId,
          title: clean.length === 0 ? null : clean,
        })
        .finally(() => {
          committing.current = false;
        }),
    );
  }, [bindings, chapterId, title, value]);

  const cancel = useCallback(() => {
    setValue(title);
    setEditing(false);
  }, [title]);

  const onContextMenu = (event: MouseEvent<HTMLDivElement>): void => {
    event.preventDefault();
    bindings?.openChapterMenu(chapterId, { x: event.clientX, y: event.clientY });
  };

  const onTitleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    event.stopPropagation();
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancel();
    }
  };

  const addTopLevel = (): void => {
    if (bindings === null) return;
    bindings.report(
      bindings.runtime.addTopLevel(chapterId).then((outcome) => {
        if (outcome.ok && outcome.blockId !== undefined) {
          bindings.runtime.focusBlock(outcome.blockId);
        }
        return outcome;
      }),
    );
  };

  return (
    <NodeViewWrapper className="nf-chapter" data-chapter-id={chapterId}>
      <div className="nf-chapter-head" contentEditable={false} ref={headRef} onContextMenu={onContextMenu}>
        <span className="nf-chapter-label">Chapter</span>
        {editing ? (
          <input
            className="nf-chapter-title-input"
            value={value}
            autoFocus
            aria-label="Chapter title"
            onChange={(event) => setValue(event.target.value)}
            onBlur={commit}
            onKeyDown={onTitleKeyDown}
            onFocus={(event) => event.currentTarget.select()}
          />
        ) : (
          <button
            type="button"
            className="nf-chapter-title"
            title="Edit chapter title"
            onClick={() => {
              setValue(title);
              setEditing(true);
            }}
            onDoubleClick={() => {
              setValue(title);
              setEditing(true);
            }}
          >
            {title}
          </button>
        )}
      </div>
      <NodeViewContent className="nf-chapter-blocks" />
      {node.childCount === 0 ? (
        <div className="nf-chapter-empty" data-chapter-empty={chapterId} contentEditable={false}>
          <span className="nf-chapter-empty-copy">No top-level blocks yet.</span>
        </div>
      ) : null}
      <div className="nf-chapter-footer" contentEditable={false}>
        <button
          type="button"
          className="nf-chapter-add"
          data-chapter-add={chapterId}
          title="Add a top-level block to this chapter"
          onClick={addTopLevel}
        >
          <Plus size={12} strokeWidth={1.5} aria-hidden="true" />
          Add top-level block
        </button>
      </div>
    </NodeViewWrapper>
  );
}

export function BlockView({ node }: NodeViewProps): JSX.Element {
  const blockId = stringAttr(node.attrs['blockId']);
  return (
    <NodeViewWrapper className="nf-block-node" data-block-id={blockId}>
      <NodeViewContent
        className="nf-block-inner"
        data-collapsed={node.attrs['collapsed'] === true ? 'true' : 'false'}
      />
    </NodeViewWrapper>
  );
}

export function BranchChildrenView({ node }: NodeViewProps): JSX.Element {
  const parentId = stringAttr(node.attrs['parentId']);
  return (
    <NodeViewWrapper className="nf-branch-children" data-parent-id={parentId}>
      <NodeViewContent className="nf-branch-children-inner" />
    </NodeViewWrapper>
  );
}

export function BlockBodyView({ node, editor }: NodeViewProps): JSX.Element {
  const blockId = stringAttr(node.attrs['blockId']);
  const topLevel = node.attrs['topLevel'] === true;
  const depth = numberAttr(node.attrs['depth']);
  const collapsed = node.attrs['collapsed'] === true;
  const childCount = numberAttr(node.attrs['childCount']);
  const ui = useEditorUi(editor);
  const bindings = getEditorBindings(editor);
  const active = ui.selectedBlockId === blockId;

  const onHandlePointerDown = (event: PointerEvent<HTMLButtonElement>): void => {
    if (event.button !== 0 || bindings === null) return;
    event.preventDefault();
    event.stopPropagation();
    const source = blockId;
    bindings.setDragSource(source);
    setDragBlockId(source);
    bindings.runtime.selectBlock(source);
    document.body.classList.add('nf-dragging-block');
    const clearHint = (): void => {
      for (const element of document.querySelectorAll<HTMLElement>('[data-drop]')) {
        element.removeAttribute('data-drop');
      }
    };
    const onPointerMove = (moveEvent: globalThis.PointerEvent): void => {
      clearHint();
      const element = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
      const card = element instanceof HTMLElement ? element.closest<HTMLElement>('[data-block-card]') : null;
      if (card === null) return;
      const target = card.dataset['blockCard'];
      if (target === undefined || target === source || !bindings.canReorder(source, target)) return;
      const rect = card.getBoundingClientRect();
      card.setAttribute('data-drop', moveEvent.clientY >= rect.top + rect.height / 2 ? 'after' : 'before');
    };
    const onPointerUp = (upEvent: globalThis.PointerEvent): void => {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      document.body.classList.remove('nf-dragging-block');
      const element = document.elementFromPoint(upEvent.clientX, upEvent.clientY);
      const card = element instanceof HTMLElement ? element.closest<HTMLElement>('[data-block-card]') : null;
      clearHint();
      setDragBlockId(null);
      bindings.setDragSource(null);
      if (card === null) return;
      const target = card.dataset['blockCard'];
      if (target === undefined || target === source || !bindings.canReorder(source, target)) return;
      const rect = card.getBoundingClientRect();
      bindings.dropOnBlock(source, target, upEvent.clientY >= rect.top + rect.height / 2);
    };
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
  };

  const onContextMenu = (event: MouseEvent<HTMLDivElement>): void => {
    event.preventDefault();
    bindings?.openBlockMenu(blockId, { x: event.clientX, y: event.clientY });
  };

  const toggleCollapse = useCallback(() => {
    bindings?.report(bindings.runtime.toggleCollapse(blockId));
  }, [bindings, blockId]);

  const childLabel = childCount === 1 ? '1 child block' : `${childCount} child blocks`;
  const portLabel = collapsed
    ? `Expand branch, ${childLabel} hidden`
    : `Collapse branch, ${childLabel}`;

  return (
    <NodeViewWrapper
      className="nf-block-body"
      data-block-card={blockId}
      data-active={active}
      data-top-level={topLevel}
      data-depth={depth}
      data-collapsed={collapsed}
      onContextMenu={onContextMenu}
    >
      <div className="nf-gutter" contentEditable={false}>
        <button
          type="button"
          className="nf-gutter-button nf-gutter-handle"
          title="Drag to reorder siblings"
          aria-label="Reorder block"
          onPointerDown={onHandlePointerDown}
        >
          <GripVertical size={14} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>
      <NodeViewContent className="nf-block-prose" />
      <button
        type="button"
        className="nf-add-edge nf-add-child"
        contentEditable={false}
        title="Add child"
        aria-label="Add child block"
        data-add-child={blockId}
        onClick={(event) => {
          event.stopPropagation();
          bindings?.report(bindings.runtime.addChild(blockId));
        }}
      >
        <Plus size={12} strokeWidth={1.5} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="nf-add-edge nf-add-sibling"
        contentEditable={false}
        title="Add sibling"
        aria-label="Add sibling block"
        data-add-sibling={blockId}
        onClick={(event) => {
          event.stopPropagation();
          bindings?.report(bindings.runtime.addSibling(blockId));
        }}
      >
        <Plus size={12} strokeWidth={1.5} aria-hidden="true" />
      </button>
      {childCount > 0 ? (
        <button
          type="button"
          className="nf-branch-port"
          contentEditable={false}
          aria-expanded={!collapsed}
          aria-label={portLabel}
          title={`${portLabel} (⌘.)`}
          data-branch-port={blockId}
          data-collapsed={collapsed}
          onClick={(event) => {
            event.stopPropagation();
            toggleCollapse();
          }}
        >
          <ChevronRight size={12} strokeWidth={1.5} className="nf-port-chevron" aria-hidden="true" />
          <span className="nf-port-dot" aria-hidden="true">
            {childCount}
          </span>
        </button>
      ) : null}
    </NodeViewWrapper>
  );
}
