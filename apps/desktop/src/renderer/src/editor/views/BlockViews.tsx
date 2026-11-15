import { ChevronRight, GripVertical, Plus, TriangleAlert } from 'lucide-react';
import {
  anchoredChildBranches,
  codePointSlice,
  formulaLatex,
  getNodeAtPath,
  resolveAnchor,
} from '@noteforest/core';
import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from 'react';
import { getEditorBindings, setDragBlockId } from '../bindings';
import { useRuntimeVersion } from '../useRuntimeVersion';
import { clearEditorChapterFocus, useEditorUi } from '../editor-ui';
import { openDocumentHealth } from '../../actions';
import { useSettingsStore } from '../../state/settings';
import { calloutLaneWidth, placeCallout, GEOMETRY } from '../../lib/geometry';
import { anchorHealthReason } from '../../lib/anchor-health';
import {
  anchorVisualTargets,
  elementScale,
  formulaTermRect,
  relativeRect,
} from '../../lib/formula-term-geometry';
import {
  anchorQuote,
  anchorState,
  blockTitle,
  chapterIdOf,
  incomingReferenceBranches,
  outgoingReferenceBranches,
} from '../../lib/tree';
import {
  codeLineMarkerRect,
  codeRangeRects,
} from '../../lib/code-anchor-geometry';
import { anchorFormulaRender } from '../anchor-formula';
import { openTextOnlyContextMenu, rememberTextControlSelection } from '../../lib/editor-context-menu';

