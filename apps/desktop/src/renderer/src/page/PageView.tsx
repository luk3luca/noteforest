/**
 * Paginated A4 page layout (ADR-0007), presented as one scroll of pages (PG1).
 *
 * Pages come from the shared layout engine and paginator; this component only
 * positions derived fragments and renders the static segment markup. It never
 * measures content, never re-paginates with CSS, and never changes page geometry
 * while an edit is open. Fit/zoom and navigation are view state only.
 *
 * The surface is one vertical column of touching pages with a 1 px seam, free
 * scroll, and no per-page paging state. Only the pages around the viewport are
 * mounted (`PAGE_OVERSCAN` on each side); the rest are exact-size placeholders
 * so the scrollbar stays truthful and the page model keeps every page. The
 * toolbar indicator reads the page under the centre of the viewport.
 *
 * Page Read is the exact read-only proof. Page Edit adds one active block
 * overlay (`PageBlockEditor`) anchored to a fragment; the page behind stays the
 * same A4 layout until the block commit re-paginates from the page model. The
 * overlay's page stays mounted while the overlay is open, so scrolling never
 * remounts it.
 *
 * The page model lives here, not in `DocumentEditor`: Continuous has no pages
 * and must not measure anything. Switching to Page mounts this component and
 * starts the one model run; switching back disposes it.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import type {
  AnchorAttachment,
  DerivedPage,
  LayoutDefect,
  PageEdge,
  PageEdgeModel,
  PageEdgeTrunkView,
  PageFragment,
  PageGeometry,
} from '@noteforest/layout';
import {
  buildPageEdgeModel,
  pageCssVariables,
} from '@noteforest/layout';
import { openBlockInContinuous, openDocumentHealth, openPageCardMenu } from '../actions';
import { useRuntime } from '../state/registry';
import { useShell, currentFindResult } from '../state/shell';
import type { DocumentRuntime } from '../state/runtime';
import type { InteractionMode } from '../../../shared/view-state';
import { blockTitle } from '../lib/tree';
import { pageBlockEditingEnabledFor } from '../lib/editability';
import { GEOMETRY } from '../lib/geometry';
import { CanvasHeader } from '../shell/CanvasHeader';
import { PageBlockEditor } from './PageBlockEditor';
import { PageChromeView } from './PageChromeView';
import { commitPageEdit, type PageEditCommitReason } from './page-edit-state';
import { corePageGeometry } from './adapter';
import { clampPageNumber } from './model';
import { PageEdges } from './PageEdges';
import { matches } from '../../../shared/shortcuts';
import { clearPageFindHighlights, paintPageFind } from './find-highlight';
import { clearPageStatus, publishPageStatus } from './page-status';
import { usePageSettings } from '../state/settings';
import {
  contentWrapperHtml,
  labelHtml,
  type PageContentBlock,
  type PageRenderSegment,
} from './segments';
import {
  emptyPageChrome,
  projectPageContent,
  type ProjectedPageChrome,
} from './projection';
import { registerPrintPageModel, unregisterPrintPageModel } from './print-model-registry';
import { usePageModel } from './usePageModel';
import {
  PAGE_OVERSCAN,
  clampScrollTop,
  pageAtCentre,
  pageStartOffset,
  pageStepPx,
  pageSurfaceMetrics,
  visiblePageRange,
} from './scroll';

interface PageViewProps {
  runtime: DocumentRuntime;
  active: boolean;
  /** Page Read is exact; Page Edit enables one active block overlay. */
  interactionMode: InteractionMode;
}

/** Matches `.nf-page-stage` padding (shell C: 14 px top, 0 lateral, 8 px bottom). */
const STAGE_PADDING_Y =
  GEOMETRY.pageStagePaddingTop + GEOMETRY.pageStagePaddingBottom;
const STAGE_PADDING_TOP = GEOMETRY.pageStagePaddingTop;

function titleOf(runtime: DocumentRuntime, blockId: string): string {
  return blockTitle(runtime.document.blocks[blockId]);
}

function DefectBadge({ defects, label = 'Layout defect' }: {
  defects: readonly LayoutDefect[];
  label?: string;
}): JSX.Element {
  const title = defects.map((defect) => defect.message).join('\n');
  return (
    <span className="nf-page-badge nf-page-defect-badge" title={title} data-page-defect="true">
      {label}
    </span>
  );
}

/**
 * A broken or ambiguous anchor is a status dot, not a text chip (B1, product
 * decision 17 November 2026). The 6 px visual covers no word; the 24 px hit area
 * is the button, so the tooltip opens and a click can repair the anchor without
 * moving anything that the paginator measured.
 */
