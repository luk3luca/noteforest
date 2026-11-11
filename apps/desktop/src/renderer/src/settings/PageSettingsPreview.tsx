/**
 * Live Page preview for Settings (Batch B).
 *
 * The preview is not a skeleton and does not have its own paginator: it mounts
 * the same `usePageModel` measurement/layout/paginate pipeline as Page Read,
 * with the draft setup/theme and the active scope. The first derived page is
 * rendered with the same projection, CSS variables, chrome, fragment markup,
 * and edge mapper. Invalid margins keep the last valid model visible and show
 * an explicit paused state; no document shows a clearly labelled sample.
 */

import { useMemo, type CSSProperties, type ReactNode } from 'react';
import type {
  DerivedPage,
  PageEdgeModel,
  PageFragment,
  PageGeometry,
  PageSettings,
} from '@noteforest/layout';
import { buildPageEdgeModel, pageCssVariables } from '@noteforest/layout';
import type { DocumentRuntime } from '../state/runtime';
import { corePageGeometry } from '../page/adapter';
import { PageChromeView } from '../page/PageChromeView';
import { PageSurface } from '../page/PageView';
import { PageEdges } from '../page/PageEdges';
import { emptyPageChrome, projectPageContent } from '../page/projection';
import {
  contentWrapperHtml,
  labelHtml,
  type PageContentBlock,
  type PageRenderSegment,
} from '../page/segments';
import { usePageModel } from '../page/usePageModel';
import { formatMm, MARGIN_KEYS } from './page-setup';

interface PageSettingsPreviewProps {
  runtime: DocumentRuntime | null;
  settings: PageSettings;
  invalid: boolean;
  scopeLabel: string;
}

const PREVIEW_MAX_WIDTH = 218;
const PREVIEW_MAX_HEIGHT = 230;

function previewScale(geometry: PageGeometry): number {
  return Math.min(
    PREVIEW_MAX_WIDTH / geometry.pageWidthPx,
    PREVIEW_MAX_HEIGHT / geometry.pageHeightPx,
    1,
  );
}