function stringAttr(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

/**
 * Subscribe a node view to the canonical runtime revision. ProseMirror only
 * re-renders a React node view when its node or decorations change, so a
 * content commit that changes anchor resolution would otherwise leave the
 * inline warning and callout one revision behind until an unrelated click.
 */
function numberAttr(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function ChapterView({ node, editor }: NodeViewProps): JSX.Element {
  const title = stringAttr(node.attrs['title'], 'Untitled chapter');
  const chapterId = stringAttr(node.attrs['chapterId']);
  const bindings = getEditorBindings(editor);
  const ui = useEditorUi(editor);
  const readOnly = ui.interactionMode === 'read';
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const committing = useRef(false);
  const suppressBlur = useRef(false);
  const headRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!editing) setValue(title);
  }, [title, editing]);

  // Read mode never leaves an inline chapter-title input active.
  useEffect(() => {
    if (!readOnly || !editing) return;
    setEditing(false);
    setValue(title);
  }, [readOnly, editing, title]);

  // One-shot request from "+ Add chapter": start editing the new title.
  const focusRequested = ui.focusChapterId === chapterId;
  useEffect(() => {
    if (!focusRequested || readOnly) return;
    clearEditorChapterFocus(editor, chapterId);
    setValue(title);
    setEditing(true);
    requestAnimationFrame(() => {
      headRef.current?.scrollIntoView({ block: 'nearest' });
    });
  }, [focusRequested, readOnly, editor, chapterId, title]);

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
    // The chapter-title input is a text control: a right-click there is a text
    // menu, not the chapter structure menu.
    if (event.target instanceof HTMLInputElement) {
      // Do not commit the chapter draft just because the menu took focus.
      suppressBlur.current = true;
      openTextOnlyContextMenu(
        event.target,
        { x: event.clientX, y: event.clientY },
        { onClose: () => { suppressBlur.current = false; } },
      );
      return;
    }
    if (readOnly) return;
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
            onMouseDown={(event) => {
              if (event.button === 2) rememberTextControlSelection(event.currentTarget);
            }}
            onBlur={() => {
              if (suppressBlur.current) return;
              commit();
            }}
            onKeyDown={onTitleKeyDown}
            onFocus={(event) => {
              suppressBlur.current = false;
              event.currentTarget.select();
            }}
          />
        ) : (
          <button
            type="button"
            className="nf-chapter-title"
            title={readOnly ? undefined : 'Edit chapter title'}
            tabIndex={readOnly ? -1 : undefined}
            onClick={() => {
              if (readOnly) return;
              setValue(title);
              setEditing(true);
            }}
            onDoubleClick={() => {
              if (readOnly) return;
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
  const belowRow = node.attrs['belowRow'] === true;
  const hasCallouts = node.attrs['hasCallouts'] === true;
  const anchorId = stringAttr(node.attrs['anchorId']);
  const className = [
    'nf-block-node',
    callout ? 'nf-callout-row' : '',
    !callout && belowRow ? 'nf-below-row' : '',
  ]
    .filter((part) => part.length > 0)
    .join(' ');
  return (
    <NodeViewWrapper
      className={className}
      data-block-id={blockId}
      {...(callout ? { 'data-callout-row': 'true', 'data-anchor-id': anchorId } : {})}
      {...(!callout && belowRow ? { 'data-below-row': 'true' } : {})}
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
  const siblingGap = useSettingsStore(
    (state) => state.app.continuous.spacing.siblingGap,
  );

  useLayoutEffect(() => {
    const lane = laneRef.current;
    if (lane === null) return undefined;

    let disposed = false;
    let attachmentObserver: MutationObserver | null = null;
    let cleanupSetup: (() => void) | null = null;

    const setup = (host: HTMLElement): void => {
      const laneRoot = lane.closest('.nf-callout-lane');
      let frame = 0;
      let observedCard: HTMLElement | null = null;

      const schedule = (): void => {
        if (disposed || frame !== 0) return;
        frame = requestAnimationFrame(align);
      };

      const observer = new ResizeObserver(schedule);
      // The card can mount a frame after the lane (ProseMirror renders the
      // parent body and the lane through separate React node views). Resolve it
      // on every pass instead of returning once at mount: otherwise the lane
      // never receives `--nf-lane-width`/`--nf-callout-offset` and can expand
      // past the direct-child group.
      const cardForHost = (): HTMLElement | null => {
        const card = host.querySelector<HTMLElement>(`[data-block-card="${parentId}"]`);
        return card !== null && card.isConnected ? card : null;
      };

      const align = (): void => {
        frame = 0;
        if (disposed) return;
        const card = cardForHost();
        if (card === null) return;
        if (observedCard !== card) {
          if (observedCard !== null) observer.unobserve(observedCard);
          observer.observe(card);
          observedCard = card;
          cardMutation.disconnect();
          cardMutation.observe(card, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: [
              'class',
              'data-collapsed',
              'style',
              'data-anchor-ids',
              'data-anchor-term-ids',
            ],
          });
        }
        const laneRect = lane.getBoundingClientRect();
        const cardRect = card.getBoundingClientRect();
        if (laneRect.width <= 0 || cardRect.width <= 0) return;
        // The canvas may be zoomed (CSS `zoom`); measure in layout pixels so
        // the offsets stay correct at Fit width and at any manual zoom.
        const scale = lane.offsetWidth > 0 ? laneRect.width / lane.offsetWidth : 1;
        const factor = scale > 0 ? scale : 1;
        const cardWidth = cardRect.width / factor;
        // Independent lane width (M3g2): the callout column never collapses to
        // a narrow parent. The stable fallback is clamp(parent.width, 240, 480);
        // see `calloutLaneWidth` for the natural-width note. The variable lives
        // on the lane host so the sibling right group can inherit it too.
        const laneWidth = Math.round(calloutLaneWidth(cardWidth));
        host.style.setProperty('--nf-lane-width', `${laneWidth}px`);
        lane.dataset['laneWidth'] = String(laneWidth);
        // Rows start at the lane's left edge plus the shared row indent, so the
        // callout card and the below trunk are indented together. The safe-zone
        // clamp (M3g3) then caps the anchor offset at 160 px from the parent
        // left and keeps the callout right edge 16 px clear of the group.
        for (const row of lane.querySelectorAll<HTMLElement>('[data-callout-row="true"]')) {
          // A nested callout has its own lane; only align rows that belong here.
          if (row.closest('.nf-callout-lane') !== laneRoot) continue;
          const anchorId = row.dataset['anchorId'] ?? '';
          // Prefer best-effort term geometry; fall back to the formula/atomic
          // node rectangle when the term has no unique rendered match.
          const targets = anchorVisualTargets(card, anchorId);
          let anchorX: number | null = null;
          for (const candidate of targets) {
            const left = (candidate.getBoundingClientRect().left - laneRect.left) / factor;
            anchorX = anchorX === null ? left : Math.min(anchorX, left);
          }
          if (anchorX === null) {
            // Broken/ambiguous bindings have no visible mark: fall back to the
            // card content left and keep the callout reachable.
            row.style.setProperty('--nf-callout-offset', `${Math.round(GEOMETRY.rowIndent)}px`);
            row.style.setProperty('--nf-callout-dot-left', '0px');
            row.style.setProperty('--nf-callout-leader-left', '0px');
            row.style.setProperty('--nf-callout-leader-width', '0px');
            row.dataset['calloutClamped'] = 'true';
            continue;
          }
          // Local coordinates: the lane and the parent card share a left edge,
          // so the parent is `{ x: 0, width: cardWidth }` here.
          const placement = placeCallout(
            { x: 0, width: cardWidth },
            laneWidth,
            anchorX,
            siblingGap,
          );
          const offset = Math.round(placement.left);
          const delta = Math.round(anchorX - offset);
          row.style.setProperty('--nf-callout-offset', `${offset}px`);
          row.style.setProperty('--nf-callout-dot-left', `${delta - 2}px`);
          row.style.setProperty('--nf-callout-leader-left', `${Math.min(0, delta)}px`);
          row.style.setProperty('--nf-callout-leader-width', `${Math.abs(delta)}px`);
          row.dataset['calloutClamped'] = placement.clamped ? 'true' : 'false';
        }
      };

      observer.observe(lane);
      observer.observe(host);
      // Text edits can move the anchor without changing the card's size.
      const cardMutation = new MutationObserver(schedule);
      // A second anchor/child may be inserted into an existing lane without a
      // card resize; observe the lane's child list too.
      const laneMutation = new MutationObserver(schedule);
      laneMutation.observe(lane, { childList: true, subtree: true, characterData: true });
      // The parent body may mount after this lane; observe the host so the first
      // alignment pass runs as soon as the card appears.
      const hostMutation = new MutationObserver(schedule);
      hostMutation.observe(host, { childList: true, subtree: true, characterData: true });
      window.addEventListener('resize', schedule);
      void document.fonts.ready.then(schedule);
      frame = requestAnimationFrame(align);
      cleanupSetup = () => {
        cancelAnimationFrame(frame);
        frame = 0;
        observer.disconnect();
        cardMutation.disconnect();
        laneMutation.disconnect();
        hostMutation.disconnect();
        window.removeEventListener('resize', schedule);
      };
    };

    // A ReactRenderer may mount the lane in a temporary container before
    // ProseMirror inserts it under its branchBlock. Retry on attachment instead
    // of returning without observers, which used to leave the lane at the full
    // canvas width forever.
    const attach = (): void => {
      if (disposed || cleanupSetup !== null) return;
      const host = lane.closest<HTMLElement>('.nf-block-node');
      if (host === null) {
        if (attachmentObserver === null) {
          attachmentObserver = new MutationObserver(attach);
          attachmentObserver.observe(document.body, { childList: true, subtree: true });
        }
        return;
      }
      attachmentObserver?.disconnect();
      attachmentObserver = null;
      setup(host);
    };

    attach();
    return () => {
      disposed = true;
      attachmentObserver?.disconnect();
      cleanupSetup?.();
    };
  }, [parentId, siblingGap]);

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
  const groupRef = useRef<HTMLDivElement | null>(null);

  // With a below stack the right group is absolutely placed beside the parent
  // card so a tall right group cannot push the lane down. Reserve its height
  // in the flow so following top-level blocks never overlap it.
  //
  // A React node view may mount in a temporary container before ProseMirror
  // inserts it under its branchBlock. Resolve the host on every pass (the
  // CalloutLaneView does the same): returning once at mount used to leave a
  // tall chain with no reservation, so the next chapter overlapped it.
  useLayoutEffect(() => {
    const group = groupRef.current;
    if (group === null) return undefined;

    let disposed = false;
    let attachmentObserver: MutationObserver | null = null;
    let cleanupSetup: (() => void) | null = null;

    const setup = (host: HTMLElement): void => {
      let frame = 0;
      const update = (): void => {
        frame = 0;
        if (disposed) return;
        host.style.setProperty(
          '--nf-right-group-height',
          `${Math.ceil(group.offsetHeight)}px`,
        );
      };
      const schedule = (): void => {
        if (disposed || frame !== 0) return;
        frame = requestAnimationFrame(update);
      };
      update();
      const observer = new ResizeObserver(schedule);
      observer.observe(group);
      const mutation = new MutationObserver(schedule);
      mutation.observe(group, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style', 'data-collapsed'],
      });
      cleanupSetup = () => {
        cancelAnimationFrame(frame);
        frame = 0;
        observer.disconnect();
        mutation.disconnect();
        host.style.removeProperty('--nf-right-group-height');
      };
    };

    const attach = (): void => {
      if (disposed || cleanupSetup !== null) return;
      const host = group.closest<HTMLElement>('.nf-block-inner');
      if (host === null) {
        if (attachmentObserver === null) {
          attachmentObserver = new MutationObserver(attach);
          attachmentObserver.observe(document.body, { childList: true, subtree: true });
        }
        return;
      }
      attachmentObserver?.disconnect();
      attachmentObserver = null;
      setup(host);
    };

    attach();
    return () => {
      disposed = true;
      attachmentObserver?.disconnect();
      cleanupSetup?.();
    };
  }, []);

  return (
    <NodeViewWrapper className="nf-branch-children" data-parent-id={parentId}>
      <div className="nf-branch-children-measure" ref={groupRef}>
        <NodeViewContent className="nf-branch-children-inner" />
      </div>
    </NodeViewWrapper>
  );
}

interface AnchorMarkerInfo {
  anchorId: string;
  quote: string;
  state: ReturnType<typeof anchorState>;
  count: number;
}

interface ReferenceChipInfo {
  branchId: string;
  blockId: string;
  title: string;
  chapter: string;
  quote: string;
}

interface ReferenceChipGroups {
  seeAlso: ReferenceChipInfo[];
  referencedBy: ReferenceChipInfo[];
}

/** A resolved formula-term anchor with its exact source substring. */
interface FormulaTermTarget {
  anchorId: string;
  term: string;
}

/** A resolved code-range anchor with its code-point offsets. */
interface CodeAnchorTarget {
  anchorId: string;
  startOffset: number;
  endOffset: number;
  lineStart: number;
  lineEnd: number;
}

const CODE_QUOTE_CHIP_LIMIT = 48;

/** Callout chips show a short code excerpt; the anchor record keeps the full quote. */
function quoteChipText(kind: string, quote: string): string {
  if (kind !== 'code') return quote;
  const points = Array.from(quote);
  if (points.length <= CODE_QUOTE_CHIP_LIMIT) return quote;
  return `${points.slice(0, CODE_QUOTE_CHIP_LIMIT - 1).join('')}…`;
}

export function BlockBodyView({ node, editor }: NodeViewProps): JSX.Element {
  const blockId = stringAttr(node.attrs['blockId']);
  const topLevel = node.attrs['topLevel'] === true;
  const depth = numberAttr(node.attrs['depth']);
  const collapsed = node.attrs['collapsed'] === true;
  const childCount = numberAttr(node.attrs['childCount']);
  const callout = node.attrs['callout'] === true;
  const belowRow = node.attrs['belowRow'] === true;
  const anchorQuoteText = stringAttr(node.attrs['anchorQuote']);
  const anchorStateAttr = stringAttr(node.attrs['anchorState']);
  const anchorKind = stringAttr(node.attrs['anchorKind']);
  const anchorId = stringAttr(node.attrs['anchorId']);
  const calloutParentId = stringAttr(node.attrs['calloutParentId']);
  const calloutBranchId = stringAttr(node.attrs['calloutBranchId']);
  const ui = useEditorUi(editor);
  const bindings = getEditorBindings(editor);
  const readOnly = ui.interactionMode === 'read';
  const runtimeVersion = useRuntimeVersion(bindings?.runtime ?? null);
  const active = ui.selectedBlockId === blockId;
  const markerLayerRef = useRef<HTMLDivElement | null>(null);
  const termLayerRef = useRef<HTMLDivElement | null>(null);
  const codeLayerRef = useRef<HTMLDivElement | null>(null);

  const anchorMarkers = useMemo<AnchorMarkerInfo[]>(() => {
    if (bindings === null) return [];
    const document = bindings.runtime.document;
    const groups = new Map<string, AnchorMarkerInfo>();
    for (const branch of anchoredChildBranches(document, blockId)) {
      const id = branch.source.anchorId;
      if (id === undefined || document.blocks[branch.targetBlockId] === undefined) continue;
      // Image anchors draw numbered markers on the image itself; the generic
      // block marker would duplicate them at the image edge.
      if (document.anchors[id]?.kind === 'image') continue;
      const group = groups.get(id);
      if (group === undefined) {
        const state = anchorState(document, id, {
          assetAvailability: bindings.runtime.assetAvailability,
        });
        groups.set(id, {
          anchorId: id,
          quote: anchorQuote(document, id),
          state,
          count: 1,
        });
      } else {
        group.count += 1;
      }
    }
    return [...groups.values()];
  }, [bindings, blockId, bindings?.runtime.version]);

  const markerKey = anchorMarkers
    .map((marker) => `${marker.anchorId}:${marker.count}:${marker.state}`)
    .join('|');
  const showMarkers = active && !ui.editing && anchorMarkers.length > 0;

  const formulaTermTargets = useMemo<FormulaTermTarget[]>(() => {
    if (bindings === null) return [];
    const runtimeDocument = bindings.runtime.document;
    const block = runtimeDocument.blocks[blockId];
    if (block === undefined) return [];
    const targets = new Map<string, FormulaTermTarget>();
    for (const branch of anchoredChildBranches(runtimeDocument, blockId)) {
      const id = branch.source.anchorId;
      if (id === undefined || targets.has(id)) continue;
      const anchor = runtimeDocument.anchors[id];
      if (anchor === undefined || anchor.kind !== 'formula') continue;
      const selector = anchor.selector as unknown as Record<string, unknown>;
      if (selector['kind'] !== 'formula' || selector['form'] !== 'term') continue;
      const resolution = resolveAnchor(runtimeDocument, id);
      if (resolution.state !== 'resolved' || resolution.resolved === null) continue;
      const range = resolution.resolved.range;
      if (range.kind !== 'formula' || range.form !== 'term') continue;
      const node = getNodeAtPath(block.content, range.nodePath);
      const latex = node === null ? '' : formulaLatex(node);
      const selectorLatex = typeof selector['latex'] === 'string' ? selector['latex'] : '';
      const term =
        latex.length > 0 && range.latexStart !== undefined && range.latexEnd !== undefined
          ? codePointSlice(latex, range.latexStart, range.latexEnd)
          : selectorLatex;
      if (term.length === 0) continue;
      targets.set(id, { anchorId: id, term });
    }
    return [...targets.values()];
  }, [bindings, blockId, bindings?.runtime.version]);

  const termTargetsKey = JSON.stringify(
    formulaTermTargets.map((target) => [target.anchorId, target.term]),
  );

  const codeAnchorTargets = useMemo<CodeAnchorTarget[]>(() => {
    if (bindings === null) return [];
    const runtimeDocument = bindings.runtime.document;
    const targets = new Map<string, CodeAnchorTarget>();
    for (const branch of anchoredChildBranches(runtimeDocument, blockId)) {
      const id = branch.source.anchorId;
      if (id === undefined || targets.has(id)) continue;
      const anchor = runtimeDocument.anchors[id];
      if (anchor === undefined || anchor.kind !== 'code') continue;
      const resolution = resolveAnchor(runtimeDocument, id);
      if (resolution.state !== 'resolved' || resolution.resolved === null) continue;
      const range = resolution.resolved.range;
      if (range.kind !== 'code') continue;
      targets.set(id, {
        anchorId: id,
        startOffset: range.start,
        endOffset: range.end,
        lineStart: range.lineStart ?? 1,
        lineEnd: range.lineEnd ?? range.lineStart ?? 1,
      });
    }
    return [...targets.values()];
  }, [bindings, blockId, bindings?.runtime.version]);

  const codeTargetsKey = JSON.stringify(
    codeAnchorTargets.map((target) => [
      target.anchorId,
      target.startOffset,
      target.endOffset,
      target.lineStart,
      target.lineEnd,
    ]),
  );
  const selectedAnchorId =
    ui.selectedAnchor !== null && ui.selectedAnchor.blockId === blockId
      ? ui.selectedAnchor.anchorId
      : null;

  const calloutAnchorCount = useMemo(() => {
    if (bindings === null || calloutParentId.length === 0 || anchorId.length === 0) return 0;
    return anchoredChildBranches(bindings.runtime.document, calloutParentId).filter(
      (branch) =>
        branch.source.anchorId === anchorId &&
        bindings.runtime.document.blocks[branch.targetBlockId] !== undefined,
    ).length;
  }, [bindings, calloutParentId, anchorId, bindings?.runtime.version]);

  const branchSelected =
    callout &&
    ui.selectedAnchor !== null &&
    ui.selectedAnchor.blockId === calloutParentId &&
    ui.selectedAnchor.anchorId === anchorId &&
    ui.selectedAnchor.branchId === calloutBranchId;
  // Image anchors keep the durable label in the selector; the callout adds the
  // region/point kind so two branches on one image are distinguishable.
  const calloutImagePoint = useMemo(() => {
    if (anchorKind !== 'image' || anchorId.length === 0 || bindings === null) return false;
    const selector = bindings.runtime.document.anchors[anchorId]?.selector;
    return (
      typeof selector === 'object' &&
      selector !== null &&
      (selector as Record<string, unknown>)['kind'] === 'image' &&
      (selector as Record<string, unknown>)['point'] === true
    );
  }, [anchorKind, anchorId, bindings, runtimeVersion]);
  const chipQuote =
    anchorKind === 'image'
      ? `${quoteChipText('text', anchorQuoteText || 'Image')} · ${
          calloutImagePoint ? 'point' : 'region'
        }`
      : quoteChipText(anchorKind, anchorQuoteText);
  // Formula chips render the live selector source, not the projection snapshot:
  // a whole formula keeps its full LaTeX and a term keeps the selected term.
  const calloutFormulaLatex = useMemo(() => {
    if (anchorKind !== 'formula' || anchorId.length === 0 || bindings === null) return '';
    const selector = bindings.runtime.document.anchors[anchorId]?.selector;
    if (typeof selector !== 'object' || selector === null || Array.isArray(selector)) {
      return '';
    }
    const record = selector as Record<string, unknown>;
    return record['kind'] === 'formula' && typeof record['latex'] === 'string'
      ? record['latex']
      : '';
  }, [anchorKind, anchorId, bindings, runtimeVersion]);
  // Empty/very long/invalid LaTeX yields a null html and falls back to the Σ
  // glyph plus the plain quote; the title keeps the full source either way.
  const formulaChip = useMemo(
    () =>
      anchorKind === 'formula'
        ? anchorFormulaRender(calloutFormulaLatex || anchorQuoteText)
        : null,
    [anchorKind, calloutFormulaLatex, anchorQuoteText],
  );
  const chipFormulaText = formulaChip?.plain || chipQuote;
  const chipTitle =
    anchorKind === 'formula'
      ? `Formula anchor: “${chipFormulaText || 'anchor'}”`
      : anchorKind === 'code'
        ? `Code anchor: “${chipQuote}”`
        : anchorKind === 'image'
          ? `Image ${calloutImagePoint ? 'point' : 'region'} anchor: “${chipQuote}”`
          : anchorQuoteText.length > 0
            ? `Anchor: “${chipQuote}”`
            : 'Anchored branch';

  // Callout state is derived from the same canonical revision as the block
  // warning. The node attribute is only the projection snapshot; after a
  // content commit or text undo it can be one revision stale.
  const liveCalloutState = useMemo(() => {
    if (bindings === null || !callout || anchorId.length === 0) return null;
    const document = bindings.runtime.document;
    return document.anchors[anchorId] === undefined
      ? null
      : anchorState(document, anchorId, {
          assetAvailability: bindings.runtime.assetAvailability,
        });
  }, [bindings, callout, anchorId, runtimeVersion]);
  const effectiveAnchorState = liveCalloutState ?? anchorStateAttr;

  // Best-effort term geometry (M3c2b): overlay each uniquely resolved formula
  // term over its live KaTeX text rect. Absence is the formula-rectangle
  // fallback; no coordinate ever reaches the document.
  useLayoutEffect(() => {
    const layer = termLayerRef.current;
    if (layer === null) return undefined;
    if (formulaTermTargets.length === 0) {
      layer.replaceChildren();
      return undefined;
    }
    const card = editor.view.dom.querySelector<HTMLElement>(`[data-block-card="${blockId}"]`);
    if (card === null) {
      layer.replaceChildren();
      return undefined;
    }
    let frame = 0;
    let disposed = false;
    const position = (): void => {
      frame = 0;
      if (disposed) return;
      const cardRect = card.getBoundingClientRect();
      if (cardRect.width <= 0 || cardRect.height <= 0) {
        layer.replaceChildren();
        return;
      }
      const scale = elementScale(card);
      const highlights: HTMLElement[] = [];
      for (const target of formulaTermTargets) {
        const formulas = [
          ...card.querySelectorAll<HTMLElement>(
            '[data-anchor-kind="formula"][data-anchor-ids]',
          ),
        ].filter((formula) =>
          (formula.dataset['anchorIds'] ?? '')
            .split(',')
            .map((value) => value.trim())
            .includes(target.anchorId),
        );
        const formula = formulas.length === 1 ? formulas[0] : undefined;
        if (formula === undefined) continue;
        const termRect = formulaTermRect(formula, target.term);
        if (termRect === null) continue;
        const local = relativeRect(termRect, cardRect, scale);
        if (local.width <= 0 || local.height <= 0) continue;
        const highlight = document.createElement('span');
        highlight.className = 'nf-formula-term-highlight';
        highlight.dataset['anchorTermIds'] = target.anchorId;
        highlight.dataset['anchorTermText'] = target.term;
        highlight.setAttribute('aria-hidden', 'true');
        if (selectedAnchorId === target.anchorId) {
          highlight.dataset['anchorSelected'] = 'true';
        }
        highlight.style.left = `${local.left.toFixed(2)}px`;
        highlight.style.top = `${local.top.toFixed(2)}px`;
        highlight.style.width = `${local.width.toFixed(2)}px`;
        highlight.style.height = `${local.height.toFixed(2)}px`;
        highlights.push(highlight);
      }
      layer.replaceChildren(...highlights);
    };
    const schedule = (): void => {
      if (disposed || frame !== 0) return;
      frame = requestAnimationFrame(position);
    };
    schedule();
    const observer = new ResizeObserver(schedule);
    observer.observe(card);
    // CSS zoom changes the viewport scale without resizing the layout box.
    const canvas = card.closest<HTMLElement>('.nf-canvas');
    const canvasObserver = new MutationObserver(schedule);
    if (canvas !== null) {
      canvasObserver.observe(canvas, {
        attributes: true,
        attributeFilter: ['data-zoom', 'style'],
      });
    }
    window.addEventListener('resize', schedule);
    void document.fonts.ready.then(schedule);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      frame = 0;
      observer.disconnect();
      canvasObserver.disconnect();
      window.removeEventListener('resize', schedule);
    };
  }, [blockId, editor, termTargetsKey, selectedAnchorId, bindings?.runtime.version]);

  // Code range geometry (M3c3a): a subtle per-line highlight plus a gutter dot
  // on the first selected line. The layer is a sibling of the prose and never
  // participates in selection; the code block keeps its native editing surface.
  useLayoutEffect(() => {
    const layer = codeLayerRef.current;
    if (layer === null) return undefined;
    if (codeAnchorTargets.length === 0) {
      layer.replaceChildren();
      return undefined;
    }
    const card = editor.view.dom.querySelector<HTMLElement>(`[data-block-card="${blockId}"]`);
    if (card === null) {
      layer.replaceChildren();
      return undefined;
    }
    let frame = 0;
    let disposed = false;
    const position = (): void => {
      frame = 0;
      if (disposed) return;
      const cardRect = card.getBoundingClientRect();
      if (cardRect.width <= 0 || cardRect.height <= 0) {
        layer.replaceChildren();
        return;
      }
      const scale = elementScale(card);
      const overlay: HTMLElement[] = [];
      for (const target of codeAnchorTargets) {
        const blocks = [
          ...card.querySelectorAll<HTMLElement>(
            'pre[data-anchor-kind="code"][data-anchor-ids]',
          ),
        ].filter((block) =>
          (block.dataset['anchorIds'] ?? '')
            .split(',')
            .map((value) => value.trim())
            .includes(target.anchorId),
        );
        const block = blocks.length === 1 ? blocks[0] : undefined;
        if (block === undefined) continue;
        const measured = codeRangeRects(block, target.startOffset, target.endOffset);
        for (const rect of measured.highlights) {
          const local = relativeRect(rect, cardRect, scale);
          if (local.width <= 0 || local.height <= 0) continue;
          const highlight = document.createElement('span');
          highlight.className = 'nf-code-anchor-range';
          highlight.dataset['codeAnchorRange'] = target.anchorId;
          highlight.setAttribute('aria-hidden', 'true');
          if (selectedAnchorId === target.anchorId) {
            highlight.dataset['anchorSelected'] = 'true';
          }
          highlight.style.left = `${local.left.toFixed(2)}px`;
          highlight.style.top = `${local.top.toFixed(2)}px`;
          highlight.style.width = `${local.width.toFixed(2)}px`;
          highlight.style.height = `${local.height.toFixed(2)}px`;
          overlay.push(highlight);
        }
        if (measured.firstLine === null) continue;
        const marker = codeLineMarkerRect(measured.firstLine);
        const local = relativeRect(marker, cardRect, scale);
        const dot = document.createElement('span');
        dot.className = 'nf-code-anchor-marker';
        dot.dataset['codeAnchorId'] = target.anchorId;
        dot.dataset['codeAnchorLine'] = String(target.lineStart);
        dot.dataset['anchorState'] = 'resolved';
        dot.setAttribute('aria-hidden', 'true');
        if (selectedAnchorId === target.anchorId) {
          dot.dataset['anchorSelected'] = 'true';
        }
        dot.style.left = `${local.left.toFixed(2)}px`;
        dot.style.top = `${local.top.toFixed(2)}px`;
        overlay.push(dot);
      }
      layer.replaceChildren(...overlay);
    };
    const schedule = (): void => {
      if (disposed || frame !== 0) return;
      frame = requestAnimationFrame(position);
    };
    schedule();
    const observer = new ResizeObserver(schedule);
    observer.observe(card);
    const canvas = card.closest<HTMLElement>('.nf-canvas');
    const canvasObserver = new MutationObserver(schedule);
    if (canvas !== null) {
      canvasObserver.observe(canvas, {
        attributes: true,
        attributeFilter: ['data-zoom', 'style'],
      });
    }
    window.addEventListener('resize', schedule);
    void document.fonts.ready.then(schedule);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      frame = 0;
      observer.disconnect();
      canvasObserver.disconnect();
      window.removeEventListener('resize', schedule);
    };
  }, [blockId, editor, codeTargetsKey, selectedAnchorId, bindings?.runtime.version]);

  // Position the real marker buttons over their resolved marks. The dot stays
  // decorative in the prose; the button appears only for the selected block,
  // never while the prose owns the caret.
  useLayoutEffect(() => {
    if (!showMarkers) return undefined;
    const layer = markerLayerRef.current;
    if (layer === null) return undefined;
    let frame = 0;
    const position = (): void => {
      frame = 0;
      const card = editor.view.dom.querySelector<HTMLElement>(`[data-block-card="${blockId}"]`);
      if (card === null) return;
      const cardRect = card.getBoundingClientRect();
      const factor = elementScale(card);
      let missing = 0;
      for (const button of layer.querySelectorAll<HTMLElement>('[data-anchor-marker-id]')) {
        const id = button.dataset['anchorMarkerId'] ?? '';
        const target = anchorVisualTargets(card, id)[0] ?? null;
        if (target === null) {
          // Broken bindings have no visible mark; keep the button reachable at
          // the block warning point instead of guessing a span.
          button.style.left = 'auto';
          button.style.top = `${8 + missing * 18}px`;
          button.style.right = '8px';
          missing += 1;
          continue;
        }
        const rect = target.getBoundingClientRect();
        button.style.right = 'auto';
        button.style.left = `${Math.round((rect.right - cardRect.left) / factor - 2)}px`;
        button.style.top = `${Math.round((rect.top + rect.height / 2 - cardRect.top) / factor - 8)}px`;
      }
    };
    const schedule = (): void => {
      if (frame !== 0) return;
      frame = requestAnimationFrame(position);
    };
    frame = requestAnimationFrame(position);
    const observer = new ResizeObserver(schedule);
    const card = editor.view.dom.querySelector<HTMLElement>(`[data-block-card="${blockId}"]`);
    if (card !== null) observer.observe(card);
    const canvas = card?.closest<HTMLElement>('.nf-canvas') ?? null;
    const canvasObserver = new MutationObserver(schedule);
    if (canvas !== null) {
      canvasObserver.observe(canvas, {
        attributes: true,
        attributeFilter: ['data-zoom', 'style'],
      });
    }
    window.addEventListener('resize', schedule);
    void document.fonts.ready.then(schedule);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      canvasObserver.disconnect();
      window.removeEventListener('resize', schedule);
    };
  }, [showMarkers, markerKey, blockId, editor]);

  // Highlight every text node of the selected anchor, including multi-node
  // ranges. Marks are not React children, so this is a DOM-only view state.
  // A term highlight replaces the atomic formula highlight for that anchor.
  useEffect(() => {
    const card = editor.view.dom.querySelector<HTMLElement>(`[data-block-card="${blockId}"]`);
    if (card === null) return;
    const selected =
      ui.selectedAnchor !== null && ui.selectedAnchor.blockId === blockId
        ? ui.selectedAnchor.anchorId
        : null;
    const termIds = new Set<string>();
    for (const term of card.querySelectorAll<HTMLElement>('[data-anchor-term-ids]')) {
      const ids = (term.dataset['anchorTermIds'] ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
      for (const id of ids) termIds.add(id);
      if (selected !== null && ids.includes(selected)) {
        term.setAttribute('data-anchor-selected', 'true');
      } else {
        term.removeAttribute('data-anchor-selected');
      }
    }
    for (const mark of card.querySelectorAll<HTMLElement>('[data-anchor-ids]')) {
      const ids = (mark.dataset['anchorIds'] ?? '').split(',');
      const coveredByTerm = [...termIds].some((id) => ids.includes(id));
      if (selected !== null && ids.includes(selected) && !coveredByTerm) {
        mark.setAttribute('data-anchor-selected', 'true');
      } else {
        mark.removeAttribute('data-anchor-selected');
      }
    }
  }, [ui.selectedAnchor, blockId, editor, bindings?.runtime.version, termTargetsKey]);

  const onHandlePointerDown = (event: PointerEvent<HTMLButtonElement>): void => {
    if (event.button !== 0 || bindings === null) return;
    event.preventDefault();
    event.stopPropagation();
    const source = blockId;
    // Clicking the gutter is the explicit block-selection entry (UX §4.5):
    // set a real branchBlock node selection so a caret is not active and the
    // structural keys (⇥ / ⇧⇥ / Delete) apply to this block.
    bindings.runtime.focusBlock(source, { select: true, scroll: false });
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
    bindings?.openBlockMenu(
      blockId,
      { x: event.clientX, y: event.clientY },
      { target: event.target instanceof Element ? event.target : null },
    );
  };

  const toggleCollapse = useCallback(() => {
    bindings?.report(bindings.runtime.toggleCollapse(blockId));
  }, [bindings, blockId]);

  const childLabel = childCount === 1 ? '1 child block' : `${childCount} child blocks`;
  const portLabel = collapsed
    ? `Expand branch, ${childLabel} hidden`
    : `Collapse branch, ${childLabel}`;

  // M3e warning: an anchored child whose binding no longer resolves shows the
  // same Lost anchor / Ambiguous copy as the health sheet and opens it focused
  // on this anchor. M3h3 subscribes to the canonical revision, so a text/code/
  // formula edit or its undo updates this warning without another click. The
  // M3b1 fallback remains: the branch and target stay.
  const anchorWarnings = useMemo<Array<{
    anchorId: string;
    state: string;
    reason: ReturnType<typeof resolveAnchor>['reason'];
  }>>(() => {
    if (bindings === null) return [];
    const document = bindings.runtime.document;
    const warnings: Array<{
      anchorId: string;
      state: string;
      reason: ReturnType<typeof resolveAnchor>['reason'];
    }> = [];
    const seen = new Set<string>();
    for (const branch of Object.values(document.branches)) {
      if (branch.source.blockId !== blockId) continue;
      const anchorId = branch.source.anchorId;
      if (anchorId === undefined || seen.has(anchorId)) continue;
      seen.add(anchorId);
      const resolution = resolveAnchor(document, anchorId, {
        assetAvailability: bindings.runtime.assetAvailability,
      });
      if (
        resolution.state === 'broken' ||
        resolution.state === 'ambiguous' ||
        resolution.state === 'block-missing'
      ) {
        warnings.push({
          anchorId,
          state: resolution.state,
          reason: resolution.reason,
        });
      }
    }
    return warnings;
  }, [bindings, blockId, runtimeVersion]);

  // Reference chips are a DOM overlay, never an in-flow card footer. The card
  // box is therefore identical with and without references, which keeps the
  // layout-neutral invariant testable in the editor as well as in packages/layout.
  const referenceChips = useMemo<ReferenceChipGroups>(() => {
    if (bindings === null) return { seeAlso: [], referencedBy: [] };
    const runtimeDocument = bindings.runtime.document;
    const chapterTitle = (targetId: string): string => {
      const chapterId = chapterIdOf(runtimeDocument, targetId);
      const chapter = runtimeDocument.chapters.find((candidate) => candidate.id === chapterId);
      return chapter?.title ?? 'Untitled chapter';
    };
    const seeAlso = outgoingReferenceBranches(runtimeDocument, blockId).map((branch) => {
      const anchorId = branch.source.anchorId;
      return {
        branchId: branch.id,
        blockId: branch.targetBlockId,
        title: blockTitle(runtimeDocument.blocks[branch.targetBlockId]),
        chapter: chapterTitle(branch.targetBlockId),
        quote: anchorId === undefined ? '' : anchorQuote(runtimeDocument, anchorId),
      };
    });
    const referencedBy = incomingReferenceBranches(runtimeDocument, blockId).map((branch) => {
      const anchorId = branch.source.anchorId;
      return {
        branchId: branch.id,
        blockId: branch.source.blockId,
        title: blockTitle(runtimeDocument.blocks[branch.source.blockId]),
        chapter: chapterTitle(branch.source.blockId),
        quote: anchorId === undefined ? '' : anchorQuote(runtimeDocument, anchorId),
      };
    });
    return { seeAlso, referencedBy };
  }, [bindings, blockId, bindings?.runtime.version]);

  const referenceChipCount =
    referenceChips.seeAlso.length + referenceChips.referencedBy.length;

  const focusReferenceChip = (chip: ReferenceChipInfo): void => {
    if (bindings === null) return;
    bindings.runtime.focusBlock(chip.blockId, { select: true });
    bindings.runtime.selectBlock(chip.blockId);
  };

  return (
    <NodeViewWrapper
      className="nf-block-body"
      data-block-card={blockId}
      data-active={active}
      data-top-level={topLevel}
      data-depth={depth}
      data-collapsed={collapsed}
      data-callout={callout ? 'true' : 'false'}
      data-below-row={belowRow ? 'true' : undefined}
      data-anchor-branch-selected={branchSelected ? 'true' : undefined}
      data-anchor-markers={showMarkers ? 'true' : undefined}
      data-has-references={referenceChipCount > 0 ? 'true' : undefined}
      onContextMenu={onContextMenu}
    >
      <div className="nf-gutter" contentEditable={false}>
        {readOnly ? null : (
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
        )}
      </div>
      {showMarkers ? (
        <div
          className="nf-anchor-markers"
          contentEditable={false}
          ref={markerLayerRef}
          data-anchor-markers-layer={blockId}
        >
          {anchorMarkers.map((marker) => (
            <button
              key={marker.anchorId}
              type="button"
              className="nf-anchor-marker"
              data-anchor-marker-id={marker.anchorId}
              data-anchor-state={marker.state}
              aria-label={`Anchor: “${marker.quote || 'anchor'}”, ${marker.count} ${
                marker.count === 1 ? 'branch' : 'branches'
              }`}
              title={`Anchor: “${marker.quote || 'anchor'}” · ${marker.count} ${
                marker.count === 1 ? 'branch' : 'branches'
              }`}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                bindings?.runtime.activateAnchor(blockId, marker.anchorId);
              }}
            >
              <span className="nf-anchor-marker-dot" aria-hidden="true" />
            </button>
          ))}
        </div>
      ) : null}
      {formulaTermTargets.length > 0 ? (
        <div
          className="nf-formula-term-layer"
          contentEditable={false}
          aria-hidden="true"
          ref={termLayerRef}
          data-formula-term-layer={blockId}
        />
      ) : null}
      {codeAnchorTargets.length > 0 ? (
        <div
          className="nf-code-anchor-layer"
          contentEditable={false}
          aria-hidden="true"
          ref={codeLayerRef}
          data-code-anchor-layer={blockId}
        />
      ) : null}
      {callout ? (
        <div className="nf-callout-head" contentEditable={false}>
          <button
            type="button"
            className="nf-callout-quote"
            data-anchor-quote={anchorQuoteText}
            data-anchor-state={anchorStateAttr}
            data-anchor-kind={anchorKind || undefined}
            data-anchor-selected={branchSelected ? 'true' : 'false'}
            data-anchor-formula={
              anchorKind === 'formula'
                ? formulaChip?.html !== null
                  ? 'katex'
                  : 'fallback'
                : undefined
            }
            aria-label={`Select ${
              anchorKind === 'formula'
                ? 'formula '
                : anchorKind === 'code'
                  ? 'code '
                  : anchorKind === 'image'
                    ? `image ${calloutImagePoint ? 'point ' : 'region '}`
                    : ''
            }anchor “${chipQuote || 'anchor'}”, ${calloutAnchorCount} ${
              calloutAnchorCount === 1 ? 'branch' : 'branches'
            }`}
            title={chipTitle}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (calloutParentId.length === 0) return;
              bindings?.runtime.focusBlock(calloutParentId, { select: true });
              bindings?.runtime.selectAnchor(calloutParentId, anchorId, calloutBranchId);
            }}
          >
            <span className="nf-callout-quote-glyph" aria-hidden="true">
              {anchorKind === 'formula'
                ? 'Σ'
                : anchorKind === 'code'
                  ? '{}'
                  : anchorKind === 'image'
                    ? '▧'
                    : '“'}
            </span>
            {anchorKind === 'formula' && formulaChip?.html ? (
              <span
                className="nf-callout-quote-text nf-callout-quote-formula"
                // The KaTeX tree is decorative here: the button label and the
                // title carry the accessible plain formula.
                aria-hidden="true"
                dangerouslySetInnerHTML={{ __html: formulaChip.html }}
              />
            ) : (
              <span
                className={
                  anchorKind === 'code'
                    ? 'nf-callout-quote-text nf-callout-quote-code'
                    : 'nf-callout-quote-text'
                }
              >
                {(anchorKind === 'formula' ? chipFormulaText : chipQuote) || 'anchor'}
              </span>
            )}
          </button>
          {effectiveAnchorState === 'broken' ||
          effectiveAnchorState === 'ambiguous' ||
          effectiveAnchorState === 'block-missing' ? (
            <span className="nf-callout-state" data-anchor-state={effectiveAnchorState}>
              <TriangleAlert size={10} strokeWidth={1.5} aria-hidden="true" />
              {effectiveAnchorState === 'ambiguous' ? 'Ambiguous' : 'Lost anchor'}
            </span>
          ) : null}
        </div>
      ) : null}
      <NodeViewContent className="nf-block-prose" />
      {referenceChipCount > 0 ? (
        <div className="nf-ref-chips" contentEditable={false} data-ref-chips={blockId}>
          {referenceChips.seeAlso.map((chip) => (
            <button
              key={`see-${chip.branchId}`}
              type="button"
              className="nf-ref-chip nf-ref-chip-see-also"
              data-see-also-branch={chip.branchId}
              data-see-also-target={chip.blockId}
              title={`See also: ${chip.title} — ${chip.chapter}${
                chip.quote.length === 0 ? '' : ` (from “${chip.quote}”)`
              }`}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (readOnly) return;
                bindings?.openReferenceMenu(chip.branchId, {
                  x: event.clientX,
                  y: event.clientY,
                });
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                focusReferenceChip(chip);
              }}
            >
              <span className="nf-ref-chip-kind">See also</span>
              {chip.quote.length === 0 ? null : (
                <span className="nf-ref-chip-quote">“{chip.quote}”</span>
              )}
              <span className="nf-ref-chip-label">{chip.title}</span>
            </button>
          ))}
          {referenceChips.referencedBy.map((chip) => (
            <button
              key={`back-${chip.branchId}`}
              type="button"
              className="nf-ref-chip nf-ref-chip-referenced-by"
              data-referenced-by-branch={chip.branchId}
              data-referenced-by-source={chip.blockId}
              title={`Referenced by: ${chip.title} — ${chip.chapter}${
                chip.quote.length === 0 ? '' : ` (from “${chip.quote}”)`
              }`}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                focusReferenceChip(chip);
              }}
            >
              <span className="nf-ref-chip-kind">Referenced by</span>
              {chip.quote.length === 0 ? null : (
                <span className="nf-ref-chip-quote">“{chip.quote}”</span>
              )}
              <span className="nf-ref-chip-label">{chip.title}</span>
            </button>
          ))}
        </div>
      ) : null}
      {anchorWarnings.length > 0 ? (
        <button
          type="button"
          className="nf-anchor-warning"
          contentEditable={false}
          data-anchor-warning={anchorWarnings[0]?.anchorId ?? ''}
          data-anchor-state={anchorWarnings[0]?.state ?? ''}
          aria-label={`${anchorWarnings[0]?.state === 'ambiguous' ? 'Ambiguous anchor' : 'Lost anchor'}. Open document health to repair.`}
          title={
            anchorWarnings[0] === undefined
              ? 'Open document health'
              : `${anchorHealthReason(anchorWarnings[0].reason)} Open document health to repair; the branch and target stay.`
          }
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            const first = anchorWarnings[0];
            if (first === undefined) return;
            openDocumentHealth({ anchorId: first.anchorId });
          }}
        >
          <TriangleAlert size={12} strokeWidth={1.5} aria-hidden="true" />
          {anchorWarnings[0]?.state === 'ambiguous' ? 'Ambiguous anchor' : 'Lost anchor'}
        </button>
      ) : null}
      {readOnly ? null : (
        <>
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
        </>
      )}
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