function AnchorWarningDot({ warnings }: { warnings: readonly AnchorAttachment[] }): JSX.Element {
  const first = warnings[0];
  const label =
    first?.state === 'ambiguous'
      ? 'Ambiguous anchor. Open document health to repair.'
      : 'Lost anchor. Open document health to repair.';
  return (
    <button
      type="button"
      className="nf-page-anchor-dot"
      data-page-anchor-warning="true"
      aria-label={label}
      title={label}
      onClick={(event) => {
        // The card behind selects on click and opens its editor on double
        // click; neither may happen behind the Health dialog.
        event.stopPropagation();
        if (first !== undefined) openDocumentHealth({ anchorId: first.anchorId });
      }}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <span className="nf-page-anchor-dot-shape" aria-hidden="true" />
    </button>
  );
}

interface PageFragmentViewProps {
  runtime: DocumentRuntime;
  fragment: PageFragment;
  page: DerivedPage;
  segments: readonly PageRenderSegment[];
  selected: boolean;
  /** Current find hit: Page rings the block, never highlights inside it. */
  findCurrent: boolean;
  blocking: readonly LayoutDefect[];
  anchorWarnings: readonly AnchorAttachment[];
  editingEnabled: boolean;
  onSelect: (blockId: string) => void;
  onEdit: (blockId: string, pageNumber: number) => void;
  onOpen: (blockId: string) => void;
}

function PageFragmentView({
  runtime,
  fragment,
  page,
  segments,
  selected,
  findCurrent,
  blocking,
  anchorWarnings,
  editingEnabled,
  onSelect,
  onEdit,
  onOpen,
}: PageFragmentViewProps): JSX.Element {
  const block: PageContentBlock | undefined = runtime.document.blocks[fragment.blockId];
  const start = Math.min(fragment.startSegment, segments.length);
  const end = Math.min(fragment.endSegment, segments.length);
  if (block === undefined) {
    return (
      <div
        className="nf-page-fragment nf-page-fragment-missing"
        style={{
          left: fragment.page.x,
          top: fragment.page.y,
          width: fragment.page.width,
          height: fragment.page.height,
        }}
        data-fragment-block={fragment.blockId}
      >
        Missing block content
      </div>
    );
  }
  const html = `${fragment.isFirst ? labelHtml(block) : ''}${contentWrapperHtml(
    segments,
    start,
    end,
  )}`;
  const title = titleOf(runtime, fragment.blockId);
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    // A focused control inside the card (the anchor dot) owns its own keys;
    // Enter on that button must open its repair, not the block.
    if (event.target !== event.currentTarget) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    event.stopPropagation();
    onSelect(fragment.blockId);
    if (event.key !== 'Enter') return;
    if (editingEnabled) onEdit(fragment.blockId, page.pageNumber);
    else onOpen(fragment.blockId);
  };
  return (
    <div
      className="nf-page-fragment"
      style={{
        left: fragment.page.x,
        top: fragment.page.y,
        width: fragment.page.width,
        height: fragment.page.height,
      }}
      data-fragment-block={fragment.blockId}
      data-fragment-role={fragment.role}
      data-fragment-depth={fragment.depth}
      data-fragment-page={page.pageNumber}
      data-fragment-start={fragment.startSegment}
      data-fragment-end={fragment.endSegment}
      data-fragment-first={fragment.isFirst ? '1' : '0'}
      data-fragment-last={fragment.isLast ? '1' : '0'}
      data-selected={selected ? 'true' : 'false'}
      data-find-current={findCurrent ? 'true' : undefined}
      data-fragment-defect={blocking.length > 0 ? 'true' : undefined}
      data-fragment-anchor-warning={anchorWarnings.length > 0 ? 'true' : undefined}
      role="group"
      tabIndex={0}
      aria-label={`${title}, page ${page.pageNumber}. ${
        editingEnabled
          ? 'Press Enter to edit this block on the page.'
          : 'Press Enter to open in the continuous editor.'
      }`}
      aria-keyshortcuts="Enter"
      onClick={(event) => {
        // Read-only preview: never navigate a content link from the page.
        if ((event.target as HTMLElement).closest('a') !== null) event.preventDefault();
        onSelect(fragment.blockId);
      }}
      onDoubleClick={() => {
        if (editingEnabled) onEdit(fragment.blockId, page.pageNumber);
        else onOpen(fragment.blockId);
      }}
      onContextMenu={(event) => {
        // A page card's menu carries the page-settings item only: shell-level
        // block authoring is Continuous-only by design (ADR-0007 slice).
        event.preventDefault();
        openPageCardMenu(fragment.blockId, { x: event.clientX, y: event.clientY });
      }}
      onKeyDown={onKeyDown}
    >
      <div
        className="nf-page-card nf-page-fragment-card"
        data-fragment-card="true"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {blocking.length > 0 ? <DefectBadge defects={blocking} label="Block defect" /> : null}
      {anchorWarnings.length > 0 ? <AnchorWarningDot warnings={anchorWarnings} /> : null}
    </div>
  );
}