function PreviewFrame({
  geometry,
  children,
}: {
  geometry: PageGeometry;
  children: ReactNode;
}): JSX.Element {
  const scale = previewScale(geometry);
  return (
    <div className="nf-settings-preview-stage" aria-hidden="true">
      <div
        className="nf-settings-preview-frame"
        style={{
          width: `${geometry.pageWidthPx * scale}px`,
          height: `${geometry.pageHeightPx * scale}px`,
        }}
      >
        <div
          className="nf-settings-preview-zoom"
          style={{ transform: `scale(${scale})` }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function summaryOf(settings: PageSettings, pageCount: number | null): string {
  const margins = MARGIN_KEYS.map((key) => formatMm(settings.setup.margins[key])).join(
    ' / ',
  );
  const pages = pageCount === null ? '' : ` · ${pageCount} ${pageCount === 1 ? 'page' : 'pages'}`;
  return `${settings.setup.size} ${settings.setup.orientation} · ${margins} mm margins · ${Math.round(
    settings.theme.density * 100,
  )}% density${pages}`;
}

function PreviewOverlay({ invalid }: { invalid: boolean }): JSX.Element | null {
  if (!invalid) return null;
  return (
    <div className="nf-settings-preview-overlay" data-page-preview-invalid="true">
      <p>Preview paused</p>
      <span>Fix the highlighted values to update the page.</span>
    </div>
  );
}

function SamplePreview({
  settings,
  invalid,
}: {
  settings: PageSettings;
  invalid: boolean;
}): JSX.Element {
  const geometry = useMemo(() => corePageGeometry(settings), [settings]);
  const css = pageCssVariables(settings.theme) as CSSProperties;
  // The no-document sample uses the exact same chrome projection as Page Read,
  // so a header/footer/page-number change is visible immediately.
  const chrome = useMemo(
    () =>
      emptyPageChrome({
        geometry,
        documentTitle: 'Sample page',
        chapterTitle: 'Page geometry preview',
        pageNumber: 1,
        pageCount: 1,
        chrome: settings.chrome,
      }),
    [geometry, settings.chrome],
  );
  return (
    <>
      <div className="nf-settings-preview-stack">
        <PreviewFrame geometry={geometry}>
          <div
            className="nf-page-sheet nf-page-scope nf-settings-preview-sheet"
            style={{
              ...css,
              width: `${geometry.pageWidthPx}px`,
              height: `${geometry.pageHeightPx}px`,
            }}
            data-page-preview-sheet="true"
          >
            <PageChromeView chrome={chrome} />
            <div
              className="nf-page-content"
              style={{
                left: `${geometry.marginsPx.left}px`,
                top: `${geometry.marginsPx.top}px`,
                width: `${geometry.contentWidthPx}px`,
                height: `${geometry.contentHeightPx}px`,
              }}
            >
              <div className="nf-settings-preview-sample">
                <strong>Sample page</strong>
                <span>No document open. Global Page settings apply.</span>
              </div>
            </div>
          </div>
        </PreviewFrame>
        <PreviewOverlay invalid={invalid} />
      </div>
      <p className="nf-settings-preview-summary" data-page-preview-summary="true">
        {summaryOf(settings, null)}
      </p>
      <p className="nf-settings-help">Sample page: open a document for the real page count.</p>
    </>
  );
}

function EmptyDocumentPreview({
  runtime,
  settings,
  invalid,
}: {
  runtime: DocumentRuntime;
  settings: PageSettings;
  invalid: boolean;
}): JSX.Element {
  const geometry = useMemo(() => corePageGeometry(settings), [settings]);
  const css = pageCssVariables(settings.theme) as CSSProperties;
  return (
    <>
      <div className="nf-settings-preview-stack">
        <PreviewFrame geometry={geometry}>
          <div
            className="nf-page-sheet nf-page-scope nf-settings-preview-sheet"
            style={{
              ...css,
              width: `${geometry.pageWidthPx}px`,
              height: `${geometry.pageHeightPx}px`,
            }}
            data-page-preview-sheet="true"
          >
            <div
              className="nf-page-content"
              style={{
                left: `${geometry.marginsPx.left}px`,
                top: `${geometry.marginsPx.top}px`,
                width: `${geometry.contentWidthPx}px`,
                height: `${geometry.contentHeightPx}px`,
              }}
            >
              <div className="nf-settings-preview-sample">
                <strong>Nothing to paginate yet</strong>
                <span>{runtime.document.title}</span>
              </div>
            </div>
          </div>
        </PreviewFrame>
        <PreviewOverlay invalid={invalid} />
      </div>
      <p className="nf-settings-preview-summary" data-page-preview-summary="true">
        {summaryOf(settings, 0)}
      </p>
    </>
  );
}

function PreviewFragment({
  fragment,
  page,
  block,
  segments,
}: {
  fragment: PageFragment;
  page: DerivedPage;
  block: PageContentBlock | undefined;
  segments: readonly PageRenderSegment[];
}): JSX.Element {
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
        data-page-preview-fragment={fragment.blockId}
      >
        Missing block content
      </div>
    );
  }
  const start = Math.min(fragment.startSegment, segments.length);
  const end = Math.min(fragment.endSegment, segments.length);
  const html = `${fragment.isFirst ? labelHtml(block) : ''}${contentWrapperHtml(
    segments,
    start,
    end,
  )}`;
  return (
    <div
      className="nf-page-fragment"
      style={{
        left: fragment.page.x,
        top: fragment.page.y,
        width: fragment.page.width,
        height: fragment.page.height,
      }}
      data-page-preview-fragment={fragment.blockId}
      data-fragment-block={fragment.blockId}
      data-fragment-page={page.pageNumber}
      data-fragment-first={fragment.isFirst ? '1' : '0'}
    >
      <div
        className="nf-page-card nf-page-fragment-card"
        data-fragment-card="true"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

function DocumentPreview({
  runtime,
  settings,
  invalid,
  scopeLabel,
}: {
  runtime: DocumentRuntime;
  settings: PageSettings;
  invalid: boolean;
  scopeLabel: string;
}): JSX.Element {
  const model = usePageModel(runtime, true, settings);
  const geometry = useMemo(() => corePageGeometry(settings), [settings]);
  const displayAssets = useMemo(() => {
    const next: Record<string, string> = { ...model.assetUrls };
    for (const assetId of model.failedAssetIds) delete next[assetId];
    return next;
  }, [model.assetUrls, model.failedAssetIds]);
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
  const edgeModel = useMemo<PageEdgeModel>(() => {
    if (model.layout === null) return { edges: [], trunks: [] };
    return buildPageEdgeModel(model.layout, model.pages);
  }, [model.layout, model.pages]);

  const page = model.pages[0] ?? null;
  const projected = projection.pages[0] ?? null;
  const chrome =
    projected?.chrome ??
    emptyPageChrome({
      geometry,
      documentTitle: runtime.document.title,
      chapterTitle:
        page?.chapterTitle ?? (runtime.document.chapters[0]?.title?.trim() || 'Chapter 1'),
      pageNumber: 1,
      pageCount: Math.max(1, model.pages.length),
      chrome: settings.chrome,
    });

  const state = invalid
    ? 'invalid'
    : !model.ready
      ? 'loading'
      : model.error !== null
        ? 'error'
        : model.pages.length === 0
          ? 'empty'
          : 'ready';
  const css = pageCssVariables(settings.theme) as CSSProperties;
  const summary =
    invalid
      ? 'Preview paused — fix the highlighted values.'
      : state === 'loading'
        ? 'Measuring the page layout…'
        : state === 'error'
          ? `Page preview failed: ${model.error ?? 'unknown error'}`
          : summaryOf(settings, model.pages.length);

  if (state === 'empty') {
    return (
      <div
        className="nf-settings-preview"
        data-page-preview="true"
        data-page-preview-state="empty"
        data-page-preview-page-count="0"
        data-page-preview-size={settings.setup.size}
        data-page-preview-orientation={settings.setup.orientation}
        data-page-preview-density={Math.round(settings.theme.density * 100)}
        role="region"
        aria-label="Page preview"
      >
        <h4 className="nf-settings-preview-title">Preview</h4>
        <p className="nf-settings-preview-scope" data-page-preview-scope="true">
          {scopeLabel}
        </p>
        <EmptyDocumentPreview
          runtime={runtime}
          settings={settings}
          invalid={invalid}
        />
      </div>
    );
  }

  return (
    <div
      className="nf-settings-preview"
      data-page-preview="true"
      data-page-preview-state={state}
      data-page-preview-updating={model.updating ? 'true' : 'false'}
      data-page-preview-page-count={model.pages.length}
      data-page-preview-size={settings.setup.size}
      data-page-preview-orientation={settings.setup.orientation}
      data-page-preview-density={Math.round(settings.theme.density * 100)}
      style={css}
      role="region"
      aria-label="Page preview"
    >
      <h4 className="nf-settings-preview-title">Preview</h4>
      <p className="nf-settings-preview-scope" data-page-preview-scope="true">
        {scopeLabel}
      </p>
      <div className="nf-settings-preview-stack">
        <PreviewFrame geometry={geometry}>
          <PageSurface
            page={page}
            pageNumber={1}
            pageCount={Math.max(1, model.pages.length)}
            chrome={chrome}
            geometry={geometry}
            blocking={projected?.blocking ?? []}
            edges={model.layout === null ? [] : (edgeModel.edges[0] ?? [])}
            trunks={model.layout === null ? [] : (edgeModel.trunks[0] ?? [])}
          >
            {page === null ? (
              <div className="nf-settings-preview-placeholder">
                {state === 'loading' ? 'Measuring…' : 'Preview unavailable'}
              </div>
            ) : (
              <>
                <PageEdges
                  edges={edgeModel.edges[0] ?? []}
                  trunks={edgeModel.trunks[0] ?? []}
                  geometry={geometry}
                />
                {page.fragments.map((fragment) => (
                  <PreviewFragment
                    key={`${fragment.blockId}-${fragment.startSegment}-${fragment.page.y.toFixed(2)}`}
                    fragment={fragment}
                    page={page}
                    block={runtime.document.blocks[fragment.blockId]}
                    segments={projected?.segmentsByBlock[fragment.blockId] ?? []}
                  />
                ))}
              </>
            )}
          </PageSurface>
        </PreviewFrame>
        <PreviewOverlay invalid={invalid} />
      </div>
      <p
        className="nf-settings-preview-summary"
        data-page-preview-summary="true"
        aria-live="polite"
      >
        {summary}
      </p>
      {state === 'ready' && model.updating ? (
        <p className="nf-settings-help" data-page-preview-updating-note="true">
          Updating…
        </p>
      ) : null}
    </div>
  );
}

export function PageSettingsPreview({
  runtime,
  settings,
  invalid,
  scopeLabel,
}: PageSettingsPreviewProps): JSX.Element {
  if (runtime === null) {
    return (
      <div
        className="nf-settings-preview"
        data-page-preview="true"
        data-page-preview-state={invalid ? 'invalid' : 'sample'}
        role="region"
        aria-label="Page preview"
      >
        <h4 className="nf-settings-preview-title">Preview</h4>
        <p className="nf-settings-preview-scope" data-page-preview-scope="true">
          {scopeLabel}
        </p>
        <SamplePreview settings={settings} invalid={invalid} />
      </div>
    );
  }
  return (
    <DocumentPreview
      runtime={runtime}
      settings={settings}
      invalid={invalid}
      scopeLabel={scopeLabel}
    />
  );
}
