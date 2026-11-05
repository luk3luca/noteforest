import { ChevronRight, GripVertical, Plus, TriangleAlert } from 'lucide-react';
import { resolveAnchor } from '@noteforest/core';
import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from 'react';
import { getEditorBindings, setDragBlockId } from '../bindings';
import { clearEditorChapterFocus, useEditorUi } from '../editor-ui';
import { GEOMETRY } from '../../lib/geometry';

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
  const callout = node.attrs['callout'] === true;
  const hasCallouts = node.attrs['hasCallouts'] === true;
  const anchorId = stringAttr(node.attrs['anchorId']);
  return (
    <NodeViewWrapper
      className={callout ? 'nf-block-node nf-callout-row' : 'nf-block-node'}
      data-block-id={blockId}
      {...(callout ? { 'data-callout-row': 'true', 'data-anchor-id': anchorId } : {})}
    >
      {callout ? (
        <>
          <span className="nf-callout-dot" aria-hidden="true" />
          <span className="nf-callout-leader" aria-hidden="true" />
        </>
      ) : null}
      <NodeViewContent
        className="nf-block-inner"
        data-collapsed={node.attrs['collapsed'] === true ? 'true' : 'false'}
        data-callouts={hasCallouts ? 'true' : 'false'}
      />
    </NodeViewWrapper>
  );
}

/**
 * Anchored callout lane (M3b2a). The lane is an editor projection below the
 * parent card; it aligns each callout to its anchor at render time. Nothing
 * here is stored in the document.
 */
