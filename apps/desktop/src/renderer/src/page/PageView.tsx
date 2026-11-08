/**
 * Paginated A4 page layout (ADR-0007).
 *
 * Pages come from the shared layout engine and paginator; this component only
 * positions derived fragments and renders the static segment markup. It never
 * measures content, never re-paginates with CSS, and never changes page geometry
 * while an edit is open. Fit/zoom and navigation are view state only.
 *
 * Page Read is the exact read-only proof. Page Edit adds one active block
 * overlay (`PageBlockEditor`) anchored to a fragment; the page behind stays the
 * same A4 layout until the block commit re-paginates from the page model.
 *
 * The page model lives here, not in `DocumentEditor`: Continuous has no pages
 * and must not measure anything. Switching to Page mounts this component and
 * starts the one model run; switching back disposes it.
 */

import { ChevronLeft, ChevronRight, Minus, Plus } from 'lucide-react';
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
  pageLayoutOptions,
} from '@noteforest/layout';
import { openBlockInContinuous } from '../actions';
import { useRuntime } from '../state/registry';
import { useShell } from '../state/shell';
import type { DocumentRuntime } from '../state/runtime';
import type { InteractionMode } from '../../../shared/view-state';
import { blockTitle } from '../lib/tree';
import { pageBlockEditingEnabledFor } from '../lib/editability';
import { GEOMETRY } from '../lib/geometry';
import { PageBlockEditor } from './PageBlockEditor';
import { commitPageEdit, type PageEditCommitReason } from './page-edit-state';
import { anchorHintsForDocument, corePageGeometry } from './adapter';
import { blockingDefects, clampPageNumber } from './model';
import { PageEdges } from './PageEdges';
import { usePageSettings } from '../state/settings';
import {
  buildSegments,
  contentWrapperHtml,
  labelHtml,
  type PageContentBlock,
  type PageRenderSegment,
} from './segments';
import { usePageModel } from './usePageModel';

interface PageViewProps {
  runtime: DocumentRuntime;
  active: boolean;
  /** Page Read is exact; Page Edit enables one active block overlay. */
  interactionMode: InteractionMode;
}

/** Matches `.nf-page-stage` padding (the canvas medium step). */
const STAGE_PADDING = GEOMETRY.editorPaddingXMedium;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 2.5;
const ZOOM_STEP = 0.1;

function clampZoom(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.round(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value)) * 100) / 100;
}

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

function AnchorWarningBadge({ warnings }: { warnings: readonly AnchorAttachment[] }): JSX.Element {
  const title = warnings
    .map((warning) => `Anchor ${warning.anchorId}: ${warning.state}`)
    .join('\n');
  return (
    <span
      className="nf-page-badge nf-page-anchor-badge"
      title={title}
      data-page-anchor-warning="true"
    >
      ⚠ anchor
    </span>
  );
}

interface PageFragmentViewProps {
  runtime: DocumentRuntime;
  fragment: PageFragment;
  page: DerivedPage;
  segments: readonly PageRenderSegment[];
  selected: boolean;
  blocking: readonly LayoutDefect[];
  anchorWarnings: readonly AnchorAttachment[];
  editingEnabled: boolean;
  onSelect: (blockId: string) => void;
  onEdit: (blockId: string) => void;
  onOpen: (blockId: string) => void;
}

function PageFragmentView({
  runtime,
  fragment,
  page,
  segments,
  selected,
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
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    event.stopPropagation();
    onSelect(fragment.blockId);
    if (event.key !== 'Enter') return;
    if (editingEnabled) onEdit(fragment.blockId);
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
        if (editingEnabled) onEdit(fragment.blockId);
        else onOpen(fragment.blockId);
      }}
      onKeyDown={onKeyDown}
    >
      <div
        className="nf-page-card nf-page-fragment-card"
        data-fragment-card="true"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {blocking.length > 0 ? <DefectBadge defects={blocking} label="Block defect" /> : null}
      {anchorWarnings.length > 0 ? <AnchorWarningBadge warnings={anchorWarnings} /> : null}
    </div>
  );
}

interface PageChromeProps {
  pageNumber: number;
  pageCount: number;
  documentTitle: string;
  chapterTitle: string;
  geometry: PageGeometry;
  page: DerivedPage | null;
  runtime: DocumentRuntime;
}