interface PageSurfaceProps {
  page: DerivedPage | null;
  pageNumber: number;
  pageCount: number;
  /** The page under the viewport centre: the sheet the toolbar names. */
  current?: boolean;
  chrome: ProjectedPageChrome;
  geometry: PageGeometry;
  blocking: readonly LayoutDefect[];
  edges: readonly PageEdge[];
  trunks: readonly PageEdgeTrunkView[];
  children: ReactNode;
}

export function PageSurface({
  page,
  pageNumber,
  pageCount,
  current = false,
  chrome,
  geometry,
  blocking,
  edges,
  trunks,
  children,
}: PageSurfaceProps): JSX.Element {
  const margins = geometry.marginsPx;
  return (
    <div
      className="nf-page-sheet nf-page-scope"
      style={{
        width: `${geometry.pageWidthPx}px`,
        height: `${geometry.pageHeightPx}px`,
      }}
      role="document"
      aria-label={`Page ${pageNumber} of ${pageCount}`}
      data-page-number={pageNumber}
      data-page-count={pageCount}
      data-page-current={current ? 'true' : 'false'}
      data-chapter-id={page?.chapterId ?? 'empty'}
      data-overflow={page?.overflow === true ? '1' : '0'}
      data-page-width-px={geometry.pageWidthPx.toFixed(3)}
      data-page-height-px={geometry.pageHeightPx.toFixed(3)}
      data-margin-top={margins.top.toFixed(3)}
      data-margin-right={margins.right.toFixed(3)}
      data-margin-bottom={margins.bottom.toFixed(3)}
      data-margin-left={margins.left.toFixed(3)}
    >
      <PageChromeView chrome={chrome} />
      <div
        className="nf-page-content"
        style={{
          left: `${margins.left}px`,
          top: `${margins.top}px`,
          width: `${geometry.contentWidthPx}px`,
          height: `${geometry.contentHeightPx}px`,
        }}
        data-page-content={pageNumber}
      >
        <PageEdges edges={edges} trunks={trunks} geometry={geometry} />
        {children}
      </div>
      {blocking.length > 0 ? <DefectBadge defects={blocking} /> : null}
    </div>
  );
}