export function CalloutLaneView({ node }: NodeViewProps): JSX.Element {
  const parentId = stringAttr(node.attrs['parentId']);
  const laneRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const lane = laneRef.current;
    if (lane === null) return undefined;
    const host = lane.closest<HTMLElement>('.nf-block-node');
    if (host === null) return undefined;
    const card = host.querySelector<HTMLElement>(`[data-block-card="${parentId}"]`);
    if (card === null) return undefined;

    const laneRoot = lane.closest('.nf-callout-lane');
    const align = (): void => {
      frame = 0;
      const laneRect = lane.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      if (laneRect.width <= 0 || cardRect.width <= 0) return;
      // The canvas may be zoomed (CSS `zoom`); measure in layout pixels so the
      // offsets stay correct at Fit width and at any manual zoom.
      const scale = lane.offsetWidth > 0 ? laneRect.width / lane.offsetWidth : 1;
      const factor = scale > 0 ? scale : 1;
      const cardWidth = cardRect.width / factor;
      const contentLeft = Math.max(
        0,
        (cardRect.left - laneRect.left) / factor + GEOMETRY.cardPadding,
      );
      // Clamp against the parent card, not the chapter column: a callout may
      // never overflow the card's right edge.
      const maxOffset = Math.max(contentLeft, cardWidth - GEOMETRY.childMinWidth);
      const marks = [...card.querySelectorAll<HTMLElement>('.nf-anchor-mark[data-anchor-ids]')];
      for (const row of lane.querySelectorAll<HTMLElement>('[data-callout-row="true"]')) {
        // A nested callout has its own lane; only align rows that belong here.
        if (row.closest('.nf-callout-lane') !== laneRoot) continue;
        const anchorId = row.dataset['anchorId'] ?? '';
        let anchorX: number | null = null;
        for (const candidate of marks) {
          const ids = (candidate.dataset['anchorIds'] ?? '').split(',');
          if (!ids.includes(anchorId)) continue;
          const left = (candidate.getBoundingClientRect().left - laneRect.left) / factor;
          anchorX = anchorX === null ? left : Math.min(anchorX, left);
        }
        if (anchorX === null) {
          // Broken/ambiguous bindings have no visible mark: fall back to the
          // card content left and keep the callout reachable.
          row.style.setProperty('--nf-callout-offset', `${Math.round(contentLeft)}px`);
          row.style.setProperty('--nf-callout-dot-left', '0px');
          row.style.setProperty('--nf-callout-leader-left', '0px');
          row.style.setProperty('--nf-callout-leader-width', '0px');
          row.dataset['calloutClamped'] = 'true';
          continue;
        }
        const desired = anchorX + GEOMETRY.calloutGap;
        // Align to the anchor when the minimum callout width fits; otherwise
        // fall back to the card content left and keep the connector.
        const offset = Math.round(
          desired > maxOffset + 0.5 ? contentLeft : Math.max(desired, contentLeft),
        );
        const delta = Math.round(anchorX - offset);
        row.style.setProperty('--nf-callout-offset', `${offset}px`);
        row.style.setProperty('--nf-callout-dot-left', `${delta - 2}px`);
        row.style.setProperty('--nf-callout-leader-left', `${Math.min(0, delta)}px`);
        row.style.setProperty('--nf-callout-leader-width', `${Math.abs(delta)}px`);
        row.dataset['calloutClamped'] = desired > maxOffset + 0.5 ? 'true' : 'false';
      }
    };

    let disposed = false;
    const schedule = (): void => {
      if (disposed || frame !== 0) return;
      frame = requestAnimationFrame(align);
    };
    let frame = requestAnimationFrame(align);
    const observer = new ResizeObserver(schedule);
    observer.observe(lane);
    observer.observe(card);
    // Text edits can move the anchor without changing the card's size.
    const cardMutation = new MutationObserver(schedule);
    cardMutation.observe(card, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class', 'data-collapsed'],
    });
    // A second anchor/child may be inserted into an existing lane without a
    // card resize; observe the lane's child list too.
    const laneMutation = new MutationObserver(schedule);
    laneMutation.observe(lane, { childList: true, subtree: true, characterData: true });
    window.addEventListener('resize', schedule);
    void document.fonts.ready.then(schedule);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      frame = 0;
      observer.disconnect();
      cardMutation.disconnect();
      laneMutation.disconnect();
      window.removeEventListener('resize', schedule);
    };
  }, [parentId]);

  return (
    <NodeViewWrapper className="nf-callout-lane" data-parent-id={parentId} data-callout-lane={parentId}>
      <div className="nf-callout-measure" ref={laneRef}>
        <NodeViewContent className="nf-callout-lane-inner" />
      </div>
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
  const callout = node.attrs['callout'] === true;
  const anchorQuote = stringAttr(node.attrs['anchorQuote']);
  const anchorState = stringAttr(node.attrs['anchorState']);
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

  // M3b1 minimal broken state: an anchored child whose binding no longer
  // resolves shows a warning on the parent card. Repair/health UX is M3e.
  const anchorWarnings: Array<{ anchorId: string; state: string }> = [];
  if (bindings !== null) {
    const document = bindings.runtime.document;
    const seen = new Set<string>();
    for (const branch of Object.values(document.branches)) {
      if (branch.source.blockId !== blockId) continue;
      const anchorId = branch.source.anchorId;
      if (anchorId === undefined || seen.has(anchorId)) continue;
      seen.add(anchorId);
      const resolution = resolveAnchor(document, anchorId);
      if (
        resolution.state === 'broken' ||
        resolution.state === 'ambiguous' ||
        resolution.state === 'block-missing'
      ) {
        anchorWarnings.push({ anchorId, state: resolution.state });
      }
    }
  }

  return (
    <NodeViewWrapper
      className="nf-block-body"
      data-block-card={blockId}
      data-active={active}
      data-top-level={topLevel}
      data-depth={depth}
      data-collapsed={collapsed}
      data-callout={callout ? 'true' : 'false'}
      onContextMenu={onContextMenu}
    >
      <div className="nf-gutter" contentEditable={false}>
        <button
          type="button"
          className="nf-gutter-button nf-gutter-handle"
          title="Block actions and reorder"
          aria-label="Block actions and reorder"
          aria-haspopup="menu"
          data-block-actions={blockId}
          onPointerDown={onHandlePointerDown}
          onClick={(event) => {
            // Native keyboard activation (Enter/Space) has detail 0. Pointer
            // activation belongs to the drag path above, so it must not open
            // the menu when the drag ends.
            if (event.detail !== 0) return;
            event.stopPropagation();
            const rect = event.currentTarget.getBoundingClientRect();
            bindings?.openBlockMenu(blockId, { x: rect.right + 4, y: rect.top });
          }}
        >
          <GripVertical size={14} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>
      {callout ? (
        <div className="nf-callout-head" contentEditable={false}>
          <span
            className="nf-callout-quote"
            data-anchor-quote={anchorQuote}
            data-anchor-state={anchorState}
            title={anchorQuote.length > 0 ? `Anchor: “${anchorQuote}”` : 'Anchored branch'}
          >
            <span className="nf-callout-quote-glyph" aria-hidden="true">
              “
            </span>
            <span className="nf-callout-quote-text">{anchorQuote || 'anchor'}</span>
          </span>
          {anchorState === 'broken' ||
          anchorState === 'ambiguous' ||
          anchorState === 'block-missing' ? (
            <span className="nf-callout-state" data-anchor-state={anchorState}>
              <TriangleAlert size={10} strokeWidth={1.5} aria-hidden="true" />
              {anchorState === 'ambiguous' ? 'Ambiguous' : 'Lost anchor'}
            </span>
          ) : null}
        </div>
      ) : null}
      <NodeViewContent className="nf-block-prose" />
      {anchorWarnings.length > 0 ? (
        <span
          className="nf-anchor-warning"
          contentEditable={false}
          role="status"
          data-anchor-warning={anchorWarnings[0]?.anchorId ?? ''}
          data-anchor-state={anchorWarnings[0]?.state ?? ''}
          title="The anchored text could not be resolved. The branch is kept; repair arrives in a later step."
        >
          <TriangleAlert size={12} strokeWidth={1.5} aria-hidden="true" />
          Lost anchor
        </span>
      ) : null}
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