function PageChrome({
  pageNumber,
  pageCount,
  documentTitle,
  chapterTitle,
  geometry,
  page,
  runtime,
}: PageChromeProps): JSX.Element {
  const margins = geometry.marginsPx;
  const headerTop = margins.top * 0.3;
  const ghostTop = margins.top * 0.62;
  const footerBottom = margins.bottom * 0.3;
  const continuesBottom = margins.bottom * 0.6;
  return (
    <>
      <div
        className="nf-page-header"
        style={{ left: margins.left, right: margins.right, top: headerTop }}
      >
        <span className="nf-page-header-title">{documentTitle}</span>
        <span className="nf-page-header-chapter">{chapterTitle}</span>
      </div>
      {page !== null && page.continuationIn.length > 0 ? (
        <div
          className="nf-page-ghost-list"
          style={{ left: margins.left, right: margins.right, top: ghostTop }}
          data-page-ghost-list="true"
          data-page-continued-from={page.continuationIn[0]?.fromPage}
        >
          {page.continuationIn.map((continuation) => {
            const block = runtime.document.blocks[continuation.blockId];
            const blockLabel = block?.label ?? continuation.ghostParent.blockLabel;
            return (
              <div
                className="nf-page-ghost"
                key={`${continuation.blockId}-${continuation.fromPage}`}
              >
                ↳ continued from page {continuation.fromPage} ·{' '}
                {continuation.ghostParent.parentLabel}
                {continuation.ghostParent.anchorQuote === null
                  ? ''
                  : ` (${continuation.ghostParent.anchorQuote})`}{' '}
                → {blockLabel}
              </div>
            );
          })}
        </div>
      ) : null}
      <div
        className="nf-page-footer"
        style={{ left: margins.left, right: margins.right, bottom: footerBottom }}
      >
        <span className="nf-page-footer-chapter">{chapterTitle}</span>
        <span className="nf-page-footer-number" data-page-indicator="true">
          Page {pageNumber} of {pageCount}
        </span>
      </div>
      {page !== null && page.continuationOut.length > 0 ? (
        <div
          className="nf-page-continues-list"
          style={{ left: margins.left, right: margins.right, bottom: continuesBottom }}
          data-page-continues-list="true"
          data-page-continues-on={page.continuationOut[0]?.toPage}
        >
          {page.continuationOut.map((continuation) => (
            <div
              className="nf-page-continues"
              key={`${continuation.blockId}-${continuation.toPage}`}
            >
              continues on page {continuation.toPage} ·{' '}
              {titleOf(runtime, continuation.blockId)} →
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}

interface PageSurfaceProps {
  page: DerivedPage | null;
  pageNumber: number;
  pageCount: number;
  documentTitle: string;
  chapterTitle: string;
  geometry: PageGeometry;
  runtime: DocumentRuntime;
  blocking: readonly LayoutDefect[];
  edges: readonly PageEdge[];
  trunks: readonly PageEdgeTrunkView[];
  children: ReactNode;
}

function PageSurface({
  page,
  pageNumber,
  pageCount,
  documentTitle,
  chapterTitle,
  geometry,
  runtime,
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
      data-chapter-id={page?.chapterId ?? 'empty'}
      data-overflow={page?.overflow === true ? '1' : '0'}
      data-page-width-px={geometry.pageWidthPx.toFixed(3)}
      data-page-height-px={geometry.pageHeightPx.toFixed(3)}
      data-margin-top={margins.top.toFixed(3)}
      data-margin-right={margins.right.toFixed(3)}
      data-margin-bottom={margins.bottom.toFixed(3)}
      data-margin-left={margins.left.toFixed(3)}
    >
      <PageChrome
        pageNumber={pageNumber}
        pageCount={pageCount}
        documentTitle={documentTitle}
        chapterTitle={chapterTitle}
        geometry={geometry}
        page={page}
        runtime={runtime}
      />
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
  const settings = usePageSettings(runtime.packagePath);
  const model = usePageModel(runtime, active, settings);
  const view = useShell((state) => state.viewByDoc[runtime.packagePath]);
  const currentPage = view?.currentPage ?? 1;
  const pageFit = view?.pageFit ?? 'page';
  const pageZoom = view?.pageZoom ?? 1;
  const selectedBlockId = runtime.selectedBlockId;
  const pageEditing = useShell((state) =>
    pageBlockEditingEnabledFor(runtime, state.viewByDoc[runtime.packagePath]),
  );
  const rootRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  /** One active overlay: block + the fragment/page box that anchored it. */
  const [editSession, setEditSession] = useState<{
    blockId: string;
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
  const layoutOptions = useMemo(() => pageLayoutOptions(settings.theme), [settings.theme]);
  // The shared page-edge mapper, not a Page-local router. Only the current
  // page's slice is handed to the SVG; group trunks also expose pass-through
  // segments for pages with no child of that parent.
  const pageEdgeModel = useMemo<PageEdgeModel>(() => {
    if (model.layout === null) return { edges: [], trunks: [] };
    return buildPageEdgeModel(model.layout, model.pages);
  }, [model.layout, model.pages]);
  const pageEdges = pageEdgeModel.edges[pageNumber - 1] ?? [];
  const pageTrunks = pageEdgeModel.trunks[pageNumber - 1] ?? [];

  // Derived model may shrink the page count; keep the shell page in range.
  // Wait for the first derived model: clamping against the loading state would
  // overwrite a session-restored current page before the first layout pass.
  useEffect(() => {
    if (!active || !model.ready) return;
    if (currentPage !== pageNumber) {
      useShell.getState().setDocumentPage(runtime.packagePath, pageNumber);
    }
  }, [active, currentPage, pageNumber, model.ready, runtime.packagePath]);

  useEffect(() => {
    if (!active) return undefined;
    const element = rootRef.current;
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

  useEffect(() => {
    if (!active) return;
    const element = scrollRef.current;
    if (element === null) return;
    element.scrollTop = 0;
    element.scrollLeft = 0;
  }, [active, pageNumber]);

  const effectiveZoom = useMemo(() => {
    if (pageFit === 'page') {
      const byWidth = (viewport.width - 2 * STAGE_PADDING) / geometry.pageWidthPx;
      const byHeight = (viewport.height - 2 * STAGE_PADDING) / geometry.pageHeightPx;
      return clampZoom(Math.min(byWidth, byHeight, 1));
    }
    if (pageFit === 'width') {
      return clampZoom((viewport.width - 2 * STAGE_PADDING) / geometry.pageWidthPx);
    }
    return clampZoom(pageZoom);
  }, [pageFit, pageZoom, viewport, geometry.pageWidthPx, geometry.pageHeightPx]);

  // Keep the stored manual zoom in sync with the effective fit zoom so a later
  // global ⌘+/⌘− starts from what the user sees, not from a stale 100%.
  useEffect(() => {
    if (pageFit === 'none' || !active) return;
    const current = useShell.getState().viewByDoc[runtime.packagePath]?.pageZoom ?? 1;
    if (Math.abs(current - effectiveZoom) > 0.001) {
      useShell.getState().setDocumentPageZoom(runtime.packagePath, effectiveZoom);
    }
  }, [active, effectiveZoom, pageFit, runtime.packagePath]);

  const anchorsByBlock = useMemo(() => anchorHintsForDocument(runtime.document), [runtime.document]);
  const displayAssets = useMemo(() => {
    const next: Record<string, string> = { ...model.assetUrls };
    for (const assetId of model.failedAssetIds) delete next[assetId];
    return next;
  }, [model.assetUrls, model.failedAssetIds]);

  const segmentsByBlock = useMemo(() => {
    const result: Record<string, PageRenderSegment[]> = {};
    if (page === null) return result;
    for (const fragment of page.fragments) {
      if (result[fragment.blockId] !== undefined) continue;
      const block = runtime.document.blocks[fragment.blockId];
      if (block === undefined) continue;
      const layoutBlock = model.layout?.blockById[fragment.blockId];
      result[fragment.blockId] = buildSegments(block, {
        assets: displayAssets,
        tableColumns: layoutBlock?.measurement.tableColumns ?? {},
        anchors: anchorsByBlock.get(fragment.blockId) ?? [],
        listIndent: layoutOptions.wrapIndent,
      });
    }
    return result;
  }, [page, model.layout, displayAssets, anchorsByBlock, runtime.document, layoutOptions.wrapIndent]);

  const blocking = useMemo(() => blockingDefects(model.defects), [model.defects]);
  const pageBlocking = useMemo(() => {
    if (page === null) return [];
    const fragmentIds = new Set(page.fragments.map((fragment) => fragment.blockId));
    return blocking.filter((defect) => {
      if (defect.pageNumber !== undefined && defect.pageNumber === page.pageNumber) return true;
      if (defect.blockId !== undefined && fragmentIds.has(defect.blockId)) return true;
      if (defect.pageNumber === undefined && defect.blockId === undefined) {
        return defect.chapterId === undefined || defect.chapterId === page.chapterId;
      }
      return false;
    });
  }, [blocking, page]);

  const anchorWarnings = useMemo(() => {
    const grouped = new Map<string, AnchorAttachment[]>();
    for (const attachment of model.layout?.anchors ?? []) {
      if (attachment.state === 'resolved') continue;
      const list = grouped.get(attachment.blockId) ?? [];
      list.push(attachment);
      grouped.set(attachment.blockId, list);
    }
    return grouped;
  }, [model.layout]);

  const goToPage = useCallback(
    (next: number) => {
      if (pageCount <= 0) return;
      void commitPageEdit(runtime.packagePath).then((committed) => {
        if (!committed) return;
        useShell
          .getState()
          .setDocumentPage(runtime.packagePath, clampPageNumber(next, pageCount));
      });
    },
    [pageCount, runtime.packagePath],
  );

  const setFit = useCallback(
    (fit: 'page' | 'width' | 'none') => {
      useShell.getState().setDocumentPageFit(runtime.packagePath, fit);
    },
    [runtime.packagePath],
  );

  const zoomBy = useCallback(
    (delta: number) => {
      useShell.getState().setDocumentPageFit(runtime.packagePath, 'none');
      useShell.getState().setDocumentPageZoom(runtime.packagePath, clampZoom(effectiveZoom + delta));
    },
    [effectiveZoom, runtime.packagePath],
  );

  const actualSize = useCallback(() => {
    useShell.getState().setDocumentPageFit(runtime.packagePath, 'none');
    useShell.getState().setDocumentPageZoom(runtime.packagePath, 1);
  }, [runtime.packagePath]);

  const selectBlock = useCallback(
    (blockId: string) => {
      runtime.selectBlock(blockId);
    },
    [runtime],
  );

  /** Open the one active block overlay; commit the previous block first. */
  const editBlock = useCallback(
    (blockId: string) => {
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
        // Re-read the current page after the commit: an earlier edit may have
        // re-paginated the model between the click and this continuation.
        const currentPage = pageRef.current;
        const fragment = currentPage?.fragments.find((item) => item.blockId === blockId);
        if (fragment === undefined) {
          openBlockInContinuous(blockId);
          return;
        }
        runtime.selectBlock(blockId);
        setEditSession({ blockId, fragment });
      })();
    },
    [pageEditing, runtime],
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
    // The Page Edit overlay is a real text editor. Page-level single-key
    // shortcuts (⇧1/⇧2, ⌥↑/↓, PageUp/PageDown) must not swallow punctuation or
    // word navigation while the caret is inside it; the toolbar buttons remain
    // the page-navigation path and they commit the overlay first.
    if (target.closest('[contenteditable="true"]') !== null) return;
    if (event.altKey && !event.metaKey && !event.ctrlKey) {
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        goToPage(pageNumber - 1);
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        goToPage(pageNumber + 1);
        return;
      }
    }
    if (event.key === 'PageUp') {
      event.preventDefault();
      goToPage(pageNumber - 1);
      return;
    }
    if (event.key === 'PageDown') {
      event.preventDefault();
      goToPage(pageNumber + 1);
      return;
    }
    if (event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
      if (event.code === 'Digit1') {
        event.preventDefault();
        setFit('page');
        return;
      }
      if (event.code === 'Digit2') {
        event.preventDefault();
        setFit('width');
        return;
      }
    }
    if (event.key === 'Escape') {
      if (selectedBlockId !== null) {
        event.preventDefault();
        runtime.selectBlock(null);
      }
      return;
    }
    if (event.key === 'Enter' && interactive === null && selectedBlockId !== null) {
      event.preventDefault();
      if (pageEditing) editBlock(selectedBlockId);
      else openBlockInContinuous(selectedBlockId);
    }
  };

  const documentTitle = runtime.document.title;
  const chapterTitle =
    page?.chapterTitle ??
    (runtime.document.chapters[0]?.title?.trim() || 'Chapter 1');
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
      data-defect-count={blocking.length}
      data-measurement-calls={model.measurementCalls}
      data-model-runs={model.runs}
      data-model-ms={model.lastRunMs === null ? undefined : Math.round(model.lastRunMs)}
      data-model-compute-ms={
        model.lastComputeMs === null ? undefined : Math.round(model.lastComputeMs)
      }
      data-fragment-count={page?.fragments.length ?? 0}
      data-continuation-out={page?.continuationOut.length ?? 0}
      data-continuation-in={page?.continuationIn.length ?? 0}
      data-page-edge-count={pageEdges.length}
      data-page-trunk-count={pageTrunks.length}
      data-error={model.error !== null ? 'true' : undefined}
      data-empty={placeholderSurface ? 'true' : undefined}
    >
      <div className="nf-page-toolbar" role="toolbar" aria-label="Page layout controls">
        <div className="nf-page-toolbar-group">
          <button
            type="button"
            className="nf-button nf-page-button"
            data-page-nav="prev"
            aria-label="Previous page"
            title="Previous page (⌥↑)"
            disabled={pageNumber <= 1}
            onClick={() => goToPage(pageNumber - 1)}
          >
            <ChevronLeft size={14} strokeWidth={1.6} aria-hidden="true" />
          </button>
          <span className="nf-page-counter" data-page-counter="true">
            Page {pageNumber} of {pageCount}
          </span>
          <button
            type="button"
            className="nf-button nf-page-button"
            data-page-nav="next"
            aria-label="Next page"
            title="Next page (⌥↓)"
            disabled={pageNumber >= pageCount}
            onClick={() => goToPage(pageNumber + 1)}
          >
            <ChevronRight size={14} strokeWidth={1.6} aria-hidden="true" />
          </button>
        </div>
        <div className="nf-page-toolbar-group">
          <button
            type="button"
            className="nf-button nf-page-button"
            data-page-zoom="out"
            aria-label="Zoom out"
            title="Zoom out (⌘−)"
            onClick={() => zoomBy(-ZOOM_STEP)}
          >
            <Minus size={13} strokeWidth={1.6} aria-hidden="true" />
          </button>
          <span className="nf-page-zoom" data-page-zoom-value="true">
            {Math.round(effectiveZoom * 100)}%
          </span>
          <button
            type="button"
            className="nf-button nf-page-button"
            data-page-zoom="in"
            aria-label="Zoom in"
            title="Zoom in (⌘+)"
            onClick={() => zoomBy(ZOOM_STEP)}
          >
            <Plus size={13} strokeWidth={1.6} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="nf-button nf-page-button"
            data-page-fit="page"
            aria-pressed={pageFit === 'page'}
            title="Fit page (⇧1)"
            onClick={() => setFit('page')}
          >
            Fit page
          </button>
          <button
            type="button"
            className="nf-button nf-page-button"
            data-page-fit="width"
            aria-pressed={pageFit === 'width'}
            title="Fit width (⇧2)"
            onClick={() => setFit('width')}
          >
            Fit width
          </button>
          <button
            type="button"
            className="nf-button nf-page-button"
            data-page-fit="actual"
            aria-pressed={pageFit === 'none' && Math.abs(pageZoom - 1) < 0.001}
            title="Actual size (⌘0)"
            onClick={actualSize}
          >
            Actual
          </button>
        </div>
        <div className="nf-page-toolbar-spacer" />
        <div className="nf-page-toolbar-group">
          {model.updating ? <span className="nf-page-status">Updating…</span> : null}
          <button
            type="button"
            className="nf-button nf-page-button nf-page-open-continuous"
            data-page-open-continuous="true"
            disabled={selectedBlockId === null}
            title={
              selectedBlockId === null
                ? 'Select a block on the page first'
                : `Open ${titleOf(runtime, selectedBlockId)} in the continuous editor`
            }
            onClick={() => openBlockInContinuous(selectedBlockId)}
          >
            Open in continuous editor
          </button>
        </div>
      </div>
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
      <div className="nf-page-scroll" ref={scrollRef} data-page-scroll="true">
        <div className="nf-page-stage" data-page-stage="true">
          <div
            className="nf-page-sheet-wrap"
            style={{ zoom: effectiveZoom }}
            data-page-zoom={Math.round(effectiveZoom * 100)}
          >
            <PageSurface
              page={showPlaceholder ? null : page}
              pageNumber={showPlaceholder ? 1 : pageNumber}
              pageCount={showPlaceholder ? 1 : pageCount}
              documentTitle={documentTitle}
              chapterTitle={chapterTitle}
              geometry={geometry}
              runtime={runtime}
              blocking={showPlaceholder ? [] : pageBlocking}
              edges={showPlaceholder ? [] : pageEdges}
              trunks={showPlaceholder ? [] : pageTrunks}
            >
              {showPlaceholder ? (
                placeholder
              ) : (
                <>
                  {(page?.fragments ?? []).map((fragment) => (
                    <PageFragmentView
                      key={`${fragment.blockId}-${fragment.startSegment}-${fragment.page.y.toFixed(2)}`}
                      runtime={runtime}
                      fragment={fragment}
                      page={page as DerivedPage}
                      segments={segmentsByBlock[fragment.blockId] ?? []}
                      selected={selectedBlockId === fragment.blockId}
                      blocking={blocking.filter((defect) => defect.blockId === fragment.blockId)}
                      anchorWarnings={
                        fragment.isFirst ? anchorWarnings.get(fragment.blockId) ?? [] : []
                      }
                      editingEnabled={pageEditing}
                      onSelect={selectBlock}
                      onEdit={editBlock}
                      onOpen={openBlockInContinuous}
                    />
                  ))}
                </>
              )}
            </PageSurface>
            {editSession !== null && pageEditing ? (
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
        </div>
      </div>
    </div>
  );
}