export function PageView({
  runtime,
  active,
  interactionMode,
}: PageViewProps): JSX.Element {
  useRuntime(runtime.packagePath);
  // One resolved personal page lens and one model per mounted Page surface.
  // Continuous never mounts this component, so it never measures pages.
  const settings = usePageSettings(runtime.packagePath, runtime.document.id);
  const model = usePageModel(runtime, active, settings);
  const view = useShell((state) => state.viewByDoc[runtime.packagePath]);
  const currentPage = view?.currentPage ?? 1;
  const pageFit = view?.pageFit ?? 'width';
  const pageZoom = view?.pageZoom ?? 1;
  const selectedBlockId = runtime.selectedBlockId;
  // Find (`⌘F`): a block hit goes to the block's page and rings the block; the
  // page keeps its zoom and the model never re-runs because of a search.
  const findCurrent = useShell((state) => currentFindResult(state));
  const findResults = useShell((state) => state.findResults);
  const findKey = findCurrent?.id ?? null;
  const findBlockId = findCurrent?.blockId ?? null;
  const findChapterId = findCurrent?.chapterId ?? null;
  const pageEditing = useShell((state) =>
    pageBlockEditingEnabledFor(runtime, state.viewByDoc[runtime.packagePath]),
  );
  const rootRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  /** One active overlay: block + the fragment/page box that anchored it. */
  const [editSession, setEditSession] = useState<{
    blockId: string;
    pageNumber: number;
    fragment: PageFragment;
  } | null>(null);
  const editingBlockIdRef = useRef<string | null>(null);
  editingBlockIdRef.current = editSession?.blockId ?? null;
  /** Esc returns keyboard focus to the committed block when it is still here. */
  const pendingFocusBlockId = useRef<string | null>(null);
  const [focusRequest, setFocusRequest] = useState(0);

  const pageCount = model.pages.length;
  const pageNumber = clampPageNumber(currentPage, pageCount);
  const page = pageCount > 0 ? model.pages[pageNumber - 1] ?? null : null;
  const pageRef = useRef(page);
  pageRef.current = page;
  // Page geometry is a personal lens: the sheet, content box, chrome, overlay,
  // and paginator all receive this one resolved setup (A4/A5/Letter).
  const geometry = useMemo(() => corePageGeometry(settings), [settings]);
  const displayAssets = useMemo(() => {
    const next: Record<string, string> = { ...model.assetUrls };
    for (const assetId of model.failedAssetIds) delete next[assetId];
    return next;
  }, [model.assetUrls, model.failedAssetIds]);
  // One content projection for Page Read/Edit: static segments, page-scoped
  // defects, anchor warnings, and the shared chrome records. The print
  // compositor consumes the same projection from its own PrintModel.
  const projection = useMemo(() => {
    if (model.document === null || model.layout === null) {
      return { pages: [], blockingDefects: [] };
    }
    return projectPageContent({
      document: model.document,
      contentBlocks: runtime.document.blocks,
      blocks: model.layout.blockById,
      pages: model.pages,
      defects: model.defects,
      anchors: model.layout.anchors,
      settings,
      geometry,
      assets: displayAssets,
    });
  }, [model.document, model.layout, model.pages, model.defects, settings, geometry, displayAssets, runtime.document]);
  const projectedPage = projection.pages[pageNumber - 1] ?? null;
  // The shared page-edge mapper, not a Page-local router. Every mounted page
  // gets its own slice; group trunks also expose pass-through segments for
  // pages with no child of that parent.
  const pageEdgeModel = useMemo<PageEdgeModel>(() => {
    if (model.layout === null) return { edges: [], trunks: [] };
    return buildPageEdgeModel(model.layout, model.pages);
  }, [model.layout, model.pages]);
  const pageEdges = pageEdgeModel.edges[pageNumber - 1] ?? [];
  const pageTrunks = pageEdgeModel.trunks[pageNumber - 1] ?? [];
  const blocking = projection.blockingDefects;
  const pageBlocking = projectedPage?.blocking ?? [];
  const segmentsByBlock = projectedPage?.segmentsByBlock ?? {};
  const anchorWarnings = projectedPage?.anchorWarningsByBlock ?? {};

  // One scale for the column: 100 % is fit width (the rest state), `page`
  // fits the whole sheet, and a manual zoom stays in the 50–200 % range.
  const metrics = useMemo(
    () =>
      pageSurfaceMetrics({
        viewportWidth: viewport.width,
        viewportHeight: viewport.height,
        pageWidthPx: geometry.pageWidthPx,
        pageHeightPx: geometry.pageHeightPx,
        fit: pageFit,
        zoom: pageZoom,
        padTop: STAGE_PADDING_TOP,
        padBottom: STAGE_PADDING_Y - STAGE_PADDING_TOP,
      }),
    [viewport, geometry, pageFit, pageZoom],
  );
  const stepPx = pageStepPx(metrics.scale, geometry.pageHeightPx);
  const paperWidth = geometry.pageWidthPx * metrics.scale;
  // The scroll content is the paper column plus its symmetric margins: a paper
  // narrower than the viewport is centered, a wider one starts at the origin so
  // its left edge stays reachable.
  const stageWidth = Math.max(viewport.width, paperWidth + 2 * metrics.gutter);

  /** 0-based window of mounted pages; the rest are exact-size placeholders. */
  const [range, setRange] = useState({ first: 0, last: PAGE_OVERSCAN });

  const syncRange = useCallback(
    (element: HTMLDivElement) => {
      const next = visiblePageRange({
        scrollTop: element.scrollTop,
        viewportHeight: element.clientHeight,
        stepPx,
        pageCount,
        padTop: STAGE_PADDING_TOP,
      });
      setRange((previous) =>
        previous.first === next.first && previous.last === next.last ? previous : next,
      );
    },
    [stepPx, pageCount],
  );

  const pageNumberRef = useRef(pageNumber);
  pageNumberRef.current = pageNumber;

  const onScroll = (): void => {
    const element = scrollRef.current;
    if (element === null) return;
    const next = pageAtCentre({
      scrollTop: element.scrollTop,
      viewportHeight: element.clientHeight,
      stepPx,
      pageCount,
      padTop: STAGE_PADDING_TOP,
      current: pageNumberRef.current,
    });
    syncRange(element);
    if (next !== pageNumberRef.current) {
      // A scroll is a movement, not an edit: never commit here. The indicator
      // follows the same page the store keeps, so the re-anchor effect below
      // is a no-op after this write.
      pageNumberRef.current = next;
      useShell.getState().setDocumentPage(runtime.packagePath, next);
    }
  };

  /**
   * Put one page start at the top of the viewport when the store asks for a
   * page the centre does not already show (jump, `⌘↑`/`⌘↓`, find, Breaks,
   * Health, session restore, zoom change). Re-reading the centre first keeps
   * the effect idempotent: a scroll-derived store write never scrolls again.
   */
  const anchorToPage = useCallback(
    (element: HTMLDivElement, target: number) => {
      const centre = pageAtCentre({
        scrollTop: element.scrollTop,
        viewportHeight: element.clientHeight,
        stepPx,
        pageCount,
        padTop: STAGE_PADDING_TOP,
        current: target,
      });
      if (centre === target) return;
      const top = clampScrollTop(
        pageStartOffset(target - 1, stepPx, STAGE_PADDING_TOP),
        element.scrollHeight,
        element.clientHeight,
      );
      if (Math.abs(element.scrollTop - top) < 0.5) return;
      element.scrollTop = top;
    },
    [stepPx, pageCount],
  );
  useLayoutEffect(() => {
    if (!active) return;
    const element = scrollRef.current;
    if (element === null) return;
    // The first ready pass restores the stored page; later passes follow the
    // store only when the centre disagrees with it.
    anchorToPage(element, pageNumber);
    syncRange(element);
  }, [active, anchorToPage, pageNumber, pageCount, syncRange, stepPx]);

  // Derived model may shrink the page count; keep the shell page in range.
  // Wait for the first derived model: clamping against the loading state would
  // overwrite a session-restored current page before the first layout pass.
  useEffect(() => {
    if (!active || !model.ready) return;
    if (currentPage !== pageNumber) {
      useShell.getState().setDocumentPage(runtime.packagePath, pageNumber);
    }
  }, [active, currentPage, pageNumber, model.ready, runtime.packagePath]);

  // The print surface consumes this exact model run; it never measures or
  // paginates a second time.
  useEffect(() => {
    if (
      !active ||
      !model.ready ||
      model.document === null ||
      model.layout === null ||
      model.settingsFingerprint === null
    ) {
      return undefined;
    }
    registerPrintPageModel({
      packagePath: runtime.packagePath,
      document: model.document,
      layout: model.layout,
      pages: model.pages,
      defects: model.defects,
      manualBreakWarnings: model.manualBreakWarnings,
      settings,
      settingsFingerprint: model.settingsFingerprint,
      assetUrls: model.assetUrls,
      failedAssetIds: model.failedAssetIds,
    });
    return () => unregisterPrintPageModel(runtime.packagePath);
  }, [
    active,
    model.ready,
    model.document,
    model.layout,
    model.pages,
    model.defects,
    model.manualBreakWarnings,
    model.settingsFingerprint,
    model.assetUrls,
    model.failedAssetIds,
    runtime.packagePath,
    settings,
  ]);

  // The toolbar is a sibling of the canvas: publish the two derived values it
  // cannot measure itself (page count and the fit-relative zoom).
  useLayoutEffect(() => {
    if (!active) return undefined;
    publishPageStatus({
      packagePath: runtime.packagePath,
      pageCount,
      percent: metrics.percent,
      ready: model.ready,
      updating: model.updating,
    });
    return () => clearPageStatus(runtime.packagePath);
  }, [
    active,
    runtime.packagePath,
    pageCount,
    metrics.percent,
    model.ready,
    model.updating,
  ]);

  useEffect(() => {
    if (!active) return undefined;
    // The scroll region is the keyboard target: arrows/PageDown scroll the
    // pages natively and the page-level keys (Escape, Enter) are handled
    // on the same element.
    const element = scrollRef.current;
    if (element === null) return undefined;
    element.focus({ preventScroll: true });
    return undefined;
  }, [active]);

  // Switching to another tab commits the one active block first; a rejected
  // commit keeps the overlay open with its text instead of dropping it.
  useEffect(() => {
    if (active) return;
    void commitPageEdit(runtime.packagePath);
  }, [active, runtime.packagePath]);

  useLayoutEffect(() => {
    if (!active) return undefined;
    const element = scrollRef.current;
    if (element === null) return undefined;
    const update = (): void => {
      setViewport({ width: element.clientWidth, height: element.clientHeight });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [active]);

  const selectBlock = useCallback(
    (blockId: string) => {
      runtime.selectBlock(blockId);
    },
    [runtime],
  );

  /** Open the one active block overlay; commit the previous block first. */
  const editBlock = useCallback(
    (blockId: string, pageOfBlock: number) => {
      if (!pageEditing) {
        openBlockInContinuous(blockId);
        return;
      }
      if (editingBlockIdRef.current === blockId) return;
      void (async () => {
        if (!(await commitPageEdit(runtime.packagePath))) return;
        if (
          !pageBlockEditingEnabledFor(
            runtime,
            useShell.getState().viewByDoc[runtime.packagePath],
          )
        ) {
          return;
        }
        // Re-read the page after the commit: an earlier edit may have
        // re-paginated the model between the click and this continuation.
        const target = model.pages[pageOfBlock - 1] ?? pageRef.current;
        const fragment = target?.fragments.find((item) => item.blockId === blockId);
        if (fragment === undefined) {
          openBlockInContinuous(blockId);
          return;
        }
        runtime.selectBlock(blockId);
        setEditSession({ blockId, pageNumber: pageOfBlock, fragment });
      })();
    },
    [model.pages, pageEditing, runtime],
  );

  const committed = useCallback(
    (blockId: string, reason: PageEditCommitReason) => {
      setEditSession(null);
      if (reason === 'escape') {
        pendingFocusBlockId.current = blockId;
        setFocusRequest((value) => value + 1);
      }
    },
    [],
  );

  // Find navigation: move to the page that holds the current hit's fragment
  // once per new hit. The key guard keeps a manual page change afterwards from
  // snapping back; the page model is PageView's own, so this waits for `ready`.
  const lastFindKey = useRef<string | null>(null);
  useEffect(() => {
    if (!active) return;
    if (findKey === null) {
      lastFindKey.current = null;
      return;
    }
    if (!model.ready || lastFindKey.current === findKey) return;
    const index =
      findBlockId !== null
        ? model.pages.findIndex((candidate) =>
            candidate.fragments.some((fragment) => fragment.blockId === findBlockId),
          )
        : model.pages.findIndex((candidate) => candidate.chapterId === findChapterId);
    lastFindKey.current = findKey;
    if (index < 0) return;
    if (index + 1 !== pageNumber) {
      useShell.getState().setDocumentPage(runtime.packagePath, index + 1);
    }
  }, [
    active,
    findKey,
    findBlockId,
    findChapterId,
    model.ready,
    model.pages,
    pageNumber,
    runtime.packagePath,
  ]);

  // Find in Page (F4a): paint the matches inside the mounted pages with the CSS
  // Custom Highlight API — never a wrapper span, because the page is measured
  // and the highlight may not touch the DOM. The effect repaints whenever the
  // result set, the current hit, the page model or the mounted window changes:
  // only the visible pages ±2 are mounted, so a scroll or a jump must repaint or
  // the ranges would describe a page that is gone. The query mode is read from
  // the store rather than subscribed: a keystroke alone repaints nothing until
  // the debounced scan settles with the results that belong to it.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!active || root === null) {
      clearPageFindHighlights(root ?? undefined);
      return undefined;
    }
    const state = useShell.getState();
    paintPageFind({
      root,
      pages: projection.pages,
      contentBlocks: runtime.document.blocks,
      results: findResults,
      currentId: findKey,
      query: state.findQuery,
      wholeWord: state.findWholeWord,
    });
    return () => clearPageFindHighlights(root);
  }, [
    active,
    findResults,
    findKey,
    projection,
    range.first,
    range.last,
    runtime.document.blocks,
  ]);

  // Focus the committed block after Esc, once the re-paginated page renders.
  // If the block moved to another page it is not present here; the next Enter
  // or page navigation keeps working and focus stays where the browser put it.
  useEffect(() => {
    const blockId = pendingFocusBlockId.current;
    if (blockId === null) return;
    const element = rootRef.current?.querySelector<HTMLElement>(
      `[data-fragment-block="${blockId}"]`,
    );
    if (element === null || element === undefined) return;
    pendingFocusBlockId.current = null;
    element.focus({ preventScroll: true });
  }, [page, model.runs, pageNumber, focusRequest]);

  const onRootKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const target = event.target as HTMLElement;
    const interactive = target.closest(
      'button, a, input, textarea, select, [contenteditable="true"]',
    );
    // The Page Edit overlay is a real text editor: its own editor-local keys
    // (Escape, ⌘⏎) must not be swallowed by the page canvas, and the toolbar
    // remains the page-navigation path (it commits the overlay first).
    if (target.closest('[contenteditable="true"]') !== null) return;
    // `⌘↑`/`⌘↓` live in the global shell channel (App), so they keep working
    // after the jump moved focus to the toolbar indicator.
    if (matches(event, 'page-clear-selection')) {
      if (selectedBlockId !== null) {
        event.preventDefault();
        runtime.selectBlock(null);
      }
      return;
    }
    if (matches(event, 'page-open-block') && interactive === null && selectedBlockId !== null) {
      event.preventDefault();
      if (pageEditing) editBlock(selectedBlockId, pageNumber);
      else openBlockInContinuous(selectedBlockId);
    }
  };

  const pageChrome =
    projectedPage?.chrome ??
    emptyPageChrome({
      geometry,
      documentTitle: runtime.document.title,
      chapterTitle:
        page?.chapterTitle ??
        (runtime.document.chapters[0]?.title?.trim() || 'Chapter 1'),
      pageNumber: 1,
      pageCount: 1,
      chrome: settings.chrome,
    });
  const placeholder = ((): ReactNode => {
    if (model.error !== null) {
      return (
        <div className="nf-page-placeholder nf-page-error" data-page-error="true">
          <h2 className="nf-page-placeholder-title">Page layout could not be measured</h2>
          <p className="nf-page-placeholder-copy">{model.error}</p>
          <div className="nf-page-placeholder-actions">
            <button type="button" className="nf-button" onClick={() => model.reload()}>
              Retry
            </button>
            <button type="button" className="nf-button" onClick={() => openBlockInContinuous(null)}>
              Open in continuous editor
            </button>
          </div>
        </div>
      );
    }
    if (!model.ready) {
      return (
        <div className="nf-page-placeholder" data-page-loading="true">
          <h2 className="nf-page-placeholder-title">Laying out pages…</h2>
          <p className="nf-page-placeholder-copy">Measuring page typography and paginating.</p>
        </div>
      );
    }
    return (
      <div className="nf-page-placeholder" data-page-empty="true">
        <h2 className="nf-page-placeholder-title">Nothing to paginate yet.</h2>
        <p className="nf-page-placeholder-copy">
          Add a block in the continuous editor; the page layout updates from the same document.
        </p>
        <div className="nf-page-placeholder-actions">
          <button type="button" className="nf-button nf-button-primary" onClick={() => openBlockInContinuous(null)}>
            Open in continuous editor
          </button>
        </div>
      </div>
    );
  })();

  const placeholderSurface = model.ready && model.error === null && page === null;
  const showPlaceholder = placeholderSurface || !model.ready || model.error !== null;
  // The overlay's page stays mounted, so scrolling can never remount it.
  const editPageNumber = editSession === null ? null : editSession.pageNumber;
  // Every page owns a slot: the mounted window renders the paper, the rest are
  // exact-size placeholders, so the scrollbar and the indicator stay truthful
  // at both ends of the note. An open overlay pins its page into the window.
  const slots: number[] = [];
  for (let index = 0; index < pageCount; index += 1) slots.push(index);
  const isMounted = (index: number): boolean =>
    (index >= range.first && index <= range.last) || index === (editPageNumber ?? -1) - 1;
  const mountedCount = slots.reduce((total, index) => total + (isMounted(index) ? 1 : 0), 0);
  const fragmentCount = page?.fragments.length ?? 0;

  // The region itself is a focus target so the page-level keys (Escape,
  // Enter) work from the header too; the scroll region inside it is a
  // second, native scroll target for arrows, PageUp/PageDown, Home/End.
  return (
    <div
      className="nf-page-view"
      ref={rootRef}
      style={pageCssVariables(settings.theme) as CSSProperties}
      role="region"
      aria-label="Page layout"
      aria-busy={!model.ready || model.updating}
      tabIndex={0}
      onKeyDown={onRootKeyDown}
      data-interaction-mode={interactionMode}
      data-ready={model.ready ? 'true' : 'false'}
      data-updating={model.updating ? 'true' : 'false'}
      data-page-count={pageCount}
      data-current-page={pageNumber}
      data-page-density={Math.round(settings.theme.density * 100)}
      data-defect-count={blocking.length}
      data-measurement-calls={model.measurementCalls}
      data-model-runs={model.runs}
      data-model-ms={model.lastRunMs === null ? undefined : Math.round(model.lastRunMs)}
      data-model-compute-ms={
        model.lastComputeMs === null ? undefined : Math.round(model.lastComputeMs)
      }
      data-fragment-count={fragmentCount}
      data-continuation-out={page?.continuationOut.length ?? 0}
      data-continuation-in={page?.continuationIn.length ?? 0}
      data-page-edge-count={pageEdges.length}
      data-page-trunk-count={pageTrunks.length}
      data-page-fit={pageFit}
      data-page-scale={metrics.scale}
      data-page-zoom={metrics.percent}
      data-mounted-page-count={showPlaceholder ? 1 : mountedCount}
      data-error={model.error !== null ? 'true' : undefined}
      data-empty={placeholderSurface ? 'true' : undefined}
    >
      {active ? <CanvasHeader page={{ updating: model.updating }} /> : null}
      {model.error !== null ? (
        <div className="nf-page-banner nf-page-banner-error" role="status">
          Page layout error: {model.error}
        </div>
      ) : null}
      {blocking.length > 0 ? (
        <div className="nf-page-banner nf-page-banner-defect" role="status" data-page-defects="true">
          {blocking.length} blocking layout {blocking.length === 1 ? 'defect' : 'defects'}:{' '}
          {blocking[0]?.message}
        </div>
      ) : null}
      <div
        className="nf-page-scroll"
        ref={scrollRef}
        data-page-scroll="true"
        role="region"
        aria-label="Pages"
        tabIndex={0}
        onScroll={showPlaceholder ? undefined : onScroll}
      >
        <div
          className="nf-page-stage"
          data-page-stage="true"
          style={{ width: `${stageWidth}px`, paddingLeft: `${metrics.gutter}px`, paddingRight: `${metrics.gutter}px` }}
        >
          {showPlaceholder ? (
            <div
              className="nf-page-sheet-wrap"
              style={{ zoom: metrics.scale }}
              data-page-zoom={metrics.percent}
              data-page-scale={metrics.scale}
            >
              <PageSurface
                page={null}
                pageNumber={1}
                pageCount={1}
                current
                chrome={pageChrome}
                geometry={geometry}
                blocking={[]}
                edges={[]}
                trunks={[]}
              >
                {placeholder}
              </PageSurface>
            </div>
          ) : (
            <div className="nf-page-column" data-page-column="true">
              {slots.map((index) => {
                const slotPage = model.pages[index];
                if (slotPage === undefined) return null;
                const slotNumber = index + 1;
                const projected = projection.pages[index] ?? null;
                const isEditing = editPageNumber === slotNumber;
                return (
                  <div
                    className="nf-page-slot"
                    key={`page-${slotNumber}`}
                    data-page-slot={slotNumber}
                    data-page-slot-mounted={isMounted(index) ? 'true' : 'false'}
                    data-page-slot-current={slotNumber === pageNumber ? 'true' : undefined}
                  >
                    {isMounted(index) ? (
                      <div
                        className="nf-page-sheet-wrap"
                        style={{ zoom: metrics.scale }}
                        data-page-zoom={metrics.percent}
                        data-page-scale={metrics.scale}
                      >
                        <PageSurface
                          page={slotPage}
                          pageNumber={slotNumber}
                          pageCount={pageCount}
                          current={slotNumber === pageNumber}
                          chrome={projected?.chrome ?? pageChrome}
                          geometry={geometry}
                          blocking={projected?.blocking ?? []}
                          edges={pageEdgeModel.edges[index] ?? []}
                          trunks={pageEdgeModel.trunks[index] ?? []}
                        >
                          {slotPage.fragments.map((fragment) => (
                            <PageFragmentView
                              key={`${fragment.blockId}-${fragment.startSegment}-${fragment.page.y.toFixed(2)}`}
                              runtime={runtime}
                              fragment={fragment}
                              page={slotPage}
                              segments={projected?.segmentsByBlock[fragment.blockId] ?? []}
                              selected={selectedBlockId === fragment.blockId}
                              findCurrent={
                                findBlockId !== null && findBlockId === fragment.blockId
                              }
                              blocking={blocking.filter(
                                (defect) => defect.blockId === fragment.blockId,
                              )}
                              anchorWarnings={
                                fragment.isFirst
                                  ? projected?.anchorWarningsByBlock[fragment.blockId] ?? []
                                  : []
                              }
                              editingEnabled={pageEditing}
                              onSelect={selectBlock}
                              onEdit={editBlock}
                              onOpen={openBlockInContinuous}
                            />
                          ))}
                        </PageSurface>
                        {isEditing && editSession !== null && pageEditing ? (
                          <PageBlockEditor
                            key={`${editSession.blockId}:${editSession.fragment.page.y.toFixed(2)}`}
                            runtime={runtime}
                            blockId={editSession.blockId}
                            fragment={editSession.fragment}
                            geometry={geometry}
                            settings={settings}
                            onCommitted={(reason) => committed(editSession.blockId, reason)}
                          />
                        ) : null}
                      </div>
                    ) : (
                      <div
                        className="nf-page-sheet-placeholder"
                        style={{
                          width: `${geometry.pageWidthPx}px`,
                          height: `${geometry.pageHeightPx}px`,
                          zoom: metrics.scale,
                        }}
                        aria-hidden="true"
                        data-page-placeholder={slotNumber}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
